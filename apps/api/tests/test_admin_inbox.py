"""Hộp việc quản trị, tìm nhanh, báo vi phạm, xử lý phản hồi, hồ sơ người dùng mở rộng."""

import uuid
from datetime import UTC, datetime, timedelta

from bonsai_api.db.models import Feedback, Listing, Payment, PaymentStatus, Report, Tree, User, UserRole

from test_week5 import _done_job, bucket  # noqa: F401 (fixture)


def _admin(db, login):
    h, body = login("admin@example.com")
    db.get(User, uuid.UUID(body["user"]["id"])).role = UserRole.admin
    db.commit()
    return h


def test_report_flow_hides_listing_and_locks(db, client, login, monkeypatch):
    sent = []
    monkeypatch.setattr("bonsai_api.queue.enqueue", lambda *a, **kw: sent.append(a) or True)
    admin = _admin(db, login)
    seller_h, seller = login("seller@example.com")
    sid = uuid.UUID(seller["user"]["id"])
    x = Listing(user_id=sid, code="BAD00001", title="Phôi si giá rẻ", species_key="si", price_vnd=100_000)
    db.add(x)
    db.commit()
    a, _ = login("a@example.com")
    b, _ = login("b@example.com")
    assert client.post("/api/v1/reports", headers=seller_h, json={"target_kind": "listing", "target": "BAD00001", "reason": "scam"}).status_code == 400
    assert client.post("/api/v1/reports", headers=a, json={"target_kind": "listing", "target": "nope", "reason": "scam"}).status_code == 404
    r1 = client.post("/api/v1/reports", headers=a, json={"target_kind": "listing", "target": "bad00001", "reason": "scam", "note": "đòi cọc trước"})
    assert r1.status_code == 201
    assert client.post("/api/v1/reports", headers=a, json={"target_kind": "listing", "target": "BAD00001", "reason": "spam"}).json()["id"] == r1.json()["id"]
    client.post("/api/v1/reports", headers=b, json={"target_kind": "listing", "target": "BAD00001", "reason": "stolen"})
    assert client.get("/api/v1/admin/reports", headers=a).status_code == 403

    inbox = client.get("/api/v1/admin/inbox", headers=admin).json()
    rep = next(i for i in inbox["items"] if i["key"] == "reports")
    assert rep["count"] == 2 and rep["tone"] == "danger" and inbox["badges"]["/admin/bao-cao"] == 2 and inbox["items"][0]["key"] == "reports"

    q = client.get("/api/v1/admin/reports", headers=admin).json()
    assert q["summary"]["open"] == 2 and q["items"][0]["target"]["code"] == "BAD00001" and q["items"][0]["reports_on_target"] == 2
    assert q["items"][0]["owner"]["email"] == "seller@example.com"
    rows = client.get("/api/v1/admin/listings", headers=admin).json()
    assert rows[0]["reports"] == 2 and rows[0]["description"] is None

    r = client.post(f"/api/v1/admin/reports/{r1.json()['id']}/resolve", headers=admin, json={"action": "hide_lock", "note": "lừa cọc"})
    assert r.json()["resolved"] == 2
    db.expire_all()
    assert db.get(Listing, x.id).status == "hidden" and db.get(User, sid).deleted_at is not None
    assert sent[-1][2] == "moderation"
    assert client.get("/api/v1/admin/reports", headers=admin).json()["summary"] == {"open": 0, "actioned": 2, "dismissed": 0}
    assert not any(i["key"] == "reports" for i in client.get("/api/v1/admin/inbox", headers=admin).json()["items"])


def test_inbox_payments_feedback_and_resolve(db, client, login, bucket):  # noqa: F811
    headers, job = _done_job(db, client, login, bucket)
    admin = _admin(db, login)
    db.add(Payment(user_id=job.user_id, package_code="le", amount_vnd=49000, transfer_code="BONSAIOLD1",
                   status=PaymentStatus.pending, created_at=datetime.now(UTC) - timedelta(hours=1)))
    db.add(Payment(user_id=job.user_id, package_code="le", amount_vnd=49000, transfer_code="BONSAINEW1", status=PaymentStatus.pending))
    f = Feedback(job_id=job.id, user_id=job.user_id, rating=-1, reason_tags=["trunk_changed"], comment="thân bị đổi")
    db.add(f)
    db.commit()
    items = {i["key"]: i for i in client.get("/api/v1/admin/inbox", headers=admin).json()["items"]}
    assert items["payments"]["count"] == 1 and items["payments"]["preview"][0]["label"].startswith("BONSAIOLD1")
    assert items["feedback"]["count"] == 1 and items["feedback"]["preview"][0]["to"] == f"/admin/phien/{job.id}"

    rows = client.get("/api/v1/admin/feedback?rating=-1&open_only=true", headers=admin).json()
    assert rows[0]["id"] == str(f.id) and rows[0]["resolved_at"] is None
    r = client.post(f"/api/v1/admin/feedback/{f.id}/resolve", headers=admin, json={"note": "đã sửa prompt P3a v3"})
    assert r.json()["admin_note"] == "đã sửa prompt P3a v3" and r.json()["resolved_at"]
    assert client.get("/api/v1/admin/feedback?rating=-1&open_only=true", headers=admin).json() == []
    assert "feedback" not in {i["key"] for i in client.get("/api/v1/admin/inbox", headers=admin).json()["items"]}

    found = client.get("/api/v1/admin/search?q=bonsaiold", headers=admin).json()
    assert found[0]["kind"] == "payment" and found[0]["to"] == "/admin/thanh-toan?q=BONSAIOLD1"
    found = client.get(f"/api/v1/admin/search?q={str(job.id)[:8]}", headers=admin).json()
    assert any(x["kind"] == "job" and x["to"] == f"/admin/phien/{job.id}" for x in found)


def test_user_related_note_message_and_stolen_clear(db, client, login, monkeypatch):
    sent = []
    monkeypatch.setattr("bonsai_api.queue.enqueue", lambda *a, **kw: sent.append(a) or True)
    admin = _admin(db, login)
    _, body = login("chu@example.com")
    uid = uuid.UUID(body["user"]["id"])
    t = Tree(user_id=uid, nickname="Si cổ", passport_code="PP12345", stolen_at=datetime.now(UTC))
    db.add(t)
    db.add(Listing(user_id=uid, code="REL00001", title="Phôi", species_key="si"))
    db.commit()
    db.add(Report(reporter_id=None, target_kind="profile", target_id=str(uid), reason="spam"))
    db.commit()
    rel = client.get(f"/api/v1/admin/users/{uid}/related", headers=admin).json()
    assert rel["trees"][0]["stolen"] is True and rel["listings"][0]["code"] == "REL00001" and rel["reports_against"][0]["reason_vi"] == "Spam"
    assert client.put(f"/api/v1/admin/users/{uid}/note", headers=admin, json={"note": "  khách quen, hay mua gói vườn "}).json()["admin_note"] == "khách quen, hay mua gói vườn"
    assert client.post(f"/api/v1/admin/users/{uid}/message", headers=admin, json={"title": "Chào bác", "body": "Đã hoàn lượt", "path": "/tai-khoan/luot"}).status_code == 202
    assert sent[-1][1:] == (str(uid), "admin_message", "Chào bác", "Đã hoàn lượt", "/tai-khoan/luot")
    counts = client.get("/api/v1/admin/community/counts", headers=admin).json()
    assert counts["stolen"] == 1 and counts["listings"] == 1
    assert client.post(f"/api/v1/admin/stolen-trees/{t.id}/clear", headers=admin).status_code == 204
    db.expire_all()
    assert db.get(Tree, t.id).stolen_at is None


def test_reviews_for_jobs(db, client, login, bucket):  # noqa: F811
    from sqlalchemy import select

    from bonsai_api.db.models import ArtisanReview, RenderImage

    headers, job = _done_job(db, client, login, bucket)
    render = db.execute(select(RenderImage).where(RenderImage.job_id == job.id)).scalars().first()
    admin = _admin(db, login)
    _, nb = login("nghenhan@example.com")
    db.add(ArtisanReview(kind="image", job_id=job.id, render_id=render.id, reviewer_id=uuid.UUID(nb["user"]["id"]), scores={"overall": 7}, hard_fails=[],
                         total=70, passed=True))
    db.commit()
    rows = client.get(f"/api/v1/admin/reviews?job_id={job.id}&job_id={uuid.uuid4()}", headers=admin).json()
    assert len(rows) == 1 and rows[0]["passed"] is True and rows[0]["total"] == 70.0
    assert client.get(f"/api/v1/admin/reviews?job_id={job.id}", headers=headers).status_code == 403


def test_staff_exempt_from_analysis_limits(db, client, login, monkeypatch):
    """Bộ đo chất lượng chạy hàng chục phiên / ngày bằng tài khoản quản trị: không vướng giới hạn phân tích."""
    monkeypatch.setattr("bonsai_api.queue.enqueue", lambda *a, **kw: True)
    admin = _admin(db, login)
    user, _ = login("u@example.com")

    def run(h):
        key = client.post("/api/v1/uploads/presign", headers=h, json={"content_type": "image/jpeg", "size_bytes": 10}).json()["key"]
        tree = client.post("/api/v1/trees", headers=h, json={"photos": [{"key": key, "view_index": 0}]}).json()
        return client.post(f"/api/v1/trees/{tree['id']}/jobs", headers=h, json={}).status_code

    from bonsai_api.routers import jobs as jobs_router
    monkeypatch.setattr(jobs_router, "get_ops", lambda db: {"pause_analysis": False, "phase_a_daily_limit": 1})
    assert run(user) == 202 and run(user) == 429
    assert run(admin) == 202 and run(admin) == 202
