"""Nhắc việc theo lộ trình: mỗi sáng kiểm tra các kết quả đã xong, giai đoạn nào đến hạn (theo lịch chăm sóc) thì
gửi Web Push một lần. Ngày đến hạn tính như file lịch (bonsai_api/services/care_calendar.py)."""

from __future__ import annotations

import logging
import os
from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select

from bonsai_api.db.models import DesignJob, JobStatus, PushSubscription, Stage, Tree, User
from bonsai_api.db.session import get_sessionmaker
from bonsai_api.services.care_calendar import DEFAULT_MONTHS, WIRE_CHECK_WEEKS, add_months, months_from_text

from ..celery_app import app
from .notify import Message, send_web_push

log = logging.getLogger(__name__)
VN_TZ = ZoneInfo("Asia/Ho_Chi_Minh")
GRACE_DAYS = 3  # worker nghỉ vài ngày vẫn nhắc bù, không nhắc việc quá cũ


def due_reminders(job: DesignJob, stages: dict[str, Stage], today: date) -> list[tuple[str, str, str]]:
    """(khóa, tiêu đề, nội dung) cho các mốc đến hạn hôm nay (hoặc ≤ GRACE_DAYS ngày trước) và chưa nhắc."""
    start = (job.finished_at or job.created_at).astimezone(VN_TZ).date()
    years = ((job.progress or {}).get("result") or {}).get("years") or 5
    out = []
    for code in ("S2", "S3", "S4"):
        st = stages.get(code)
        if st is None or (st.plan or {}).get("reminded_at"):
            continue
        fallback = years * 12 if code == "S4" else DEFAULT_MONTHS[code]
        due = add_months(start, months_from_text(st.time_from_start, fallback))
        if due <= today <= due + timedelta(days=GRACE_DAYS):
            guide = st.guide_vi or {}
            first = (guide.get("actions_vi") or [""])[0]
            title = f"Đến giai đoạn: {guide.get('title_vi') or code}"
            out.append((code, title, first or "Mở app để xem việc cần làm."))
    s1 = stages.get("S1")
    if s1 is not None:
        done = set((s1.plan or {}).get("wire_reminded") or [])
        for w in WIRE_CHECK_WEEKS:
            due = start + timedelta(weeks=w)
            if str(w) not in done and due <= today <= due + timedelta(days=GRACE_DAYS):
                out.append((f"wire{w}", "Kiểm tra dây uốn", "Dây hằn vào vỏ thì tháo ngay, uốn lại nếu cành chưa giữ dáng."))
    return out


@app.task(name="bonsai_worker.tasks.reminders.stage_due")
def stage_due() -> dict:
    base_url = os.environ.get("PUBLIC_BASE_URL", "http://localhost:8080").rstrip("/")
    today = datetime.now(UTC).astimezone(VN_TZ).date()
    sent = 0
    with get_sessionmaker()() as db:
        jobs = db.execute(
            select(DesignJob).join(User, User.id == DesignJob.user_id)
            .where(DesignJob.status == JobStatus.done, User.deleted_at.is_(None),
                   User.id.in_(select(PushSubscription.user_id)))
        ).scalars().all()
        for job in jobs:
            stages = {s.code: s for s in db.execute(select(Stage).where(Stage.job_id == job.id)).scalars()}
            items = due_reminders(job, stages, today)
            if not items:
                continue
            tree = db.get(Tree, job.tree_id)
            name = (tree.nickname if tree and tree.nickname else "cây của bạn")
            for key, title, body in items:
                msg = Message("stage_due", title, f"{name}: {body}", f"/ket-qua/{job.id}")
                sent += send_web_push(db, job.user_id, msg, base_url)
                if key.startswith("wire"):
                    s1 = stages["S1"]
                    s1.plan = {**(s1.plan or {}), "wire_reminded": [*((s1.plan or {}).get("wire_reminded") or []), key[4:]]}
                else:
                    st = stages[key]
                    st.plan = {**(st.plan or {}), "reminded_at": datetime.now(UTC).isoformat()}
            db.commit()
    log.info("stage reminders sent to %d devices", sent)
    return {"devices": sent}
