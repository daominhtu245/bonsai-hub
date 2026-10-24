import copy
import uuid

from sqlalchemy import select

from bonsai_api.db.models import AdminAudit, ArtisanReview, RenderImage, RuleDoc, User, UserRole
from bonsai_pipeline.dictionaries import default_rule_doc

from test_week5 import _done_job, bucket  # noqa: F401 (fixture)


def _artisan(db, login, email="nghenhan@example.com"):
    headers, body = login(email)
    u = db.get(User, uuid.UUID(body["user"]["id"]))
    u.role = UserRole.artisan
    db.commit()
    return headers


def test_only_artisan_or_admin(db, client, login):
    player, _ = login("player@example.com")
    assert client.get("/api/v1/artisan/rules", headers=player).status_code == 403
    art = _artisan(db, login)
    assert client.get("/api/v1/artisan/rules", headers=art).status_code == 200
    assert client.get("/api/v1/admin/users", headers=art).status_code == 403  # không vào được phần quản trị khác


def test_edit_rules_with_versions_validation_and_rollback(db, client, login):
    art = _artisan(db, login)
    docs = {d["doc"]: d for d in client.get("/api/v1/artisan/rules", headers=art).json()}
    assert set(docs) == {"rule_set", "styles_vn", "species", "judging"} and docs["rule_set"]["active_version"] == 1
    cur = client.get("/api/v1/artisan/rules/rule_set", headers=art).json()
    assert cur["content"] == default_rule_doc("rule_set")

    bad = copy.deepcopy(cur["content"])
    bad["proportions"]["first_branch_height_ratio"] = [0.5, 0.2]
    assert client.post("/api/v1/artisan/rules/rule_set/validate", headers=art, json={"content": bad}).json()["errors"]
    r = client.post("/api/v1/artisan/rules/rule_set", headers=art, json={"content": bad, "note": "thử sai"})
    assert r.status_code == 422 and "từ < đến" in r.json()["detail"]

    good = copy.deepcopy(cur["content"])
    good["proportions"]["first_branch_height_ratio"] = [0.28, 0.36]
    r = client.post("/api/v1/artisan/rules/rule_set", headers=art, json={"content": good, "note": "Cành đầu cao hơn một chút"})
    assert r.status_code == 201
    out = r.json()
    assert out["active"]["version"] == 2 and out["active"]["created_by"] == "nghenhan@example.com"
    assert out["content"]["proportions"]["first_branch_height_ratio"] == [0.28, 0.36]
    assert [v["active"] for v in out["versions"]] == [True, False]
    assert db.execute(select(AdminAudit.action).where(AdminAudit.target_id == "rule_set.v2")).scalar_one() == "rules.save"

    # lưu nháp không áp dụng, rồi quay lại bản 1
    r = client.post("/api/v1/artisan/rules/rule_set", headers=art, json={"content": good, "note": "nháp", "activate": False})
    assert r.json()["active"]["version"] == 2 and len(r.json()["versions"]) == 3
    r = client.post("/api/v1/artisan/rules/rule_set/versions/1/activate", headers=art)
    assert r.json()["active"]["version"] == 1
    assert db.execute(select(RuleDoc.version).where(RuleDoc.doc == "rule_set", RuleDoc.active)).scalars().all() == [1]
    assert client.get("/api/v1/artisan/rules/rule_set/versions/3", headers=art).json()["note"] == "nháp"


def test_review_image_and_design_then_stats(db, client, login, bucket):  # noqa: F811
    _, job = _done_job(db, client, login, bucket)
    img = db.execute(select(RenderImage).where(RenderImage.job_id == job.id, RenderImage.selected)).scalar_one()
    img.total_score, img.judge = 7.2, {"hard_fail": [], "summary_en": "four pads"}
    db.commit()
    art = _artisan(db, login)

    sheet = client.get("/api/v1/artisan/judging", headers=art).json()
    assert "trunk_nebari" in sheet["criteria"] and "trunk_changed" in sheet["fidelity_hard_fail"]

    item = client.get("/api/v1/artisan/reviews/next?kind=image", headers=art).json()
    assert item["render_id"] == str(img.id) and item["remaining"] == 1 and item["result_url"] and item["photo_url"]
    assert "ai" not in str(item).lower() or "ai_total" not in item  # không lộ điểm AI trước khi chấm

    scores = {"trunk_nebari": 8, "branches": 6, "foliage_pads": 7}
    r = client.post("/api/v1/artisan/reviews", headers=art, json={"kind": "image", "render_id": item["render_id"],
                                                                  "scores": scores, "hard_fails": [], "passed": True,
                                                                  "comment": "Tầng 2 hơi to"})
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["total"] == round((8 * 20 + 6 * 15 + 7 * 15) / 50 * 10, 2) and out["ai_total"] == 72.0
    # chấm lại: cập nhật, không tạo dòng mới; có lỗi loại thẳng thì không đạt
    out = client.post("/api/v1/artisan/reviews", headers=art, json={"kind": "image", "render_id": item["render_id"],
                                                                    "scores": scores, "hard_fails": ["trunk_changed"],
                                                                    "passed": True}).json()
    assert out["passed"] is False and db.execute(select(ArtisanReview)).scalars().all().__len__() == 1
    assert client.get("/api/v1/artisan/reviews/next?kind=image", headers=art).json() is None

    d = client.get("/api/v1/artisan/reviews/next?kind=design", headers=art).json()
    assert d["option_id"] and d["sketch_svg_url"] and d["remaining"] >= 1
    nxt = client.get(f"/api/v1/artisan/reviews/next?kind=design&skip={d['option_id']}", headers=art).json()
    assert nxt is None or nxt["option_id"] != d["option_id"]  # bỏ qua
    assert client.post("/api/v1/artisan/reviews", headers=art, json={"kind": "design", "option_id": d["option_id"],
                                                                     "scores": {"branches": 11}, "passed": True}).status_code == 422
    client.post("/api/v1/artisan/reviews", headers=art, json={"kind": "design", "option_id": d["option_id"],
                                                              "scores": {"branches": 9}, "passed": True})

    st = client.get("/api/v1/artisan/stats", headers=art).json()
    assert st["image"]["count"] == 1 and st["image"]["pass_rate"] == 0 and st["image"]["hard_fails"] == [["trunk_changed", 1]]
    assert st["image"]["ai_agreement"]["pairs"] == 1 and st["image"]["ai_agreement"]["same_verdict"] == 0
    assert st["design"]["pass_rate"] == 1 and st["design"]["by_criterion"]["branches"]["avg"] == 9
    assert [r["count"] for r in st["reviewers"]] == [2] and "email" not in st["reviewers"][0]
