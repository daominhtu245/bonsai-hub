"""Đợt 5: hỏi nghệ nhân bằng lượt, trang công khai nhà vườn / nghệ nhân, chăm hộ / nuôi hộ."""

import io
import uuid

from PIL import Image
from sqlalchemy import select

from bonsai_api.db.models import CreditLedger, PhotoSource, TreePhoto, User, UserRole

from test_week5 import _done_job, bucket  # noqa: F401 (fixture)


def _role(db, body, role):
    db.get(User, uuid.UUID(body["user"]["id"])).role = role
    db.commit()


def test_public_profile_slug(db, client, login):
    h, body = login()
    assert client.patch("/api/v1/me", headers=h, json={"public_slug": "vuon-ba-la"}).status_code == 403  # người chơi
    _role(db, body, UserRole.nursery)
    r = client.patch("/api/v1/me", headers=h, json={"public_slug": "vuon-ba-la", "bio": "Chuyên si", "specialties": [" Si ", "Mai", ""],
                                                     "province": "can_tho", "garden_name": "Vườn Ba Lá", "phone": "0909 123 456"})
    assert r.status_code == 200 and r.json()["specialties"] == ["Si", "Mai"]
    assert client.patch("/api/v1/me", headers=h, json={"public_slug": "Vuon Ba La"}).status_code == 422
    h2, b2 = login("b@example.com")
    _role(db, b2, UserRole.nursery)
    assert client.patch("/api/v1/me", headers=h2, json={"public_slug": "vuon-ba-la"}).status_code == 409
    assert client.patch("/api/v1/me", headers=h2, json={"public_slug": "admin"}).status_code == 409
    p = client.get("/api/v1/public/people/vuon-ba-la").json()
    assert p["name"] == "Vườn Ba Lá" and p["province_vi"] == "Cần Thơ" and p["contact_phone"] == "0909 123 456" and p["listings"] == []
    assert client.get("/api/v1/public/people/khong-co").status_code == 404


def test_consult_flow(db, client, login, bucket, monkeypatch):  # noqa: F811
    sent = []
    monkeypatch.setattr("bonsai_api.queue.enqueue", lambda *a, **kw: sent.append(a) or True)
    headers, job = _done_job(db, client, login, bucket)
    me = db.get(User, job.user_id)
    me.credits = 1
    db.commit()
    q = {"question": "Cành thứ nhất có nên hạ thấp hơn không ạ?"}
    assert client.post(f"/api/v1/jobs/{job.id}/consults", headers=headers, json=q).status_code == 402  # cần 2 lượt
    me.credits = 5
    db.commit()
    c = client.post(f"/api/v1/jobs/{job.id}/consults", headers=headers, json=q).json()
    assert c["status"] == "open" and client.get("/api/v1/me", headers=headers).json()["credits"] == 3

    ah, ab = login("nghenhan@example.com")
    assert client.get("/api/v1/artisan/consults", headers=ah).status_code == 403
    _role(db, ab, UserRole.artisan)
    queue_ = client.get("/api/v1/artisan/consults", headers=ah).json()
    assert [x["id"] for x in queue_] == [c["id"]] and queue_[0]["photo_url"]
    other_h, ob = login("nghenhan2@example.com")
    _role(db, ob, UserRole.artisan)
    assert client.post(f"/api/v1/artisan/consults/{c['id']}/claim", headers=ah).status_code == 200
    assert client.post(f"/api/v1/artisan/consults/{c['id']}/answer", headers=other_h,
                       json={"answer": "x" * 30, "verdict": "ok"}).status_code == 409  # người khác đã nhận
    assert client.get("/api/v1/artisan/consults", headers=other_h).json() == []
    r = client.post(f"/api/v1/artisan/consults/{c['id']}/answer", headers=ah,
                    json={"answer": "Hạ cành thứ nhất xuống khoảng 15 độ, giữ cành hậu.", "verdict": "fix"})
    assert r.json()["status"] == "answered" and sent[-1][0] == "bonsai_worker.tasks.notify.user_message" and sent[-1][1] == str(job.user_id)
    mine = client.get(f"/api/v1/consults/{c['id']}", headers=headers).json()
    assert mine["verdict_vi"] == "Cần sửa vài chỗ" and mine["answer"].startswith("Hạ cành")
    assert client.post(f"/api/v1/consults/{c['id']}/rate", headers=headers, json={"rating": 5}).status_code == 204
    stranger, _ = login("x@example.com")
    assert client.get(f"/api/v1/consults/{c['id']}", headers=stranger).status_code == 404


def test_consult_refund_after_72h(db, client, login, bucket):  # noqa: F811
    from datetime import UTC, datetime, timedelta

    from bonsai_api.db.models import Consult
    from bonsai_worker.tasks.consults import refund_overdue

    headers, job = _done_job(db, client, login, bucket)
    db.get(User, job.user_id).credits = 2
    db.commit()
    c = client.post(f"/api/v1/jobs/{job.id}/consults", headers=headers, json={"question": "Nên chọn thế nào cho phôi này?"}).json()
    assert refund_overdue(db) == 0
    row = db.get(Consult, uuid.UUID(c["id"]))
    row.created_at = datetime.now(UTC) - timedelta(hours=73)
    db.commit()
    assert refund_overdue(db) == 1 and refund_overdue(db) == 0
    assert client.get("/api/v1/me", headers=headers).json()["credits"] == 2
    labels = [x["label"] for x in client.get("/api/v1/me/credits", headers=headers).json()]
    assert "Hoàn lượt hỏi nghệ nhân" in labels and "Hỏi nghệ nhân" in labels


def test_care_request_flow(db, client, login, bucket, monkeypatch):  # noqa: F811
    monkeypatch.setattr("bonsai_api.queue.enqueue", lambda *a, **kw: True)
    owner_h, job = _done_job(db, client, login, bucket)
    nh, nb = login("vuon@example.com")
    _role(db, nb, UserRole.nursery)
    client.patch("/api/v1/me", headers=nh, json={"public_slug": "vuon-a", "phone": "0909000111"})
    body = {"kind": "grow", "nursery_slug": "vuon-a", "tree_id": str(job.tree_id), "job_id": str(job.id),
            "start_date": "2026-11-01", "end_date": "2027-05-01", "note": "Nuôi theo lộ trình"}
    r = client.post("/api/v1/care-requests", headers=owner_h, json=body)
    assert r.status_code == 201, r.text
    rid = r.json()["id"]
    assert r.json()["contact_phone"] is None  # chưa nhận thì chưa lộ số
    assert client.post("/api/v1/care-requests", headers=owner_h, json=body).status_code == 409
    assert client.post("/api/v1/care-requests", headers=owner_h, json={**body, "end_date": "2026-01-01"}).status_code == 422
    assert client.post(f"/api/v1/care-requests/{rid}/updates", headers=nh, json={"note": "x"}).status_code == 409  # chưa nhận
    assert client.post(f"/api/v1/care-requests/{rid}/action", headers=owner_h, json={"action": "accept"}).status_code == 409
    acc = client.post(f"/api/v1/care-requests/{rid}/action", headers=nh, json={"action": "accept"}).json()
    assert acc["status"] == "active" and acc["role"] == "nursery" and acc["contact_phone"] is None  # chủ cây chưa có SĐT

    nursery_id = nb["user"]["id"]
    raw = f"uploads/{nursery_id}/u.jpg"
    buf = io.BytesIO()
    Image.new("RGB", (2000, 3000), (60, 100, 50)).save(buf, "JPEG")
    bucket[raw] = buf.getvalue()
    up = client.post(f"/api/v1/care-requests/{rid}/updates", headers=nh, json={"photo_key": raw, "note": "Ra chồi mới"})
    assert up.status_code == 201 and up.json()["photo_url"]
    assert client.post(f"/api/v1/care-requests/{rid}/updates", headers=owner_h, json={"note": "x"}).status_code == 409
    d = client.get(f"/api/v1/care-requests/{rid}", headers=owner_h).json()
    assert [u["note"] for u in d["updates"]] == ["Ra chồi mới"] and d["contact_phone"] == "0909000111"
    diary = db.execute(select(TreePhoto).where(TreePhoto.tree_id == job.tree_id, TreePhoto.source == PhotoSource.progress)).scalars().all()
    assert len(diary) == 1 and diary[0].width == 1024 and diary[0].height == 1536  # vào nhật ký, đã thu nhỏ
    assert not db.execute(select(CreditLedger).where(CreditLedger.reason == "reward")).first()  # ảnh nhà vườn không tính thưởng mốc
    assert [x["role"] for x in client.get("/api/v1/care-requests", headers=nh).json()] == ["nursery"]
    assert client.post(f"/api/v1/care-requests/{rid}/action", headers=owner_h, json={"action": "done"}).json()["status"] == "done"
