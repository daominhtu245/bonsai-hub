"""Hỏi nghệ nhân (docs/ideas.md D1): câu hỏi quá hạn chưa có trả lời → tự hoàn lượt cho người hỏi."""

from __future__ import annotations

import logging
import os
from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from bonsai_api.db.models import Consult, CreditReason
from bonsai_api.db.session import get_sessionmaker
from bonsai_api.services.credits import apply_credit

from ..celery_app import app
from .notify import Message, send_web_push

log = logging.getLogger(__name__)
ANSWER_WITHIN = timedelta(hours=72)


def refund_overdue(db, now: datetime | None = None) -> int:
    now = now or datetime.now(UTC)
    n = 0
    for c in db.execute(select(Consult).where(Consult.status == "open", Consult.created_at < now - ANSWER_WITHIN)
                        .with_for_update(skip_locked=True)).scalars():
        apply_credit(db, c.user_id, c.credits, CreditReason.refund, f"consult:{c.id}")
        c.status = "refunded"
        db.commit()
        n += 1
        try:
            send_web_push(db, c.user_id, Message("consult_refunded", "Đã hoàn lượt hỏi nghệ nhân",
                                                 "Chưa có nghệ nhân trả lời kịp trong 3 ngày. Bạn có thể hỏi lại.", f"/hoi-nghe-nhan/{c.id}"),
                          os.environ.get("PUBLIC_BASE_URL", "http://localhost:8080").rstrip("/"))
            db.commit()
        except Exception:  # noqa: BLE001 — gửi lỗi không ảnh hưởng hoàn lượt
            log.exception("push failed for consult %s", c.id)
    return n


@app.task(name="bonsai_worker.tasks.consults.refund_overdue")
def refund_overdue_task() -> int:
    with get_sessionmaker()() as db:
        return refund_overdue(db)
