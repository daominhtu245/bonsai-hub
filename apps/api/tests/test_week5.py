import io
import uuid
from decimal import Decimal

import numpy as np
import pytest
from PIL import Image
from sqlalchemy import select

from bonsai_api.db.models import (
    CreditLedger, DesignJob, JobStatus, Payment, PipelineStep, PromptVersion, RenderImage, Stage, StageTaskCheck, Tree,
    TreePhoto, User, UserRole,
)
from bonsai_api.services.payments import extract_code
from bonsai_api.settings import get_settings

from test_jobs import _ready_job


@pytest.fixture
def bucket(monkeypatch):
    store: dict[str, bytes] = {}
    monkeypatch.setattr("bonsai_api.storage.get_bytes", lambda k: store[k])
    monkeypatch.setattr("bonsai_api.storage.put_bytes", lambda k, d, ct: store.__setitem__(k, d))
    monkeypatch.setattr("bonsai_api.storage.head", lambda k: {"k": k} if k in store else None)
    monkeypatch.setattr("bonsai_api.storage.delete", lambda k: store.pop(k, None))
    return store


def _webp(color):
    buf = io.BytesIO()
    Image.new("RGB", (400, 600), color).save(buf, format="WEBP")
    return buf.getvalue()


def _done_job(db, client, login, bucket):
    headers, job_id, opt_id = _ready_job(db, client, login)
    j = db.get(DesignJob, job_id)
    photo = db.execute(select(TreePhoto).where(TreePhoto.tree_id == j.tree_id)).scalars().first()
    photo.storage_key = "trees/t/photos/p.webp"
    bucket[photo.storage_key] = _webp((200, 190, 170))
    bucket["trees/t/S4.webp"] = _webp((60, 90, 60))
    db.add(RenderImage(job_id=j.id, stage_code="S4", attempt=0, storage_key="trees/t/S4.webp", model="m", selected=True))
    j.status, j.chosen_option_id, j.front_photo_id = JobStatus.done, opt_id, photo.id
    j.progress = {"result": {"years": 4}}
    db.get(Tree, j.tree_id).species_key, db.get(Tree, j.tree_id).real_height_cm = "si", 45
    db.commit()
    return headers, j


# ---------- chia sẻ ----------

def test_share_creates_link_images_and_public_page(db, client, login, bucket):
    headers, job = _done_job(db, client, login, bucket)
    r = client.post(f"/api/v1/jobs/{job.id}/share", headers=headers, json={"branded": True})
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["url"].endswith(f"/s/{out['code']}") and not out["can_brand"]
    keys = [k for k in bucket if "share_" in k]
    assert sorted(k.rsplit("/", 1)[1] for k in keys) == ["share_1x1.jpg", "share_9x16.jpg"]  # không có thương hiệu
    assert Image.open(io.BytesIO(bucket[[k for k in keys if "9x16" in k][0]])).size == (1080, 1920)
    again = client.post(f"/api/v1/jobs/{job.id}/share", headers=headers, json={}).json()
    assert again["code"] == out["code"]

    page = client.get(f"/s/{out['code']}")
    assert page.status_code == 200 and 'property="og:image"' in page.text and "Phôi si" in page.text
    img = client.get(f"/api/v1/public/shares/{out['code']}/1x1.jpg")
    assert img.status_code == 200 and img.headers["content-type"] == "image/jpeg"
    assert client.get("/s/khongco").status_code == 404


def test_nursery_branding(db, client, login, bucket):
    headers, job = _done_job(db, client, login, bucket)
    assert client.patch("/api/v1/me", headers=headers, json={"garden_name": "Ba Lá", "phone": "0909 123 456"}).status_code == 200
    db.get(User, job.user_id).role = UserRole.nursery
    db.commit()
    out = client.post(f"/api/v1/jobs/{job.id}/share", headers=headers, json={"branded": True}).json()
    assert out["can_brand"] and any(k.endswith("share_9x16_brand.jpg") for k in bucket)


def test_share_requires_done(db, client, login, bucket):
    headers, job_id, _ = _ready_job(db, client, login)
    assert client.post(f"/api/v1/jobs/{job_id}/share", headers=headers, json={}).status_code == 409


def test_profile_validation(client, login):
    headers, _ = login()
    assert client.patch("/api/v1/me", headers=headers, json={"phone": "abc"}).status_code == 422
    r = client.patch("/api/v1/me", headers=headers, json={"garden_name": "  ", "name": "Chú Ba"})
    assert r.json()["garden_name"] is None and r.json()["name"] == "Chú Ba"


# ---------- thanh toán ----------

@pytest.fixture
def bank(monkeypatch):
    s = get_settings()
    for k, v in {"bank_bin": "970436", "bank_account": "0123456789", "bank_account_name": "VUON BONSAI",
                 "bank_name": "Vietcombank", "sepay_api_key": "sepay-key", "casso_secure_token": "casso-token"}.items():
        monkeypatch.setattr(s, k, v)


def _sepay(client, content, amount, txn_id=1, key="sepay-key"):
    body = {"id": txn_id, "gateway": "Vietcombank", "content": content, "transferType": "in", "transferAmount": amount}
    return client.post("/api/v1/webhooks/bank", json=body, headers={"Authorization": f"Apikey {key}"})


def test_extract_code_variants():
    assert extract_code("CT DEN 123 BONSAI 8F3K2 FT2345") == "BONSAI8F3K2"
    assert extract_code("bonsai8f3k2") == "BONSAI8F3K2"
    assert extract_code("BONSAI-8F3K2 chuyen tien") == "BONSAI8F3K2"
    assert extract_code("chuyen tien an trua") is None


def test_payment_flow_sepay_idempotent(db, client, login, bank):
    headers, body = login()
    assert [p["code"] for p in client.get("/api/v1/packages").json()] == ["le", "player", "nursery"]
    p = client.post("/api/v1/payments", headers=headers, json={"package_code": "player"}).json()
    assert p["amount_vnd"] == 199000 and p["transfer_code_display"].startswith("BONSAI ")
    assert p["qr_url"].startswith("https://img.vietqr.io/image/970436-0123456789-compact2.png?amount=199000")

    assert _sepay(client, f"chuyen khoan {p['transfer_code_display']}", 199000, key="wrong").status_code == 401
    r = _sepay(client, f"chuyen khoan {p['transfer_code_display']}", 199000)
    assert r.json()["results"] == ["credited"]
    assert _sepay(client, f"chuyen khoan {p['transfer_code_display']}", 199000).json()["results"] == ["duplicate"]
    me = client.get("/api/v1/me", headers=headers).json()
    assert me["credits"] == 6 and me["role"] == "player"
    assert client.get(f"/api/v1/payments/{p['id']}", headers=headers).json()["status"] == "paid"
    purchases = db.execute(select(CreditLedger).where(CreditLedger.reason == "purchase")).scalars().all()
    assert len(purchases) == 1 and purchases[0].delta == 5


def test_casso_nursery_and_edge_cases(db, client, login, bank):
    headers, _ = login()
    p = client.post("/api/v1/payments", headers=headers, json={"package_code": "nursery"}).json()
    casso = lambda data: client.post("/api/v1/webhooks/bank", json={"error": 0, "data": data}, headers={"Secure-Token": "casso-token"})
    r = casso([
        {"id": 11, "description": "tien dien", "amount": 500000},
        {"id": 12, "description": p["transfer_code"], "amount": 1_000_000},  # thiếu tiền
        {"id": 13, "description": "rut tien", "amount": -50000},
    ])
    assert r.json()["results"] == ["unmatched", "underpaid"]
    assert client.get("/api/v1/me", headers=headers).json()["credits"] == 1
    r = casso([{"id": 14, "description": f"MBVCB {p['transfer_code']}", "amount": 1_490_000}])
    assert r.json()["results"] == ["credited"]
    me = client.get("/api/v1/me", headers=headers).json()
    assert me["credits"] == 51 and me["role"] == "nursery"


def test_payment_not_configured(client, login):
    headers, _ = login()
    assert client.post("/api/v1/payments", headers=headers, json={"package_code": "le"}).status_code == 503


def test_payment_events_stream(db, client, login, bank, monkeypatch):
    monkeypatch.setattr("bonsai_api.routers.payments.POLL_SECONDS", 0.01)
    headers, _ = login()
    p = client.post("/api/v1/payments", headers=headers, json={"package_code": "le"}).json()
    _sepay(client, p["transfer_code"], 49000, txn_id=99)
    with client.stream("GET", f"/api/v1/payments/{p['id']}/events", headers=headers) as r:
        body = "".join(r.iter_text())
    assert 'data: {"status": "paid"}' in body


# ---------- vườn ----------

def test_garden_current_stage_and_next_task(db, client, login, bucket):
    headers, job = _done_job(db, client, login, bucket)
    for code in ("S0", "S1", "S2", "S3", "S4"):
        db.add(Stage(job_id=job.id, code=code, guide_vi={"actions_vi": [f"{code}-a", f"{code}-b"]}))
    db.add_all([StageTaskCheck(job_id=job.id, stage_code="S0", task_index=0), StageTaskCheck(job_id=job.id, stage_code="S0", task_index=1),
                StageTaskCheck(job_id=job.id, stage_code="S1", task_index=0)])
    db.commit()
    g = client.get("/api/v1/garden", headers=headers).json()
    t = g["trees"][0]
    assert t["stage_code"] == "S1" and t["stages_done"] == 1 and t["next_task_vi"] == "S1-b"
    assert t["style_vi"] == "Trực uốn" and "S4.webp" in t["thumbnail_url"] and g["credits"] == 1


# ---------- admin ----------

def test_admin_requires_role_and_works(db, client, login, monkeypatch):
    headers, _ = login()
    assert client.get("/api/v1/admin/prompts", headers=headers).status_code == 403
    monkeypatch.setattr(get_settings(), "admin_emails", ["boss@example.com"])
    admin, body = login("boss@example.com")
    assert body["user"]["role"] == "admin"

    prompts = client.get("/api/v1/admin/prompts", headers=admin).json()
    assert {p["step_code"] for p in prompts} >= {"P1", "P2", "P4", "P6"}
    r = client.post("/api/v1/admin/prompts", headers=admin, json={"step_code": "P1", "system": "s", "user": "new user prompt {{n_images}}"})
    assert r.status_code == 201 and r.json()["version"] == "v3" and not r.json()["active"]
    client.post(f"/api/v1/admin/prompts/{r.json()['id']}/activate", headers=admin)
    active = db.execute(select(PromptVersion.version).where(PromptVersion.step_code == "P1", PromptVersion.active)).scalars().all()
    assert active == ["v3"]

    db.add(PipelineStep(step_code="P3a", provider="gemini", model="m", tokens_in=0, tokens_out=0, images_out=1,
                        cost_usd=Decimal("0.0336"), latency_ms=900, ok=True))
    db.add(PipelineStep(step_code="P3a", provider="gemini", model="m", cost_usd=Decimal("0"), latency_ms=100, ok=False))
    db.commit()
    c = client.get("/api/v1/admin/costs", headers=admin).json()
    p3a = next(s for s in c["steps"] if s["step_code"] == "P3a")
    assert p3a["calls"] == 2 and p3a["cost_usd"] == 0.0336 and p3a["fail_rate"] == 0.5
    assert c["total_usd"] == 0.0336
    assert client.get("/api/v1/admin/jobs/failed", headers=admin).status_code == 200


def _admin(client, login, monkeypatch):
    monkeypatch.setattr(get_settings(), "admin_emails", ["boss@example.com"])
    headers, _ = login("boss@example.com")
    return headers


def test_admin_feedback_and_gift(db, client, login, monkeypatch, bucket):
    user_headers, job = _done_job(db, client, login, bucket)
    client.post(f"/api/v1/jobs/{job.id}/feedback", headers=user_headers, json={"rating": -1, "comment": "Thân bị vẽ khác"})
    admin = _admin(client, login, monkeypatch)
    rows = client.get("/api/v1/admin/feedback?rating=-1", headers=admin).json()
    assert rows[0]["comment"] == "Thân bị vẽ khác" and rows[0]["style_key"] == "moyogi" and rows[0]["user_email"] == "nhavuon@example.com"
    assert client.get("/api/v1/admin/feedback?rating=1", headers=admin).json() == []

    gift = lambda **kw: client.post("/api/v1/admin/credits/gift", headers=admin, json={"email": "NhaVuon@example.com", "credits": 3, "batch": "beta-1"} | kw)
    r = gift()
    assert r.json() == {"email": "nhavuon@example.com", "credited": True, "credits": 4}
    assert gift().json()["credited"] is False  # cùng đợt: không cộng lại
    assert gift(batch="beta-2").json()["credits"] == 7
    assert gift(email="khongco@example.com").status_code == 404
    assert gift(batch="có dấu").status_code == 422
    assert client.post("/api/v1/admin/credits/gift", headers=user_headers, json={"email": "a@b.c", "credits": 1, "batch": "x"}).status_code == 403


def test_admin_species_refs(db, client, login, monkeypatch):
    admin = _admin(client, login, monkeypatch)
    p = client.post("/api/v1/admin/species/si/refs/presign", headers=admin, json={"content_type": "image/webp"}).json()
    assert p["key"].startswith("refs/species/si/") and "X-Amz-Signature" in p["url"]
    assert client.post("/api/v1/admin/species/si/refs/presign", headers=admin, json={"content_type": "image/gif"}).status_code == 400
    r = client.post("/api/v1/admin/species/si/refs", headers=admin, json={"key": p["key"]}).json()
    assert [x["key"] for x in r["refs"]] == [p["key"]]
    assert client.post("/api/v1/admin/species/si/refs", headers=admin, json={"key": "refs/species/sanh/x.webp"}).status_code == 400
    r = client.request("DELETE", "/api/v1/admin/species/si/refs", headers=admin, json={"key": p["key"]}).json()
    assert r["refs"] == []
    assert client.get("/api/v1/admin/species", headers=admin).status_code == 200


def test_admin_ai_settings(db, client, login, monkeypatch):
    user, _ = login("user@example.com")
    assert client.get("/api/v1/admin/settings", headers=user).status_code == 403
    admin = _admin(client, login, monkeypatch)
    defaults = {"cost_mode": "standard", "analysis_mode": "hybrid", "design_mode": "api", "cutout_mode": "on",
                "cutout_model": None, "seg_model_ready": False, "app_env": get_settings().app_env}
    assert client.get("/api/v1/admin/settings", headers=admin).json() == defaults
    r = client.put("/api/v1/admin/settings", headers=admin, json={"cost_mode": "economy", "design_mode": "rules"})
    assert r.status_code == 200 and r.json() == defaults | {"cost_mode": "economy", "design_mode": "rules"}
    r = client.put("/api/v1/admin/settings", headers=admin, json={"analysis_mode": "api"})
    assert r.json() == defaults | {"cost_mode": "economy", "design_mode": "rules", "analysis_mode": "api"}
    r = client.put("/api/v1/admin/settings", headers=admin, json={"cutout_mode": "off"})
    assert r.json()["cutout_mode"] == "off"
    assert client.put("/api/v1/admin/settings", headers=admin, json={"cost_mode": "full"}).status_code == 422
    assert client.put("/api/v1/admin/settings", headers=admin, json={"design_mode": "magic"}).status_code == 422


def _png(w, h, box=None):
    m = np.zeros((h, w), np.uint8)
    if box:
        x0, y0, x1, y1 = box
        m[y0:y1, x0:x1] = 255
    buf = io.BytesIO()
    Image.fromarray(m).save(buf, format="PNG")
    return buf.getvalue()


def test_admin_labeling_flow(db, client, login, monkeypatch, bucket):
    from bonsai_api.db.models import SegLabel, SegLabelStatus

    sent = []
    monkeypatch.setattr("bonsai_api.routers.labels.enqueue", lambda task, *a: sent.append((task, a)) or True)
    admin = _admin(client, login, monkeypatch)
    me = client.get("/api/v1/me", headers=admin).json()
    # chỉ nhận ảnh trong thư mục tải lên của chính admin
    assert client.post("/api/v1/admin/labels", headers=admin, json={"keys": ["uploads/other/x.jpg"]}).status_code == 400
    r = client.post("/api/v1/admin/labels", headers=admin, json={"keys": [f"uploads/{me['id']}/a.jpg"]})
    assert r.status_code == 201 and r.json() == {"created": 1} and sent[0][0] == "bonsai_worker.tasks.labeling.draft"

    label = db.query(SegLabel).one()
    assert client.get(f"/api/v1/admin/labels/{label.id}", headers=admin).status_code == 409  # chưa chuẩn hóa
    # giả lập worker đã tạo nháp
    label.width, label.height, label.status = 40, 30, SegLabelStatus.draft
    label.image_key = f"labels/{label.id}/image.webp"
    bucket[label.image_key] = b"img"
    label.objects = [{"id": "trunk", "cls": "trunk", "key": f"labels/{label.id}/trunk.png", "source": "geometry", "accepted": True},
                     {"id": "branch_b1", "cls": "branch", "key": f"labels/{label.id}/branch_b1.png", "source": "geometry", "accepted": True}]
    bucket[f"labels/{label.id}/trunk.png"] = _png(40, 30, (15, 5, 25, 30))
    bucket[f"labels/{label.id}/branch_b1.png"] = _png(40, 30, (25, 10, 38, 13))
    db.commit()

    lst = client.get("/api/v1/admin/labels", headers=admin).json()
    assert lst["counts"]["draft"] == 1 and lst["items"][0]["objects"] == 2
    d = client.get(f"/api/v1/admin/labels/{label.id}", headers=admin).json()
    assert [o["id"] for o in d["objects"]] == ["trunk", "branch_b1"] and d["width"] == 40
    m = client.get(f"/api/v1/admin/labels/{label.id}/objects/trunk/mask", headers=admin)
    assert m.status_code == 200 and m.headers["content-type"] == "image/png"

    # sửa mask, thêm cành bị sót, sai kích thước bị từ chối
    url = f"/api/v1/admin/labels/{label.id}/objects"
    assert client.put(f"{url}/branch_m1/mask", headers={**admin, "Content-Type": "image/png"}, content=_png(40, 30, (2, 8, 14, 11))).status_code == 400  # thiếu cls
    r = client.put(f"{url}/branch_m1/mask?cls=branch", headers={**admin, "Content-Type": "image/png"}, content=_png(40, 30, (2, 8, 14, 11)))
    assert r.status_code == 200 and r.json()["source"] == "manual"
    assert client.put(f"{url}/trunk/mask", headers={**admin, "Content-Type": "image/png"}, content=_png(10, 10)).status_code == 400
    assert client.put(f"{url}/../mask", headers={**admin, "Content-Type": "image/png"}, content=_png(40, 30)).status_code in (400, 404)

    # đánh dấu sai cành b1, xóa không còn; duyệt
    r = client.put(f"/api/v1/admin/labels/{label.id}", headers=admin, json={
        "status": "reviewed",
        "objects": [{"id": "trunk", "cls": "trunk", "accepted": True}, {"id": "branch_m1", "cls": "branch", "accepted": True}],
    })
    assert r.status_code == 200 and r.json()["status"] == "reviewed"
    db.refresh(label)
    assert [o["id"] for o in label.objects] == ["trunk", "branch_m1"] and f"labels/{label.id}/branch_b1.png" not in bucket
    assert label.reviewed_by == "boss@example.com"
    # không có thân đúng → không cho duyệt
    r = client.put(f"/api/v1/admin/labels/{label.id}", headers=admin, json={
        "status": "reviewed", "objects": [{"id": "trunk", "cls": "trunk", "accepted": False}, {"id": "branch_m1", "cls": "branch", "accepted": True}]})
    assert r.status_code == 400


def test_labels_from_jobs_respects_consent(db, client, login, monkeypatch, bucket):
    from bonsai_api.db.models import SegLabel

    monkeypatch.setattr("bonsai_api.routers.labels.enqueue", lambda *a: True)
    user_headers, job = _done_job(db, client, login, bucket)
    admin = _admin(client, login, monkeypatch)
    assert client.get("/api/v1/admin/labels", headers=admin).json()["eligible_jobs"] == 0  # chưa đồng ý
    owner = db.get(User, job.user_id)
    owner.consent_training = True
    db.commit()
    assert client.get("/api/v1/admin/labels", headers=admin).json()["eligible_jobs"] == 1
    r = client.post("/api/v1/admin/labels/from-jobs", headers=admin, json={"limit": 10})
    assert r.json() == {"created": 1}
    lb = db.query(SegLabel).one()
    assert lb.source == "job" and lb.analysis == job.analysis
    assert client.get("/api/v1/admin/labels", headers=admin).json()["eligible_jobs"] == 0  # không lấy trùng
