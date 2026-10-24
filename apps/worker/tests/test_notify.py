import json
import uuid

import httpx
import pytest

from bonsai_api.db.models import DesignJob, JobStatus, PushSubscription, Tree, User
from bonsai_worker.scripts.gen_vapid import generate
from bonsai_worker.tasks import notify


def _setup(db, login, status=JobStatus.awaiting_choice, chosen=False, phone=None, zalo=False):
    _, body = login()
    user = db.get(User, uuid.UUID(body["user"]["id"]))
    user.phone, user.notify_zalo = phone, zalo
    tree = Tree(user_id=user.id, nickname="Si sân sau")
    db.add(tree)
    db.flush()
    job = DesignJob(tree_id=tree.id, user_id=user.id, status=status)
    db.add(job)
    db.commit()
    return user, job


def test_messages():
    j = DesignJob(id=uuid.uuid4(), status=JobStatus.done)
    assert notify.message_for(j, "Si").path == f"/ket-qua/{j.id}"
    j.status = JobStatus.failed
    assert notify.message_for(j, "Si").event == "analysis_failed"
    j.chosen_option_id = uuid.uuid4()
    assert "hoàn lượt" in notify.message_for(j, "Si").body
    j.status = JobStatus.analyzing
    assert notify.message_for(j, "Si") is None


def test_normalize_phone():
    assert notify.normalize_phone("0909 123 456") == "84909123456"
    assert notify.normalize_phone("+84 909123456") == "84909123456"
    assert notify.normalize_phone("123") is None


def test_vapid_keys_are_usable():
    from py_vapid import Vapid02

    pub, priv = generate()
    assert len(pub) == 87  # 65 byte, base64url không đệm
    assert Vapid02.from_string(private_key=priv).public_key is not None


def test_web_push_sends_and_prunes_dead_subscriptions(db, login, monkeypatch):
    user, job = _setup(db, login)
    db.add_all([PushSubscription(user_id=user.id, endpoint="https://push.example/a", p256dh="p", auth="a"),
                PushSubscription(user_id=user.id, endpoint="https://push.example/gone", p256dh="p", auth="a")])
    db.commit()
    import pywebpush

    sent = []

    def fake_webpush(info, data, **kw):
        if info["endpoint"].endswith("gone"):
            raise pywebpush.WebPushException("gone", response=httpx.Response(410))
        sent.append(json.loads(data))

    monkeypatch.setattr(pywebpush, "webpush", fake_webpush)
    monkeypatch.setenv("VAPID_PRIVATE_KEY", generate()[1])
    msg = notify.message_for(job, "Si sân sau")
    assert notify.send_web_push(db, user.id, msg, "https://bonsai.vn") == 1
    assert sent[0]["url"] == f"https://bonsai.vn/chon/{job.id}" and sent[0]["title"] == "Bản vẽ đã xong"
    assert [s.endpoint for s in db.query(PushSubscription).all()] == ["https://push.example/a"]


def test_web_push_skipped_without_key(db, login, monkeypatch):
    user, job = _setup(db, login)
    monkeypatch.delenv("VAPID_PRIVATE_KEY", raising=False)
    assert notify.send_web_push(db, user.id, notify.message_for(job, ""), "x") == 0


class FakeRedis:
    def __init__(self):
        self.d = {}

    def get(self, k):
        return self.d.get(k)

    def set(self, k, v, ex=None):
        self.d[k] = v.encode() if isinstance(v, str) else v


def test_zalo_zns_refreshes_token_and_sends(db, login, monkeypatch):
    user, job = _setup(db, login, status=JobStatus.done, phone="0909123456", zalo=True)
    monkeypatch.setenv("ZALO_OA_APP_ID", "app")
    monkeypatch.setenv("ZALO_OA_SECRET_KEY", "secret")
    monkeypatch.setenv("ZALO_OA_REFRESH_TOKEN", "r1")
    monkeypatch.setenv("ZNS_TEMPLATE_RESULT_READY", "tpl-1")
    calls = []

    def handler(req: httpx.Request):
        calls.append(req)
        if "oauth.zaloapp.com" in str(req.url):
            assert b"refresh_token=r1" in req.content and req.headers["secret_key"] == "secret"
            return httpx.Response(200, json={"access_token": "at", "refresh_token": "r2", "expires_in": "90000"})
        body = json.loads(req.content)
        assert req.headers["access_token"] == "at" and body["phone"] == "84909123456" and body["template_id"] == "tpl-1"
        return httpx.Response(200, json={"error": 0, "message": "Success"})

    r = FakeRedis()
    http = httpx.Client(transport=httpx.MockTransport(handler))
    msg = notify.message_for(job, "Si")
    assert notify.send_zalo(user, msg, "https://bonsai.vn", r, http)
    assert r.get("zalo:oa:refresh_token") == b"r2"  # lưu refresh token mới
    assert notify.send_zalo(user, msg, "https://bonsai.vn", r, http)
    assert sum("oauth" in str(c.url) for c in calls) == 1  # lần 2 dùng token đã lưu


def test_zalo_skipped_without_template_or_optin(db, login):
    user, job = _setup(db, login, status=JobStatus.done, phone="0909123456", zalo=False)
    assert not notify.send_zalo(user, notify.message_for(job, "Si"), "x", FakeRedis(), httpx.Client())


def test_job_event_task(db, login, monkeypatch):
    user, job = _setup(db, login, status=JobStatus.done)
    monkeypatch.setattr(notify, "send_web_push", lambda db, uid, msg, base: 2)
    assert notify.job_event.run(str(job.id)) == {"event": "result_ready", "web_push": 2, "zalo": False}
    user.deleted_at = __import__("datetime").datetime.now(__import__("datetime").UTC)
    db.commit()
    assert notify.job_event.run(str(job.id)) == {"sent": False}


def test_user_message_sends_push(db, login, monkeypatch):
    import uuid

    from bonsai_worker.tasks import notify as n

    sent = []
    monkeypatch.setattr(n, "send_web_push", lambda db, uid, msg, base: sent.append((uid, msg.event, msg.path)) or 1)

    class _Ctx:
        def __enter__(self):
            return db

        def __exit__(self, *a):
            return False

    monkeypatch.setattr(n, "get_sessionmaker", lambda: (lambda: _Ctx()))
    _, body = login()
    uid = body["user"]["id"]
    assert n.user_message(uid, "consult_answered", "Nghệ nhân đã trả lời", "Ổn", "/hoi-nghe-nhan/x") == 1
    assert sent == [(uuid.UUID(uid), "consult_answered", "/hoi-nghe-nhan/x")]
