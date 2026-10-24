"""Nhắc việc theo lộ trình và gửi thông báo hàng loạt."""

import uuid
from datetime import UTC, date, datetime

from bonsai_api.db.models import DesignJob, JobStatus, PushSubscription, Stage, User
from bonsai_worker.tasks import notify, reminders
from bonsai_worker.tasks.reminders import due_reminders

from test_phase_a import _job, bucket  # noqa: F401


def _stages(db, job):
    out = {}
    for code, when in [("S1", "Sau buổi tạo khung"), ("S2", "Khoảng 1 năm"), ("S3", "Khoảng 3 năm"), ("S4", "Khoảng 4 năm")]:
        st = Stage(job_id=job.id, code=code, time_from_start=when, guide_vi={"title_vi": f"GĐ {code}", "actions_vi": [f"Việc {code}"]})
        db.add(st)
        out[code] = st
    job.status, job.finished_at = JobStatus.done, datetime(2026, 1, 10, 3, tzinfo=UTC)
    db.commit()
    return out


def test_due_reminders_windows(db, login, bucket):  # noqa: F811
    _, _, job = _job(db, login, bucket)
    st = _stages(db, job)
    assert due_reminders(job, st, date(2026, 6, 1)) == []
    assert [k for k, *_ in due_reminders(job, st, date(2026, 1, 31))] == ["wire3"]  # 3 tuần sau tạo khung
    items = due_reminders(job, st, date(2027, 1, 12))  # S2 đến hạn 10/01/2027, trong 3 ngày bù
    assert items == [("S2", "Đến giai đoạn: GĐ S2", "Việc S2")]
    assert due_reminders(job, st, date(2027, 1, 20)) == []  # quá hạn lâu → không nhắc việc cũ
    st["S2"].plan = {"reminded_at": "x"}
    assert due_reminders(job, st, date(2027, 1, 11)) == []


def test_stage_due_task_sends_once(db, login, bucket, monkeypatch):  # noqa: F811
    user, _, job = _job(db, login, bucket)
    _stages(db, job)
    db.add(PushSubscription(user_id=user.id, endpoint="https://push/1", p256dh="k", auth="a"))
    db.commit()
    sent = []
    monkeypatch.setattr(reminders, "send_web_push", lambda db_, uid, msg, base: sent.append((uid, msg)) or 1)
    monkeypatch.setattr(reminders, "datetime", type("D", (), {"now": staticmethod(lambda tz=None: datetime(2027, 1, 11, 2, tzinfo=UTC))}))
    assert reminders.stage_due.run() == {"devices": 1}
    assert sent[0][1].title == "Đến giai đoạn: GĐ S2" and sent[0][1].path == f"/ket-qua/{job.id}"
    assert reminders.stage_due.run() == {"devices": 0}  # không nhắc lại
    db.expire_all()
    assert db.get(DesignJob, job.id).status == JobStatus.done


def test_broadcast_task(db, login, bucket, monkeypatch):  # noqa: F811
    user, _, _ = _job(db, login, bucket)
    db.add(PushSubscription(user_id=user.id, endpoint="https://push/2", p256dh="k", auth="a"))
    other = User(auth_provider="dev", email="no-push@x.vn")
    db.add(other)
    db.commit()
    got = []
    monkeypatch.setattr(notify, "send_web_push", lambda db_, uid, msg, base: got.append(uid) or 2)
    assert notify.broadcast.run("all", "Tiêu đề", "Nội dung", "/vuon") == {"users": 1, "devices": 2}
    assert got == [user.id] and uuid.UUID(str(got[0]))
