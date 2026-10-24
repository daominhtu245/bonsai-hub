"""Đợt 4: tin đăng kèm dáng tương lai, gói nhà vườn tháng, thẻ QR, chỉ số giá, chậu đối tác."""

import io
import uuid
from datetime import UTC, datetime, timedelta

from PIL import Image
from sqlalchemy import select

from bonsai_api.db.models import DesignJob, DesignOption, Listing, Payment, User, UserRole

from test_week5 import _done_job, bank, bucket  # noqa: F401 (fixture)


def _jpeg():
    buf = io.BytesIO()
    Image.new("RGB", (2400, 1600), (90, 120, 60)).save(buf, "JPEG")
    return buf.getvalue()


def test_listing_lifecycle_and_public_page(db, client, login, bucket, monkeypatch):  # noqa: F811
    sent = []
    monkeypatch.setattr("bonsai_api.queue.enqueue", lambda *a, **kw: sent.append(a) or True)
    headers, job = _done_job(db, client, login, bucket)
    j = db.get(DesignJob, job.id)
    db.execute(select(DesignOption).where(DesignOption.job_id == j.id)).scalars().first().sketch_png_key = "trees/t/s1.png"
    db.commit()
    me = client.get("/api/v1/me", headers=headers).json()
    raw = f"uploads/{me['id']}/l.jpg"
    bucket[raw] = _jpeg()
    body = {"title": "Phôi si chân to", "species_key": "si", "price_vnd": 3_000_000, "trunk_cm": 10, "province": "can_tho",
            "contact_phone": "0909123456", "job_id": str(j.id), "photo_key": raw}
    r = client.post("/api/v1/listings", headers=headers, json=body)
    assert r.status_code == 201, r.text
    x = r.json()
    assert x["photo_url"] and raw not in bucket and Image.open(io.BytesIO(bucket[f"listings/{x['id']}/photo.webp"])).size == (1536, 1024)
    assert sent[-1] == ("bonsai_worker.tasks.market.listing_created", x["id"])

    pub = client.get(f"/api/v1/public/listings/{x['code'].lower()}").json()
    assert pub["views"] == 1 and pub["province_vi"] == "Cần Thơ" and [p["kind"] for p in pub["previews"]] == ["render", "sketch"]
    assert "job_id" not in pub  # không lộ mã phiên
    qr = client.get(f"/api/v1/public/listings/{x['code']}/qr.svg")
    assert qr.status_code == 200 and b"<svg" in qr.content
    assert [y["code"] for y in client.get("/api/v1/public/listings?species=si").json()] == [x["code"]]
    assert client.get("/api/v1/public/listings?q=sanh").json() == []

    # ẩn tin → trang công khai 404; người khác không sửa được
    other, _ = login("other@example.com")
    assert client.patch(f"/api/v1/listings/{x['id']}", headers=other, json={"status": "hidden"}).status_code == 404
    assert client.patch(f"/api/v1/listings/{x['id']}", headers=headers, json={"status": "hidden"}).json()["status"] == "hidden"
    assert client.get(f"/api/v1/public/listings/{x['code']}").status_code == 404
    assert client.post("/api/v1/listings", headers=headers, json={**body, "photo_key": f"uploads/{uuid.uuid4()}/x.jpg"}).status_code == 400
    assert client.delete(f"/api/v1/listings/{x['id']}", headers=headers).status_code == 204


def test_free_quota_featured_and_monthly_plan(db, client, login, bank):
    headers, body = login()
    user_id = uuid.UUID(body["user"]["id"])
    for i in range(3):
        assert client.post("/api/v1/listings", headers=headers, json={"title": f"Phôi {i}"}).status_code == 201
    assert client.post("/api/v1/listings", headers=headers, json={"title": "Phôi 4"}).status_code == 402
    first = client.get("/api/v1/me/listings", headers=headers).json()["items"][0]
    assert client.patch(f"/api/v1/listings/{first['id']}", headers=headers, json={"featured": True}).status_code == 402

    # mua gói tháng (giả lập webhook đã trả) → không giới hạn tin, tối đa 3 tin nổi bật
    from bonsai_api.services.payments import PACKAGE_BY_CODE

    pkg = PACKAGE_BY_CODE["nursery_month"]
    r = client.post("/api/v1/payments", headers=headers, json={"package_code": "nursery_month"})
    assert r.status_code in (200, 201), r.text
    p = r.json()
    from bonsai_api.services.payments import BankTxn, apply_bank_txn

    pay = db.get(Payment, uuid.UUID(p["id"]))
    assert apply_bank_txn(db, BankTxn(provider="sepay", txn_id="t1", amount=pkg.amount_vnd, content=pay.transfer_code, raw={})) == "credited"
    u = db.get(User, user_id)
    db.refresh(u)
    assert u.role == UserRole.nursery and u.nursery_until > datetime.now(UTC) + timedelta(days=29)
    assert client.post("/api/v1/listings", headers=headers, json={"title": "Phôi 4"}).status_code == 201
    items = client.get("/api/v1/me/listings", headers=headers).json()["items"]
    for it in items[:3]:
        assert client.patch(f"/api/v1/listings/{it['id']}", headers=headers, json={"featured": True}).json()["featured"]
    assert client.patch(f"/api/v1/listings/{items[3]['id']}", headers=headers, json={"featured": True}).status_code == 409
    assert client.get("/api/v1/public/listings").json()[0]["featured"]


def test_price_index_needs_enough_samples(db, client, login):
    _, body = login()
    uid = uuid.UUID(body["user"]["id"])
    for i in range(4):
        db.add(Listing(user_id=uid, code=f"P{i:07d}", title="x", species_key="si", province="ha_noi", price_vnd=1_000_000 * (i + 1), trunk_cm=10))
    db.commit()
    assert client.get("/api/v1/public/price-index").json() == []  # < 5 mẫu: không công bố
    db.add(Listing(user_id=uid, code="P0000009", title="x", species_key="si", province="ha_noi", price_vnd=5_000_000, trunk_cm=10, status="sold"))
    db.commit()
    rows = client.get("/api/v1/public/price-index").json()
    assert [(r["region"], r["samples"]) for r in rows] == [(None, 5), ("north", 5)]
    assert rows[0]["species_vi"] and rows[0]["per_cm_low"] <= rows[0]["per_cm_median"] <= rows[0]["per_cm_high"]


def test_partner_pots(db, client, login, bucket):  # noqa: F811
    headers, job = _done_job(db, client, login, bucket)
    opt = db.get(DesignOption, db.get(DesignJob, job.id).chosen_option_id)
    opt.design = {**opt.design, "pot": {"shape": "oval", "color": "unglazed_brown", "position": "center"}}
    db.commit()
    admin_h, ab = login("admin@example.com")
    db.get(User, uuid.UUID(ab["user"]["id"])).role = UserRole.admin
    db.commit()
    assert client.post("/api/v1/admin/partner-pots", headers=headers, json={"name": "x", "shape": "oval"}).status_code == 403
    for name, shape, color, length in [("Bầu nâu 30", "oval", "unglazed_brown", 30), ("Bầu nâu 60", "oval", "unglazed_brown", 60),
                                       ("Chữ nhật", "rectangle", "unglazed_brown", 30), ("Tròn men lam", "round", "glazed_blue", 30)]:
        r = client.post("/api/v1/admin/partner-pots", headers=admin_h,
                        json={"name": name, "maker": "Bát Tràng", "shape": shape, "color": color, "length_cm": length, "url": "https://example.com/p"})
        assert r.status_code == 201, r.text
    assert client.post("/api/v1/admin/partner-pots", headers=admin_h, json={"name": "x", "shape": "oval", "url": "javascript:alert(1)"}).status_code == 422
    names = [p["name"] for p in client.get(f"/api/v1/jobs/{job.id}/pots", headers=headers).json()]
    assert names == ["Bầu nâu 30", "Tròn men lam", "Bầu nâu 60"]  # cây cao 45 cm → chậu ~30 cm (cỡ quan trọng hơn màu); không gợi ý chữ nhật
