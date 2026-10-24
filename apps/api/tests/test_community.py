"""Đợt 3: mốc nhật ký có thưởng, dự đoán và thực tế, quẹt chọn dáng, bậc tay nghề, thử thách, sổ cây, báo mất."""

import io
import uuid
from datetime import UTC, datetime, timedelta

import numpy as np
from PIL import Image, ImageDraw
from sqlalchemy import select

from bonsai_api.db.models import (
    Challenge, DesignJob, DesignOption, PhotoSource, Tree, TreePhoto, User, UserRole,
)

from test_studio import DESIGN, _studio_job
from test_week5 import _done_job, bucket  # noqa: F401 (fixture)


def _photo(seed: int) -> bytes:
    rng = np.random.default_rng(seed)  # vỏ thân / nền khác nhau theo cây
    img = Image.fromarray(rng.integers(90, 230, (60, 40, 3), dtype=np.uint8)).resize((400, 600), Image.Resampling.BICUBIC)
    d = ImageDraw.Draw(img)
    for i in range(6):
        d.line([(200, 580), (int(rng.integers(60, 340)), 300 - i * 30)], fill=(60, 45, 30), width=18 - i * 2)
    buf = io.BytesIO()
    img.save(buf, "WEBP")
    return buf.getvalue()


def test_diary_milestone_reward(db, client, login, bucket):  # noqa: F811
    headers, job = _done_job(db, client, login, bucket)
    j = db.get(DesignJob, job.id)
    j.finished_at = datetime.now(UTC) - timedelta(days=29)  # mốc 1 tháng đang mở
    db.commit()
    before = client.get("/api/v1/me", headers=headers).json()["credits"]
    key = f"uploads/{j.user_id}/d1.jpg"
    r = client.post(f"/api/v1/trees/{j.tree_id}/progress", headers=headers, json={"key": key})
    assert r.status_code == 201 and r.json()["reward"] == 1
    assert client.post(f"/api/v1/trees/{j.tree_id}/progress", headers=headers, json={"key": key}).json()["reward"] == 0  # một lần / mốc
    assert client.get("/api/v1/me", headers=headers).json()["credits"] == before + 1
    ms = client.get(f"/api/v1/trees/{j.tree_id}/milestones", headers=headers).json()
    assert [m["month"] for m in ms] == [1, 3, 6] and ms[0]["rewarded"] and ms[0]["photo_taken"] and not ms[1]["rewarded"]
    assert "Thưởng nhật ký mốc 1 tháng" in str(client.get("/api/v1/me/credits", headers=headers).json())


def test_reality_compare(db, client, login, bucket):  # noqa: F811
    headers, job = _done_job(db, client, login, bucket)
    j = db.get(DesignJob, job.id)
    j.finished_at = datetime.now(UTC) - timedelta(days=400)
    assert client.get(f"/api/v1/trees/{j.tree_id}/reality", headers=headers).json() is None  # chưa có ảnh thật
    db.add(TreePhoto(tree_id=j.tree_id, storage_key="trees/t/real.webp", view_index=101, is_front=False,
                     source=PhotoSource.progress, taken_at=datetime.now(UTC)))
    db.commit()
    r = client.get(f"/api/v1/trees/{j.tree_id}/reality", headers=headers).json()
    assert r["months"] > 12 and r["stage_code"] == "S2" and r["real_url"] and r["predicted_url"] is None  # 13 tháng / 4 năm
    assert client.post(f"/api/v1/trees/{j.tree_id}/reality", headers=headers, json={"score": 4}).status_code == 204
    assert client.get(f"/api/v1/trees/{j.tree_id}/reality", headers=headers).json()["score"] == 4
    assert client.post(f"/api/v1/trees/{j.tree_id}/reality", headers=headers, json={"score": 9}).status_code == 422


def test_design_votes(db, client, login, bucket):  # noqa: F811
    owner_h, job = _done_job(db, client, login, bucket)
    j = db.get(DesignJob, job.id)
    first = db.execute(select(DesignOption).where(DesignOption.job_id == j.id)).scalars().first()
    first.sketch_png_key = "trees/t/s1.png"
    second = DesignOption(job_id=j.id, rank=2, style_key="chokkan", suitability=0.7, design={"why_vi": "x"}, sketch_png_key="trees/t/s2.png")
    db.add(second)
    db.commit()
    voter, _ = login("voter@example.com")
    assert client.get("/api/v1/votes/next", headers=voter).json() is None  # chủ chưa chia sẻ công khai
    j.share_code = "abc12345"
    db.commit()
    assert client.get("/api/v1/votes/next", headers=owner_h).json() is None  # không tự chấm phôi của mình
    p = client.get("/api/v1/votes/next", headers=voter).json()
    assert {p["a"]["id"], p["b"]["id"]} == {str(first.id), str(second.id)} and p["a"]["image_url"]
    body = {"job_id": p["job_id"], "winner_id": p["a"]["id"], "loser_id": p["b"]["id"]}
    assert client.post("/api/v1/votes", headers=voter, json=body).status_code == 204
    assert client.post("/api/v1/votes", headers=voter, json=body).status_code == 204  # bấm lại không lỗi
    assert client.get("/api/v1/votes/next", headers=voter).json() is None
    bad = {**body, "loser_id": str(uuid.uuid4())}
    assert client.post("/api/v1/votes", headers=voter, json=bad).status_code == 400


def test_skill_level(db, client, login):
    headers, _ = login()
    s = client.get("/api/v1/me/skill", headers=headers).json()
    assert s["level"] == "hoc_tro" and s["next_vi"] == "Thợ" and {p["key"] for p in s["progress"]} == {"designs", "diary", "votes"}


def test_challenge_flow(db, client, login, bucket):  # noqa: F811
    owner_h, job = _studio_job(db, client, login, bucket)
    admin_h, admin_body = login("admin@example.com")
    db.get(User, uuid.UUID(admin_body["user"]["id"])).role = UserRole.admin
    db.commit()
    now = datetime.now(UTC)
    payload = {"title": "Thử thách si tháng 11", "job_id": str(job.id), "prize": "Chậu Bát Tràng",
               "starts_at": (now - timedelta(days=1)).isoformat(), "ends_at": (now + timedelta(days=10)).isoformat()}
    assert client.post("/api/v1/admin/challenges", headers=admin_h, json=payload).status_code == 400  # phôi của người chơi
    db.get(User, job.user_id).role = UserRole.artisan
    db.commit()
    assert client.post("/api/v1/admin/challenges", headers=owner_h, json=payload).status_code == 403
    cid = client.post("/api/v1/admin/challenges", headers=admin_h, json=payload).json()["id"]

    a, _ = login("a@example.com")
    b, _ = login("b@example.com")
    assert client.get(f"/api/v1/challenges/{cid}/studio", headers=a).json()["draft"] is None
    ea = client.post(f"/api/v1/challenges/{cid}/entry", headers=a, json=DESIGN)
    assert ea.status_code == 200, ea.text
    assert client.get(f"/api/v1/challenges/{cid}/studio", headers=a).json()["draft"]["style_key"] == "moyogi"
    eb = client.post(f"/api/v1/challenges/{cid}/entry", headers=b, json=DESIGN).json()
    assert client.post(f"/api/v1/challenges/{cid}/entry", headers=a, json=DESIGN).json()["id"] == ea.json()["id"]  # sửa bài, không thêm

    assert client.post(f"/api/v1/challenges/{cid}/vote", headers=a, json={"entry_id": ea.json()["id"]}).status_code == 400
    assert client.post(f"/api/v1/challenges/{cid}/vote", headers=a, json={"entry_id": eb["id"]}).status_code == 204
    c, _ = login("c@example.com")
    assert client.post(f"/api/v1/challenges/{cid}/vote", headers=c, json={"entry_id": ea.json()["id"]}).status_code == 204
    assert client.post(f"/api/v1/challenges/{cid}/vote", headers=c, json={"entry_id": eb["id"]}).status_code == 204  # đổi phiếu

    d = client.get(f"/api/v1/challenges/{cid}", headers=c).json()
    assert d["state"] == "open" and d["entries"] and all(e["votes"] is None for e in d["entries"]) and d["my_vote"] == eb["id"]
    assert [x["title"] for x in client.get("/api/v1/challenges", headers=c).json()] == ["Thử thách si tháng 11"]

    ch = db.get(Challenge, uuid.UUID(cid))
    ch.ends_at = now - timedelta(minutes=1)
    db.commit()
    d = client.get(f"/api/v1/challenges/{cid}", headers=c).json()
    assert d["state"] == "closed" and [e["votes"] for e in d["entries"]] == [2, 0]
    assert client.post(f"/api/v1/challenges/{cid}/entry", headers=a, json=DESIGN).status_code == 409


def test_passport_transfer_and_stolen(db, client, login, bucket):  # noqa: F811
    from bonsai_api.services.stolen import stolen_matches

    headers, job = _done_job(db, client, login, bucket)
    tree_id = db.get(DesignJob, job.id).tree_id
    p = client.post(f"/api/v1/trees/{tree_id}/passport", headers=headers).json()
    assert len(p["code"]) == 8 and p["url"].endswith(f"/so-cay/{p['code']}") and not p["public"]
    assert client.post(f"/api/v1/trees/{tree_id}/passport", headers=headers).json()["code"] == p["code"]
    assert client.get(f"/api/v1/public/passport/{p['code']}").status_code == 404  # chưa công khai
    assert client.patch(f"/api/v1/trees/{tree_id}/passport", headers=headers, json={"public": True}).json()["public"]
    pub = client.get(f"/api/v1/public/passport/{p['code'].lower()}").json()
    assert pub["species_vi"] and [t["kind"] for t in pub["timeline"]] == ["design"] and not pub["stolen"]
    qr = client.get(f"/api/v1/public/passport/{p['code']}/qr.svg")
    assert qr.status_code == 200 and b"<svg" in qr.content

    t = client.post(f"/api/v1/trees/{tree_id}/transfer", headers=headers).json()
    code = t["pending_transfer"]
    assert code and client.post(f"/api/v1/trees/{tree_id}/transfer", headers=headers).json()["pending_transfer"] == code
    assert client.post("/api/v1/transfers/accept", headers=headers, json={"code": code}).status_code == 400  # của chính mình
    buyer, buyer_body = login("buyer@example.com")
    assert client.post("/api/v1/transfers/accept", headers=buyer, json={"code": code.lower()}).json()["tree_id"] == str(tree_id)
    db.expire_all()
    assert str(db.get(Tree, tree_id).user_id) == buyer_body["user"]["id"]
    assert str(db.get(DesignJob, job.id).user_id) == buyer_body["user"]["id"]  # xem được kết quả cũ
    assert client.get(f"/api/v1/jobs/{job.id}/result", headers=buyer).status_code == 200
    assert client.post("/api/v1/transfers/accept", headers=buyer, json={"code": code}).status_code == 400  # dùng một lần
    assert client.patch(f"/api/v1/trees/{tree_id}/passport", headers=headers, json={"public": True}).status_code == 404  # chủ cũ hết quyền

    # báo mất: trang sổ hiện cảnh báo dù không công khai; không chuyển chủ được; ảnh tin đăng giống → gợi ý
    assert client.patch(f"/api/v1/trees/{tree_id}/passport", headers=buyer, json={"stolen": True}).json()["stolen"]
    pub = client.get(f"/api/v1/public/passport/{p['code']}").json()
    assert pub["stolen"] and pub["timeline"] == []
    assert client.post(f"/api/v1/trees/{tree_id}/transfer", headers=buyer).status_code == 409
    front = db.execute(select(TreePhoto).where(TreePhoto.tree_id == tree_id, TreePhoto.is_front.is_(True))).scalars().first()
    bucket[front.storage_key] = _photo(1)
    assert [x.id for x in stolen_matches(db, _photo(1))] == [tree_id]
    assert stolen_matches(db, _photo(4)) == []
