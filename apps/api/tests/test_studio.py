"""Màn Tự thiết kế: lấy dữ liệu, lưu thiết kế của người dùng thành phương án, chọn để tạo ảnh."""

import io
import uuid

from PIL import Image
from sqlalchemy import select

from bonsai_api.db.models import DesignJob, DesignOption, JobStatus, TreePhoto
from bonsai_api.scripts.seed import seed_dictionaries
from bonsai_pipeline.rule_engine import compute_targets
from bonsai_pipeline.schemas import Analysis

from test_jobs import _ready_job
from test_week5 import bucket  # noqa: F401

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "packages" / "pipeline" / "tests"))
from samples import analysis  # noqa: E402


def _studio_job(db, client, login, bucket):  # noqa: F811
    headers, job_id, _ = _ready_job(db, client, login, credits=2)
    seed_dictionaries(db)
    job = db.get(DesignJob, job_id)
    a = analysis()
    job.analysis = a
    job.targets = compute_targets(Analysis.model_validate(a), image_size=(1000, 1500), real_height_cm=60).as_dict()
    photo = db.execute(select(TreePhoto).where(TreePhoto.tree_id == job.tree_id)).scalars().first()
    photo.storage_key, photo.width, photo.height = "trees/t/p.webp", 1000, 1500
    buf = io.BytesIO()
    Image.new("RGB", (1000, 1500), (200, 190, 170)).save(buf, format="WEBP")
    bucket[photo.storage_key] = buf.getvalue()
    job.front_photo_id = photo.id
    db.commit()
    return headers, job


DESIGN = {
    "style_key": "moyogi", "removed": ["b2", "b5"],
    "pads": [{"center_px": [420, 1000], "rx": 180, "ry": 60}, {"center_px": [640, 800], "rx": 150, "ry": 55},
             {"center_px": [500, 560], "rx": 110, "ry": 45}],
    "apex": [515, 400], "new_branches": [{"at_px": [490, 700], "direction": "left"}],
    "pot": {"shape": "rectangle", "color": "unglazed_brown", "position": "off_center_left"},
}


def test_studio_load_save_and_choose(db, client, login, bucket, monkeypatch):  # noqa: F811
    sent = []
    monkeypatch.setattr("bonsai_api.queue.enqueue", lambda *a, **kw: sent.append(a) or True)
    headers, job = _studio_job(db, client, login, bucket)
    s = client.get(f"/api/v1/jobs/{job.id}/studio", headers=headers).json()
    assert s["width"] == 1000 and len(s["branches"]) == 5 and s["draft"] is None
    assert s["templates"][0]["style_key"] == "moyogi" and any(st["key"] == "moyogi" and st["suggested"] for st in s["styles"])

    r = client.post(f"/api/v1/jobs/{job.id}/my-design", headers=headers, json=DESIGN)
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["hints"] == [] and out["sketch_svg_url"]
    assert 'data-layer="canopy"' in bucket[f"trees/{job.tree_id}/jobs/{job.id}/sketch_user.svg"].decode()
    # lưu lại (sửa) → cùng một phương án, không tạo thêm
    again = client.post(f"/api/v1/jobs/{job.id}/my-design", headers=headers, json={**DESIGN, "removed": []}).json()
    assert again["option_id"] == out["option_id"] and any("ngang nhau" in h for h in again["hints"])
    assert client.get(f"/api/v1/jobs/{job.id}/studio", headers=headers).json()["draft"]["removed"] == []

    j = client.get(f"/api/v1/jobs/{job.id}", headers=headers).json()
    mine = next(o for o in j["options"] if o["source"] == "user")
    assert mine["rank"] == 9 and mine["why_vi"] == "Thiết kế của bạn"
    r = client.post(f"/api/v1/jobs/{job.id}/choose", headers=headers, json={"option_id": mine["id"]})
    assert r.status_code == 200 and r.json()["status"] == "rendering_final"
    assert sent[-1][0] == "bonsai_worker.tasks.phase_b.run"
    # đã tạo ảnh → không sửa thiết kế nữa
    assert client.post(f"/api/v1/jobs/{job.id}/my-design", headers=headers, json=DESIGN).status_code == 409


def test_studio_rejects_bad_input(db, client, login, bucket):  # noqa: F811
    headers, job = _studio_job(db, client, login, bucket)
    assert client.post(f"/api/v1/jobs/{job.id}/my-design", headers=headers, json={**DESIGN, "style_key": "khong-co"}).status_code == 400
    many = {**DESIGN, "pads": [{"center_px": [500, 500], "rx": 10, "ry": 10}] * 13}
    assert client.post(f"/api/v1/jobs/{job.id}/my-design", headers=headers, json=many).status_code == 422
    other, _ = login("khac@example.com")
    assert client.get(f"/api/v1/jobs/{job.id}/studio", headers=other).status_code == 404
    opt = db.execute(select(DesignOption).where(DesignOption.job_id == job.id)).scalars().all()
    assert all(o.rank != 9 for o in opt)
    assert uuid.UUID(str(job.id)) and job.status == JobStatus.awaiting_choice


SPRITE_DESIGN = {**DESIGN, "pot_kind": "pot_oval_brown", "pot_width": 600, "pot_x": 520,
                 "pads": [{**p, "kind": "ficus_wide"} for p in DESIGN["pads"]],
                 "accents": [{"kind": "moss", "center_px": [500, 1290], "width": 300}]}


def test_quick_preview_limits_and_share_page(db, client, login, bucket, monkeypatch):  # noqa: F811
    sent = []
    monkeypatch.setattr("bonsai_api.queue.enqueue", lambda *a, **kw: sent.append(a) or True)
    headers, job = _studio_job(db, client, login, bucket)
    assert client.post(f"/api/v1/jobs/{job.id}/my-design/preview", headers=headers).status_code == 409  # chưa lưu
    assert client.post(f"/api/v1/jobs/{job.id}/my-design", headers=headers, json=SPRITE_DESIGN).status_code == 200
    r = client.post(f"/api/v1/jobs/{job.id}/my-design/preview", headers=headers)
    assert r.status_code == 202 and r.json() == {"state": "running", "url": None, "remaining": 1}
    assert sent[-1] == ("bonsai_worker.tasks.studio.preview", str(job.id))
    # worker xong lần 1, chạy lần 2, rồi hết lượt xem thử
    j = db.get(DesignJob, job.id)
    j.progress = {**j.progress, "preview": {"state": "done", "count": 1, "key": "trees/x/PV_1.webp"}}
    db.commit()
    assert client.post(f"/api/v1/jobs/{job.id}/my-design/preview", headers=headers).json()["remaining"] == 0
    j = db.get(DesignJob, job.id)
    db.refresh(j)
    j.progress = {**j.progress, "preview": {**j.progress["preview"], "state": "done"}}
    db.commit()
    r = client.post(f"/api/v1/jobs/{job.id}/my-design/preview", headers=headers)
    assert r.status_code == 429 and "2 lần" in r.json()["detail"]
    st = client.get(f"/api/v1/jobs/{job.id}/my-design/preview", headers=headers).json()
    assert st["state"] == "done" and st["url"] and st["remaining"] == 0

    sh = client.post(f"/api/v1/jobs/{job.id}/my-design/share", headers=headers).json()
    code = sh["url"].rsplit("/", 1)[1]
    page = client.get(f"/tk/{code}")
    assert page.status_code == 200 and "Nhờ góp ý" in page.text and 'property="og:image"' in page.text
    img = client.get(f"/api/v1/public/designs/{code}.jpg")
    assert img.status_code == 200 and img.headers["content-type"] == "image/jpeg"
    again = client.post(f"/api/v1/jobs/{job.id}/my-design/share", headers=headers).json()
    assert again["url"] == sh["url"]  # giữ nguyên link
    # lưu lại thiết kế (vd. trước khi xem thử) không làm hỏng link đã gửi
    assert client.post(f"/api/v1/jobs/{job.id}/my-design", headers=headers, json=SPRITE_DESIGN).status_code == 200
    assert client.get(f"/tk/{code}").status_code == 200
    assert client.get("/tk/khongco").status_code == 404
