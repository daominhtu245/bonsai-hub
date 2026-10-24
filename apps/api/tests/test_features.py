"""Bật / tắt tính năng + quản trị nội dung cộng đồng."""

import uuid
from datetime import UTC, datetime, timedelta

from bonsai_api.db.models import Consult, Listing, User, UserRole

from test_week5 import _done_job, bucket  # noqa: F401 (fixture)


def _role(db, body, role):
    db.get(User, uuid.UUID(body["user"]["id"])).role = role
    db.commit()


def test_feature_flags_gate_api_and_ui(db, client, login):
    admin, ab = login("admin@example.com")
    _role(db, ab, UserRole.admin)
    user, _ = login("u@example.com")
    tester, _ = login("tester@example.com")
    assert client.get("/api/v1/features").json()["market"] is True  # khách chưa đăng nhập: mặc định mở
    assert client.get("/api/v1/public/listings").status_code == 200

    r = client.put("/api/v1/admin/features", headers=admin, json={"flags": {"market": "staff", "weather": "off", "nope": "off"}, "testers": [" Tester@Example.com "]})
    items = {i["key"]: i for i in r.json()["items"]}
    assert items["market"]["state"] == "staff" and items["weather"]["state"] == "off" and r.json()["testers"] == ["tester@example.com"]
    assert "nope" not in items and items["market"]["usage_30d"] == 0
    assert client.put("/api/v1/admin/features", headers=user, json={"flags": {"market": "on"}}).status_code == 403

    assert client.get("/api/v1/features", headers=user).json()["market"] is False
    assert client.get("/api/v1/public/listings", headers=user).status_code == 403
    assert client.get("/api/v1/public/listings").status_code == 403  # khách
    assert client.get("/api/v1/features", headers=tester).json()["market"] is True  # người thử
    assert client.get("/api/v1/public/listings", headers=tester).status_code == 200
    assert client.get("/api/v1/public/listings", headers=admin).status_code == 200
    assert client.get("/api/v1/tools/weather?province=hue", headers=admin).status_code == 403  # tắt hẳn: cả quản trị


def test_art_open_if_worksheet_open(db, client, login, bucket):  # noqa: F811
    headers, job = _done_job(db, client, login, bucket)
    admin, ab = login("admin@example.com")
    _role(db, ab, UserRole.admin)
    client.put("/api/v1/admin/features", headers=admin, json={"flags": {"art_styles": "off"}})
    assert client.get(f"/api/v1/jobs/{job.id}/art?style=pencil", headers=headers).status_code == 200  # phiếu tập vẽ còn mở
    client.put("/api/v1/admin/features", headers=admin, json={"flags": {"worksheet": "off"}})
    assert client.get(f"/api/v1/jobs/{job.id}/art?style=pencil", headers=headers).status_code == 403


def test_diary_reward_respects_flag(db, client, login, bucket):  # noqa: F811
    from bonsai_api.db.models import DesignJob

    headers, job = _done_job(db, client, login, bucket)
    db.get(DesignJob, job.id).finished_at = datetime.now(UTC) - timedelta(days=29)
    db.commit()
    admin, ab = login("admin@example.com")
    _role(db, ab, UserRole.admin)
    client.put("/api/v1/admin/features", headers=admin, json={"flags": {"diary_rewards": "off"}})
    me = client.get("/api/v1/me", headers=headers).json()
    r = client.post(f"/api/v1/trees/{job.tree_id}/progress", headers=headers, json={"key": f"uploads/{me['id']}/d.jpg"})
    assert r.json()["reward"] == 0


def test_admin_moderation(db, client, login, bucket):  # noqa: F811
    admin, ab = login("admin@example.com")
    _role(db, ab, UserRole.admin)
    seller, sb = login("seller@example.com")
    _role(db, sb, UserRole.nursery)
    x = client.post("/api/v1/listings", headers=seller, json={"title": "Phôi si to"}).json()
    rows = client.get("/api/v1/admin/listings?q=si", headers=admin).json()
    assert [r["code"] for r in rows] == [x["code"]] and rows[0]["seller"]["email"] == "seller@example.com"
    assert client.post(f"/api/v1/admin/listings/{x['id']}/moderate", headers=admin, json={"status": "hidden", "reason": "ảnh sai"}).json()["status"] == "hidden"
    assert client.get(f"/api/v1/public/listings/{x['code']}").status_code == 404
    assert client.get("/api/v1/admin/listings", headers=seller).status_code == 403

    client.patch("/api/v1/me", headers=seller, json={"public_slug": "vuon-x"})
    assert [p["slug"] for p in client.get("/api/v1/admin/public-profiles", headers=admin).json()] == ["vuon-x"]
    assert client.post(f"/api/v1/admin/public-profiles/{sb['user']['id']}/hide", headers=admin, json={}).status_code == 204
    assert client.get("/api/v1/public/people/vuon-x").status_code == 404

    headers, job = _done_job(db, client, login, bucket)
    db.get(User, job.user_id).credits = 4
    db.commit()
    c = client.post(f"/api/v1/jobs/{job.id}/consults", headers=headers, json={"question": "Cành này nên giữ hay cắt ạ?"}).json()
    data = client.get("/api/v1/admin/consults?status=open", headers=admin).json()
    assert data["summary"]["open"] == 1 and data["items"][0]["hours_open"] == 0
    assert client.post(f"/api/v1/admin/consults/{c['id']}/action", headers=admin, json={"action": "refund"}).json()["status"] == "refunded"
    assert client.get("/api/v1/me", headers=headers).json()["credits"] == 4
    assert client.post(f"/api/v1/admin/consults/{c['id']}/action", headers=admin, json={"action": "refund"}).status_code == 409
    assert db.get(Consult, uuid.UUID(c["id"])).status == "refunded"

    client.post("/api/v1/assistant/questions", headers=headers, json={"question": "abc xyz gì đó"})
    log = client.get("/api/v1/admin/assistant?only_gaps=true", headers=admin).json()
    assert log["summary"]["gaps"] == 1 and log["items"][0]["question"] == "abc xyz gì đó"
    assert client.get("/api/v1/admin/stolen-trees", headers=admin).json() == []
    assert client.get("/api/v1/admin/care-requests", headers=admin).json() == []
    assert db.query(Listing).count() == 1
