from sqlalchemy import select

from bonsai_api.db.models import CreditLedger, User
from bonsai_api.settings import get_settings


def test_consent_and_zalo_flags(client, login):
    headers, _ = login()
    r = client.patch("/api/v1/me", headers=headers, json={"consent_training": True})
    assert r.json()["consent_training"] is True
    assert client.patch("/api/v1/me", headers=headers, json={"notify_zalo": True}).status_code == 400  # chưa có SĐT
    client.patch("/api/v1/me", headers=headers, json={"phone": "0909123456"})
    assert client.patch("/api/v1/me", headers=headers, json={"notify_zalo": True}).json()["notify_zalo"] is True


def test_soft_delete_keeps_data_and_blocks_login(db, client, login, monkeypatch):
    headers, body = login()
    assert client.request("DELETE", "/api/v1/me", headers=headers, json={"confirm": False}).status_code == 400
    assert client.request("DELETE", "/api/v1/me", headers=headers, json={"confirm": True}).status_code == 204
    assert client.get("/api/v1/me", headers=headers).status_code == 401  # token cũ mất hiệu lực
    r = client.post("/api/v1/auth/dev", json={"email": "nhavuon@example.com"})
    assert r.status_code == 403 and "đã bị xóa" in r.json()["detail"]
    user = db.execute(select(User).where(User.email == "nhavuon@example.com")).scalar_one()
    assert user.deleted_at is not None
    assert db.execute(select(CreditLedger).where(CreditLedger.user_id == user.id)).scalars().all()  # vẫn giữ

    monkeypatch.setattr(get_settings(), "admin_emails", ["boss@example.com"])
    admin, _ = login("boss@example.com")
    assert client.post("/api/v1/admin/users/restore", headers=admin, json={"email": "nhavuon@example.com"}).json()["restored"]
    assert client.post("/api/v1/auth/dev", json={"email": "nhavuon@example.com"}).status_code == 200


def test_push_subscriptions(db, client, login, monkeypatch):
    from bonsai_api.db.models import PushSubscription

    assert client.get("/api/v1/push/config").json() == {"enabled": False, "public_key": None}
    monkeypatch.setattr(get_settings(), "vapid_public_key", "BPub")
    assert client.get("/api/v1/push/config").json()["enabled"] is True

    a, _ = login("a@x.vn")
    b, _ = login("b@x.vn")
    sub = {"endpoint": "https://fcm.googleapis.com/fcm/send/abc", "keys": {"p256dh": "p", "auth": "s"}}
    assert client.post("/api/v1/push/subscriptions", headers=a, json=sub).status_code == 204
    assert client.post("/api/v1/push/subscriptions", headers=b, json=sub).status_code == 204  # cùng máy, tài khoản khác
    rows = db.execute(select(PushSubscription)).scalars().all()
    assert len(rows) == 1 and db.get(User, rows[0].user_id).email == "b@x.vn"
    assert client.post("/api/v1/push/subscriptions", headers=a, json={**sub, "endpoint": "http://evil"}).status_code == 422
    client.request("DELETE", "/api/v1/push/subscriptions", headers=b, json={"endpoint": sub["endpoint"]})
    db.expire_all()
    assert db.execute(select(PushSubscription)).scalars().all() == []


def test_deleted_owner_hides_share_page(db, client, login, monkeypatch):
    from bonsai_api.db.models import DesignJob, JobStatus

    headers, body = login()
    key = client.post("/api/v1/uploads/presign", headers=headers, json={"content_type": "image/jpeg", "size_bytes": 10}).json()["key"]
    tree = client.post("/api/v1/trees", headers=headers, json={"photos": [{"key": key, "view_index": 0}]}).json()
    job = client.post(f"/api/v1/trees/{tree['id']}/jobs", headers=headers, json={}).json()
    j = db.get(DesignJob, __import__("uuid").UUID(job["id"]))
    j.status, j.share_code = JobStatus.done, "abc12345"
    db.commit()
    monkeypatch.setattr("bonsai_api.routers.share.public_keys", lambda job: {"9x16": "k", "1x1": "k"})
    assert client.get("/s/abc12345").status_code == 200
    client.request("DELETE", "/api/v1/me", headers=headers, json={"confirm": True})
    assert client.get("/s/abc12345").status_code == 404
