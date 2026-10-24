"""Bảng điều khiển quản trị: tổng quan, phiên, người dùng, thanh toán, hệ thống, nhật ký, danh mục."""

import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest

from bonsai_api.db.models import (
    AdminAudit, CreditLedger, CreditReason, DesignJob, JobStatus, Payment, PaymentStatus, PipelineStep, Species, User,
    UserRole,
)
from bonsai_api.services.credits import apply_credit, spend_for_render
from bonsai_api.settings import get_settings

from test_jobs import _ready_job


@pytest.fixture
def admin(client, login, monkeypatch):
    monkeypatch.setattr(get_settings(), "admin_emails", ["boss@example.com"])
    headers, body = login("boss@example.com")
    return headers, uuid.UUID(body["user"]["id"])


@pytest.fixture
def enq(monkeypatch):
    sent = []
    monkeypatch.setattr("bonsai_api.queue.enqueue", lambda task, *a, **kw: sent.append((task, a, kw)) or True)
    return sent


def _actions(db):
    return [a.action for a in db.query(AdminAudit).order_by(AdminAudit.id)]


def test_all_console_endpoints_require_admin(client, login):
    user, _ = login("user@example.com")
    for path in ("/admin/dashboard", "/admin/jobs", "/admin/users", "/admin/payments", "/admin/system", "/admin/audit",
                 "/admin/catalog", "/admin/prompts/stats"):
        assert client.get(f"/api/v1{path}", headers=user).status_code == 403, path


def test_dashboard(db, client, login, admin):
    headers, _ = admin
    _, job_id, opt_id = _ready_job(db, client, login, credits=3)
    job = db.get(DesignJob, job_id)
    job.chosen_option_id, job.status = opt_id, JobStatus.done
    db.add(PipelineStep(job_id=job.id, step_code="P1", provider="openai", model="gpt-5.5", tokens_in=1, tokens_out=1,
                        images_out=0, cost_usd=Decimal("0.1"), latency_ms=1000, ok=True))
    db.add(Payment(user_id=job.user_id, amount_vnd=199_000, package_code="player", transfer_code="BSTEST1",
                   status=PaymentStatus.paid, paid_at=datetime.now(UTC)))
    db.commit()
    d = client.get("/api/v1/admin/dashboard?days=7", headers=headers).json()
    k = d["kpis"]
    assert k["jobs_a"]["value"] == 1 and k["jobs_paid"]["value"] == 1 and k["revenue_vnd"]["value"] == 199_000
    assert k["ai_cost_vnd"]["value"] == 2600 and k["gross_margin_vnd"]["value"] == 196_400
    assert k["conversion"]["value"] == 1.0 and k["users_new"]["previous"] == 0
    assert len(d["series"]) == 7 and sum(r["revenue_vnd"] for r in d["series"]) == 199_000
    assert d["funnel"]["users"] == 1 and d["funnel"]["done"] == 1


def test_jobs_list_detail_and_actions(db, client, login, admin, enq):
    headers, _ = admin
    _, job_id, opt_id = _ready_job(db, client, login, credits=2)
    job = db.get(DesignJob, job_id)
    # phiên B lỗi đã hoàn lượt → chạy lại miễn phí cho người dùng
    spend_for_render(db, job.user_id, job.id)
    job.chosen_option_id, job.charge_ref, job.status, job.error_code = opt_id, str(job.id), JobStatus.failed, "image_unavailable"
    db.commit()
    lst = client.get("/api/v1/admin/jobs?status=failed", headers=headers).json()
    assert lst["total"] == 1 and lst["items"][0]["paid"] and lst["items"][0]["error_code"] == "image_unavailable"
    assert client.get("/api/v1/admin/jobs?q=khong-co", headers=headers).json()["total"] == 0
    d = client.get(f"/api/v1/admin/jobs/{job.id}", headers=headers).json()
    assert d["can_retry"] == "phase_b" and d["can_refund"] and len(d["options"]) == 1

    r = client.post(f"/api/v1/admin/jobs/{job.id}/refund", headers=headers, json={"note": "lỗi model"})
    assert r.status_code == 200 and not r.json()["can_refund"]
    owner = db.get(User, job.user_id)
    db.refresh(owner)
    assert owner.credits == 2  # đã hoàn
    r = client.post(f"/api/v1/admin/jobs/{job.id}/retry", headers=headers, json={})
    assert r.status_code == 200 and r.json()["job"]["status"] == "rendering_final"
    db.refresh(owner)
    assert owner.credits == 2  # tặng 1 rồi trừ 1
    assert enq[-1][0] == "bonsai_worker.tasks.phase_b.run"
    assert client.post(f"/api/v1/admin/jobs/{job.id}/retry", headers=headers, json={}).status_code == 409  # đang chạy, chưa treo

    # treo quá 20 phút → dừng và hoàn lượt
    job = db.get(DesignJob, job.id)
    job.started_at = datetime.now(UTC) - timedelta(hours=1)
    db.commit()
    assert client.get("/api/v1/admin/jobs?status=stuck", headers=headers).json()["total"] == 1
    r = client.post(f"/api/v1/admin/jobs/{job.id}/fail", headers=headers, json={"note": "worker chết"})
    assert r.json()["job"]["status"] == "failed" and r.json()["job"]["error_code"] == "admin_stopped"
    db.refresh(owner)
    assert owner.credits == 3  # lượt của lần chạy lại được hoàn (khoản tặng vẫn giữ)
    assert _actions(db) == ["job.refund", "job.retry", "job.fail"]


def test_retry_phase_a(db, client, login, admin, enq):
    headers, _ = admin
    _, job_id, _ = _ready_job(db, client, login)
    job = db.get(DesignJob, job_id)
    job.status, job.error_code = JobStatus.failed, "ai_unavailable"
    db.commit()
    r = client.post(f"/api/v1/admin/jobs/{job.id}/retry", headers=headers, json={})
    assert r.json()["job"]["status"] == "queued" and enq[-1][0] == "bonsai_worker.tasks.phase_a.run"


def test_users_console(db, client, login, admin):
    headers, admin_id = admin
    _, body = login("khach@example.com")
    uid = body["user"]["id"]
    lst = client.get("/api/v1/admin/users?q=khach", headers=headers).json()
    assert lst["total"] == 1 and lst["items"][0]["email"] == "khach@example.com"

    r = client.put(f"/api/v1/admin/users/{uid}/role", headers=headers, json={"role": "nursery"})
    assert r.json()["user"]["role"] == "nursery"
    assert client.put(f"/api/v1/admin/users/{admin_id}/role", headers=headers, json={"role": "player"}).status_code == 400

    r = client.post(f"/api/v1/admin/users/{uid}/credits", headers=headers, json={"delta": 5, "note": "bù lỗi phiên"})
    assert r.json()["user"]["credits"] == 6 and r.json()["ledger"][0]["reason"] == "adjust"  # 1 lượt dùng thử + 5
    assert client.post(f"/api/v1/admin/users/{uid}/credits", headers=headers, json={"delta": -9, "note": "sửa nhầm"}).status_code == 400
    r = client.post(f"/api/v1/admin/users/{uid}/credits", headers=headers, json={"delta": -2, "note": "sửa nhầm"})
    assert r.json()["user"]["credits"] == 4 and r.json()["ledger_balance"] == 4

    r = client.put(f"/api/v1/admin/users/{uid}/lock", headers=headers, json={"locked": True, "note": "spam"})
    assert r.json()["user"]["deleted"] is True
    assert client.get("/api/v1/admin/users?q=khach", headers=headers).json()["total"] == 0
    assert client.get("/api/v1/admin/users?q=khach&state=deleted", headers=headers).json()["total"] == 1
    assert client.put(f"/api/v1/admin/users/{admin_id}/lock", headers=headers, json={"locked": True}).status_code == 400
    client.put(f"/api/v1/admin/users/{uid}/lock", headers=headers, json={"locked": False})

    g = client.post("/api/v1/admin/users/gift", headers=headers,
                    json={"emails": ["khach@example.com", "KHACH@example.com", "nobody@x.vn"], "credits": 2, "batch": "beta1"}).json()
    assert g == {"credited": ["khach@example.com"], "already": [], "not_found": ["nobody@x.vn"]}
    again = client.post("/api/v1/admin/users/gift", headers=headers, json={"emails": ["khach@example.com"], "credits": 2, "batch": "beta1"}).json()
    assert again["already"] == ["khach@example.com"]
    detail = client.get(f"/api/v1/admin/users/{uid}", headers=headers).json()
    assert [a["action"] for a in detail["audit"]] == ["user.unlock", "user.lock", "user.credits", "user.credits", "user.role"]


def test_payments_console(db, client, login, admin):
    headers, _ = admin
    _, body = login("mua@example.com")
    uid = uuid.UUID(body["user"]["id"])
    p = Payment(user_id=uid, amount_vnd=1_490_000, package_code="nursery", transfer_code="BSABC123", status=PaymentStatus.pending)
    p2 = Payment(user_id=uid, amount_vnd=49_000, package_code="le", transfer_code="BSXYZ999", status=PaymentStatus.pending)
    db.add_all([p, p2])
    db.commit()
    lst = client.get("/api/v1/admin/payments?q=bsabc", headers=headers).json()
    assert lst["total"] == 1 and lst["pending"] == 2 and lst["items"][0]["package_name"] == "Nhà vườn"
    r = client.post(f"/api/v1/admin/payments/{p.id}/confirm", headers=headers, json={"bank_ref": "FT2410251234"})
    assert r.status_code == 200 and r.json()["payment"]["status"] == "paid"
    user = db.get(User, uid)
    db.refresh(user)
    assert user.credits == 51 and user.role == UserRole.nursery  # 1 lượt dùng thử + 50
    assert client.post(f"/api/v1/admin/payments/{p.id}/confirm", headers=headers, json={"bank_ref": "FT2410251234"}).status_code == 409
    assert client.post(f"/api/v1/admin/payments/{p2.id}/confirm", headers=headers, json={"bank_ref": "FT2410251234"}).status_code == 409  # mã đã dùng
    assert client.post(f"/api/v1/admin/payments/{p2.id}/cancel", headers=headers, json={}).json()["payment"]["status"] == "cancelled"
    lst = client.get("/api/v1/admin/payments", headers=headers).json()
    assert lst["revenue_vnd"] == 1_490_000 and lst["by_package"][0]["orders"] == 1


def test_system_audit_and_catalog(db, client, admin, monkeypatch):
    headers, _ = admin

    class NoCelery:
        class control:
            @staticmethod
            def ping(timeout):
                return [{"celery@w1": {"ok": "pong"}}]

    monkeypatch.setattr("bonsai_api.routers.admin_system._celery", lambda: NoCelery)
    s = client.get("/api/v1/admin/system", headers=headers).json()
    assert s["workers"] == ["celery@w1"] and s["config"]["modes"]["cost_mode"] == "standard"
    assert {p["code"] for p in s["config"]["packages"]} == {"le", "player", "nursery"}

    from bonsai_api.scripts.seed import seed_dictionaries

    seed_dictionaries(db)
    db.commit()
    cat = client.get("/api/v1/admin/catalog", headers=headers).json()
    assert any(sp["key"] == "si" for sp in cat["species"]) and any(st["key"] == "moyogi" for st in cat["styles"])
    r = client.put("/api/v1/admin/catalog/species/si", headers=headers,
                   json={"name_vi": "Si (ficus)", "growth_speed": "fast", "prompt_desc_en": "ficus microcarpa with small leaves"})
    assert next(sp for sp in r.json()["species"] if sp["key"] == "si")["name_vi"] == "Si (ficus)"
    seed_dictionaries(db)  # khởi động lại api: seed không ghi đè bản admin đã sửa
    db.commit()
    db.expire_all()
    assert db.get(Species, "si").name_vi == "Si (ficus)"
    assert client.put("/api/v1/admin/catalog/species/si", headers=headers,
                      json={"name_vi": "x", "growth_speed": "turbo", "prompt_desc_en": "ficus microcarpa"}).status_code == 422

    audit = client.get("/api/v1/admin/audit?action=catalog", headers=headers).json()
    assert audit["total"] == 1 and audit["items"][0]["detail"]["before"]["name_vi"] == "Si"


def test_settings_change_is_audited(db, client, admin):
    headers, _ = admin
    client.put("/api/v1/admin/settings", headers=headers, json={"cost_mode": "economy"})
    client.put("/api/v1/admin/settings", headers=headers, json={"cost_mode": "economy"})  # không đổi → không ghi
    rows = db.query(AdminAudit).all()
    assert [(a.action, a.target_id, a.detail) for a in rows] == [
        ("settings.update", "cost_mode", {"before": "standard", "after": "economy"})]


def test_ledger_reason_adjust_allowed_in_db(db, client, login):
    _, body = login("x@example.com")
    uid = uuid.UUID(body["user"]["id"])
    assert apply_credit(db, uid, 3, CreditReason.adjust, "adm:test")
    db.commit()
    assert db.query(CreditLedger).filter_by(user_id=uid, reason=CreditReason.adjust).one().delta == 3
