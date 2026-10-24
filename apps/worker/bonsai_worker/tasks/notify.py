"""Thông báo khi phiên xong: Web Push (mọi thiết bị đã đăng ký) và Zalo ZNS (nếu người dùng bật + có SĐT).

Chạy thành task riêng: gửi lỗi không ảnh hưởng pipeline. Thiếu cấu hình kênh nào thì bỏ qua kênh đó.
"""

from __future__ import annotations

import json
import logging
import os
import re
import uuid
from dataclasses import dataclass

import httpx
import redis

from bonsai_api.db.models import DesignJob, JobStatus, PushSubscription, Tree, User
from bonsai_api.db.session import get_sessionmaker

from ..celery_app import app

log = logging.getLogger(__name__)

ZALO_OA_TOKEN_URL = "https://oauth.zaloapp.com/v4/oa/access_token"
ZNS_URL = "https://business.openapi.zalo.me/message/template"


@dataclass(frozen=True)
class Message:
    event: str
    title: str
    body: str
    path: str


def message_for(job: DesignJob, tree_name: str) -> Message | None:
    """Chỉ báo những lúc người dùng cần quay lại app."""
    name = tree_name or "cây của bạn"
    if job.status == JobStatus.awaiting_choice:
        return Message("design_ready", "Bản vẽ đã xong", f"Phân tích {name} xong: có các phương án thế để bạn chọn.", f"/chon/{job.id}")
    if job.status == JobStatus.done:
        return Message("result_ready", "Ảnh tương lai đã xong", f"Ảnh và lộ trình chăm cho {name} đã sẵn sàng.", f"/ket-qua/{job.id}")
    if job.status == JobStatus.failed and job.chosen_option_id is not None:
        return Message("result_failed", "Tạo ảnh chưa thành công", f"Đã hoàn lượt cho bạn. Bạn có thể thử lại với {name}.", f"/ket-qua/{job.id}")
    if job.status == JobStatus.failed:
        return Message("analysis_failed", "Chưa phân tích được", f"Ảnh {name} chưa đủ rõ hoặc hệ thống đang bận. Mở app để xem cách khắc phục.", f"/phan-tich/{job.id}")
    return None


# ---------- Web Push ----------

def send_web_push(db, user_id: uuid.UUID, msg: Message, base_url: str) -> int:
    private_key, subject = os.environ.get("VAPID_PRIVATE_KEY"), os.environ.get("VAPID_SUBJECT", "mailto:admin@example.com")
    if not private_key:
        return 0
    from pywebpush import WebPushException, webpush

    payload = json.dumps({"title": msg.title, "body": msg.body, "url": base_url + msg.path, "tag": msg.event})
    sent = 0
    for sub in db.query(PushSubscription).filter(PushSubscription.user_id == user_id).all():
        try:
            webpush({"endpoint": sub.endpoint, "keys": {"p256dh": sub.p256dh, "auth": sub.auth}}, data=payload,
                    vapid_private_key=private_key, vapid_claims={"sub": subject}, ttl=86400, timeout=10)
            sent += 1
        except WebPushException as e:
            code = getattr(e.response, "status_code", None)
            if code in (404, 410):  # trình duyệt đã hủy đăng ký
                db.delete(sub)
            else:
                log.warning("web push failed (%s): %s", code, e)
    db.commit()
    return sent


# ---------- Zalo ZNS ----------

def normalize_phone(phone: str) -> str | None:
    digits = re.sub(r"\D", "", phone or "")
    if digits.startswith("84") and len(digits) == 11:
        return digits
    if digits.startswith("0") and len(digits) == 10:
        return "84" + digits[1:]
    return None


def zalo_access_token(r: redis.Redis, http: httpx.Client) -> str | None:
    """Access token OA hết hạn ~25 giờ; refresh token đổi mới mỗi lần dùng → lưu bản mới nhất trong Redis."""
    if (cached := r.get("zalo:oa:access_token")):
        return cached.decode()
    app_id, secret = os.environ.get("ZALO_OA_APP_ID"), os.environ.get("ZALO_OA_SECRET_KEY")
    refresh = (r.get("zalo:oa:refresh_token") or b"").decode() or os.environ.get("ZALO_OA_REFRESH_TOKEN")
    if not (app_id and secret and refresh):
        return None
    resp = http.post(ZALO_OA_TOKEN_URL, headers={"secret_key": secret},
                     data={"app_id": app_id, "refresh_token": refresh, "grant_type": "refresh_token"})
    body = resp.json() if resp.status_code == 200 else {}
    token = body.get("access_token")
    if not token:
        log.error("zalo OA token refresh failed: %s", body or resp.status_code)
        return None
    r.set("zalo:oa:refresh_token", body["refresh_token"])
    r.set("zalo:oa:access_token", token, ex=max(60, int(body.get("expires_in", 3600)) - 120))
    return token


def send_zalo(user: User, msg: Message, base_url: str, r: redis.Redis, http: httpx.Client) -> bool:
    template_id = os.environ.get(f"ZNS_TEMPLATE_{msg.event.upper()}")
    phone = normalize_phone(user.phone or "")
    if not (user.notify_zalo and phone and template_id):
        return False
    token = zalo_access_token(r, http)
    if not token:
        return False
    # Tham số phải trùng tên tham số khi đăng ký mẫu ZNS (docs/beta-checklist.md).
    data = {"customer_name": (user.name or "bạn")[:30], "message": msg.body[:90], "link": (base_url + msg.path)[:200]}
    resp = http.post(ZNS_URL, headers={"access_token": token, "Content-Type": "application/json"},
                     json={"phone": phone, "template_id": template_id, "template_data": data, "tracking_id": msg.event})
    ok = resp.status_code == 200 and resp.json().get("error") == 0
    if not ok:
        log.warning("ZNS failed: %s", resp.text[:300])
    return ok


@app.task(name="bonsai_worker.tasks.notify.job_event")
def job_event(job_id: str) -> dict:
    base_url = os.environ.get("PUBLIC_BASE_URL", "http://localhost:8080").rstrip("/")
    with get_sessionmaker()() as db:
        job = db.get(DesignJob, uuid.UUID(job_id))
        user = db.get(User, job.user_id) if job else None
        if job is None or user is None or user.deleted_at is not None:
            return {"sent": False}
        tree = db.get(Tree, job.tree_id)
        msg = message_for(job, tree.nickname if tree else "")
        if msg is None:
            return {"sent": False}
        pushed = send_web_push(db, user.id, msg, base_url)
        zalo = False
        if user.notify_zalo:
            r = redis.Redis.from_url(os.environ.get("REDIS_URL", "redis://localhost:6379/0"))
            with httpx.Client(timeout=10) as http:
                try:
                    zalo = send_zalo(user, msg, base_url, r, http)
                except (httpx.HTTPError, redis.RedisError, ValueError):
                    log.exception("zalo notify failed")
    return {"event": msg.event, "web_push": pushed, "zalo": zalo}


# ---------- gửi hàng loạt (admin → Gửi thông báo) ----------

@app.task(name="bonsai_worker.tasks.notify.broadcast")
def broadcast(segment: str, title: str, body: str, path: str = "/") -> dict:
    """Chỉ Web Push (Zalo ZNS chỉ cho tin giao dịch theo mẫu đã duyệt, không dùng để quảng bá)."""
    from bonsai_api.services.broadcast import segment_users

    base_url = os.environ.get("PUBLIC_BASE_URL", "http://localhost:8080").rstrip("/")
    msg = Message("broadcast", title, body, path)
    users = sent = 0
    with get_sessionmaker()() as db:
        for (uid,) in db.execute(segment_users(segment)).all():
            users += 1
            try:
                sent += send_web_push(db, uid, msg, base_url)
            except Exception:  # một thiết bị lỗi không dừng cả đợt
                log.exception("broadcast push failed for %s", uid)
    log.info("broadcast %s: %d users, %d devices", segment, users, sent)
    return {"users": users, "devices": sent}
