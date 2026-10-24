import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from bonsai_api.db.models import CreditLedger, Listing, Referral, User
from bonsai_api.services.referrals import reward_if_due

from test_week5 import _done_job as _done_stub, bucket  # noqa: F401 (fixture)

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "packages" / "pipeline" / "tests"))
from samples import analysis, option  # noqa: E402


def _done_job(db, client, login, bucket):  # noqa: F811
    """Phiên đã xong với phân tích + phương án mẫu thật (phôi si 1000×1500, cao 60 cm)."""
    from bonsai_api.db.models import DesignJob, DesignOption, Tree

    headers, job = _done_stub(db, client, login, bucket)
    job = db.get(DesignJob, job.id)
    job.analysis = analysis()
    db.get(DesignOption, job.chosen_option_id).design = option()
    db.get(Tree, job.tree_id).real_height_cm = 60
    db.commit()
    return headers, job


def test_tools_for_my_design(db, client, login, bucket):  # noqa: F811
    headers, job = _done_job(db, client, login, bucket)
    w = client.get(f"/api/v1/tools/wire/{job.id}", headers=headers).json()
    assert w["scale_known"] and w["lines"] and all(m > 0 for _, m in w["shopping"])
    g = client.get(f"/api/v1/tools/graft/{job.id}", headers=headers).json()
    assert "spots" in g and g["season_vi"]
    p = client.get(f"/api/v1/tools/price/{job.id}", headers=headers).json()
    assert p["basis"] == "rules" and p["low"] < p["high"]
    # đủ 5 tin đăng cùng loài có giá → định giá theo thị trường
    owner = db.execute(select(User)).scalars().first()
    for i in range(5):
        db.add(Listing(user_id=owner.id, code=f"T{i}", title="Phôi si", species_key="si", price_vnd=2_000_000 + i * 100_000, trunk_cm=8))
    db.commit()
    assert client.get(f"/api/v1/tools/price/{job.id}", headers=headers).json()["basis"] == "listings"
    other, _ = login("other@example.com")
    assert client.get(f"/api/v1/tools/wire/{job.id}", headers=other).status_code == 404  # không xem phiên người khác


def test_public_tools(client):
    qs = client.get("/api/v1/tools/rescue/questions").json()
    assert len(qs) == 7
    r = client.post("/api/v1/tools/rescue", json={"answers": {"wilting": True, "dry_soil": True}}).json()
    assert r["causes"] == ["thirst"] and r["now"]
    m = client.get("/api/v1/tools/menh?year=1984").json()
    assert m["element"] == "Kim" and m["can_chi"] == "Giáp Tý"
    assert client.get("/api/v1/tools/menh?year=1800").status_code == 422
    mai = client.get("/api/v1/tools/mai-tet?province=ho_chi_minh").json()
    assert mai["region"] == "south" and mai["province"] == "ho_chi_minh" and mai["steps"]
    assert len(client.get("/api/v1/tools/provinces").json()) == 34


def test_profile_fields(client, login):
    headers, _ = login()
    r = client.patch("/api/v1/me", headers=headers, json={"birth_year": 1975, "province": "can_tho", "bio": " Chơi si 20 năm "})
    assert r.json()["birth_year"] == 1975 and r.json()["province"] == "can_tho" and r.json()["bio"] == "Chơi si 20 năm"
    assert client.patch("/api/v1/me", headers=headers, json={"province": "sai_gon"}).status_code == 400


def test_referral_claim_and_reward(db, client, login, bucket):  # noqa: F811
    a, a_body = login("a@example.com")
    ref = client.get("/api/v1/me/referral", headers=a).json()
    assert len(ref["code"]) == 6 and ref["link"].endswith(f"?ref={ref['code']}") and ref["invited"] == 0
    assert client.get("/api/v1/me/referral", headers=a).json()["code"] == ref["code"]  # ổn định
    assert client.post("/api/v1/me/referral/claim", headers=a, json={"code": ref["code"]}).json()["detail"] == "Không tự giới thiệu chính mình được."

    headers, job = _done_job(db, client, login, bucket)  # người mới (nhavuon@example.com) có phiên đã xong
    assert client.post("/api/v1/me/referral/claim", headers=headers, json={"code": "ZZZZZZ"}).status_code == 400
    assert client.post("/api/v1/me/referral/claim", headers=headers, json={"code": ref["code"].lower()}).status_code == 204
    assert client.post("/api/v1/me/referral/claim", headers=headers, json={"code": ref["code"]}).json()["detail"] == "Bạn đã nhập mã giới thiệu rồi."

    assert reward_if_due(db, job.user_id) is True
    db.commit()
    assert reward_if_due(db, job.user_id) is False  # chỉ một lần
    rows = db.execute(select(CreditLedger.user_id, CreditLedger.delta).where(CreditLedger.reason == "referral")).all()
    assert sorted(str(u) for u, _ in rows) == sorted([str(job.user_id), a_body["user"]["id"]]) and all(d == 1 for _, d in rows)
    assert client.get("/api/v1/me/referral", headers=a).json()["rewarded"] == 1

    # quá 30 ngày thì không nhập mã được nữa
    late, body = login("late@example.com")
    u = db.get(User, uuid.UUID(body["user"]["id"]))
    u.created_at = datetime.now(UTC) - timedelta(days=40)
    db.commit()
    assert client.post("/api/v1/me/referral/claim", headers=late, json={"code": ref["code"]}).status_code == 400
    assert db.execute(select(Referral)).scalars().all().__len__() == 1
