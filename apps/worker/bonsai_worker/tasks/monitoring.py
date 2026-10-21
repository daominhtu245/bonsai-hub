"""Cảnh báo Telegram (docs/architecture.md §7): lỗi > 10%/giờ, chi phí ngày vượt ngưỡng, hàng đợi > 50.

Chạy mỗi 10 phút bằng Celery beat. Mỗi loại cảnh báo gửi tối đa 1 lần/giờ (khóa trong Redis).
"""

from __future__ import annotations

import logging
import os
from datetime import UTC, datetime, time, timedelta
from zoneinfo import ZoneInfo

import httpx
import redis
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from bonsai_api.db.models import DesignJob, JobStatus, PipelineStep
from bonsai_api.db.session import get_sessionmaker

from ..celery_app import app

log = logging.getLogger(__name__)
VN_TZ = ZoneInfo("Asia/Ho_Chi_Minh")

ERROR_RATE_MAX = 0.10
ERROR_RATE_MIN_JOBS = 5
QUEUE_MAX = 50
QUEUES = ("celery", "render")


def _cfg(name: str, default: str | None = None) -> str | None:
    return os.environ.get(name) or default


def error_rate_last_hour(db: Session, now: datetime) -> tuple[int, int]:
    since = now - timedelta(hours=1)
    total = db.execute(select(func.count()).select_from(DesignJob).where(DesignJob.created_at >= since)).scalar_one()
    failed = db.execute(select(func.count()).select_from(DesignJob).where(
        DesignJob.created_at >= since, DesignJob.status == JobStatus.failed,
        # ảnh không dùng được là lỗi của người dùng, không phải của hệ thống
        DesignJob.error_code.is_distinct_from("unusable_photo"),
    )).scalar_one()
    return failed, total


def cost_today(db: Session, now: datetime) -> float:
    start = datetime.combine(now.astimezone(VN_TZ).date(), time.min, tzinfo=VN_TZ)
    return float(db.execute(select(func.coalesce(func.sum(PipelineStep.cost_usd), 0)).where(PipelineStep.created_at >= start)).scalar_one())


def collect_alerts(db: Session, queue_len: int, now: datetime, daily_budget: float) -> dict[str, str]:
    alerts = {}
    failed, total = error_rate_last_hour(db, now)
    if total >= ERROR_RATE_MIN_JOBS and failed / total > ERROR_RATE_MAX:
        alerts["error_rate"] = f"Tỉ lệ lỗi 1 giờ qua: {failed}/{total} phiên ({failed / total:.0%}) > {ERROR_RATE_MAX:.0%}"
    cost = cost_today(db, now)
    if cost > daily_budget:
        alerts["daily_cost"] = f"Chi phí AI hôm nay ${cost:.2f} vượt ngưỡng ${daily_budget:.2f}"
    if queue_len > QUEUE_MAX:
        alerts["queue"] = f"Hàng đợi đang có {queue_len} việc (> {QUEUE_MAX})"
    return alerts


def send_telegram(text: str, *, client: httpx.Client | None = None) -> bool:
    token, chat = _cfg("TELEGRAM_BOT_TOKEN"), _cfg("TELEGRAM_CHAT_ID")
    if not (token and chat):
        log.warning("telegram not configured; alert: %s", text)
        return False
    http = client or httpx.Client(timeout=10)
    try:
        r = http.post(f"https://api.telegram.org/bot{token}/sendMessage", json={"chat_id": chat, "text": text})
        return r.status_code == 200
    except httpx.HTTPError:
        log.exception("telegram send failed")
        return False
    finally:
        if client is None:
            http.close()


@app.task(name="bonsai_worker.tasks.monitoring.check")
def check() -> dict:
    r = redis.Redis.from_url(_cfg("REDIS_URL", "redis://localhost:6379/0"))
    queue_len = sum(r.llen(q) for q in QUEUES)
    budget = float(_cfg("DAILY_COST_ALERT_USD", "20"))
    env = _cfg("APP_ENV", "dev")
    with get_sessionmaker()() as db:
        alerts = collect_alerts(db, queue_len, datetime.now(UTC), budget)
    sent = []
    for kind, msg in alerts.items():
        if r.set(f"alert:{kind}", "1", nx=True, ex=3600):  # 1 lần/giờ mỗi loại
            if send_telegram(f"⚠️ Bonsai AI [{env}] {msg}"):
                sent.append(kind)
    return {"alerts": list(alerts), "sent": sent, "queue": queue_len}
