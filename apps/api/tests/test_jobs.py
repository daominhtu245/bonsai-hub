import json
import uuid

import pytest
from sqlalchemy import select

from bonsai_api.db.models import CreditLedger, DesignJob, DesignOption, JobStatus, User


def _tree(client, headers):
    key = client.post("/api/v1/uploads/presign", headers=headers,
                      json={"content_type": "image/jpeg", "size_bytes": 1000}).json()["key"]
    return client.post("/api/v1/trees", headers=headers, json={"photos": [{"key": key, "view_index": 0}]}).json()


def _ready_job(db, client, login, credits=None):
    headers, body = login()
    tree = _tree(client, headers)
    job = client.post(f"/api/v1/trees/{tree['id']}/jobs", headers=headers, json={"goal": "sale"}).json()
    j = db.get(DesignJob, uuid.UUID(job["id"]))
    j.status = JobStatus.awaiting_choice
    j.analysis = {"image_quality": {"usable": True, "issues": []}, "species": {"guess": "si", "confidence": 0.9},
                  "summary_vi": "Phôi si", "branches": [{}, {}]}
    j.targets = {"real_height_cm": 45, "base_diameter_cm": 4.2, "cm_per_px": 0.05, "lower_apex_by_px": 160}
    opt = DesignOption(job_id=j.id, rank=1, style_key="moyogi", suitability=0.9,
                       design={"why_vi": "Hợp thân", "remove_branches": [{"id": "b2", "reason_vi": "Cành đối"}],
                               "new_branches_needed": [], "care_steps_vi": ["Bước 1"]},
                       sketch_svg_key="trees/x/sketch_1.svg", sketch_meta={"cut": 1, "keep": 3, "new": 0})
    db.add(opt)
    if credits is not None:
        db.get(User, uuid.UUID(body["user"]["id"])).credits = credits
    db.commit()
    return headers, j.id, opt.id


def test_create_job_enqueues_phase_a(client, login, enqueued):
    headers, _ = login()
    tree = _tree(client, headers)
    r = client.post(f"/api/v1/trees/{tree['id']}/jobs", headers=headers, json={"style": "moyogi", "goal": "display"})
    assert r.status_code == 202
    job = r.json()
    assert job["status"] == "queued" and job["options"] == [] and job["credits_left"] == 1
    assert ("bonsai_worker.tasks.phase_a.run", (job["id"],), {}) in enqueued
    other, _ = login("khac@example.com")
    assert client.get(f"/api/v1/jobs/{job['id']}", headers=other).status_code == 404
    assert client.post(f"/api/v1/trees/{tree['id']}/jobs", headers=other, json={}).status_code == 404


def test_daily_limit(client, login, monkeypatch):
    from bonsai_api.settings import get_settings

    monkeypatch.setattr(get_settings(), "phase_a_daily_limit", 2)
    headers, _ = login()
    tree = _tree(client, headers)
    codes = [client.post(f"/api/v1/trees/{tree['id']}/jobs", headers=headers, json={}).status_code for _ in range(3)]
    assert codes == [202, 202, 429]


def test_job_view_has_summary_and_options(db, client, login):
    headers, job_id, opt_id = _ready_job(db, client, login)
    job = client.get(f"/api/v1/jobs/{job_id}", headers=headers).json()
    assert job["analysis"]["species_key"] == "si" and job["analysis"]["base_diameter_cm"] == 4.2
    assert job["analysis"]["lower_apex_cm"] == 8.0 and job["analysis"]["branch_count"] == 2
    o = job["options"][0]
    assert o["name_vi"] == "Trực uốn" and o["name_jp"] == "Moyogi" and o["counts"]["cut"] == 1
    assert o["remove_reasons_vi"] == ["Cành đối"] and "X-Amz-Signature" in o["sketch_svg_url"]
    assert "X-Amz-Signature" in job["front_photo"]["url"]


def test_choose_spends_one_credit_once(db, client, login, enqueued):
    headers, job_id, opt_id = _ready_job(db, client, login)
    r = client.post(f"/api/v1/jobs/{job_id}/choose", headers=headers, json={"option_id": str(opt_id)})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "rendering_final" and r.json()["credits_left"] == 0
    assert ("bonsai_worker.tasks.phase_b.run", (str(job_id),), {"queue": "render"}) in enqueued
    again = client.post(f"/api/v1/jobs/{job_id}/choose", headers=headers, json={"option_id": str(opt_id)})
    assert again.status_code == 200 and again.json()["credits_left"] == 0
    renders = db.execute(select(CreditLedger).where(CreditLedger.reason == "render")).scalars().all()
    assert len(renders) == 1


def test_choose_without_credit(db, client, login):
    headers, job_id, opt_id = _ready_job(db, client, login, credits=0)
    r = client.post(f"/api/v1/jobs/{job_id}/choose", headers=headers, json={"option_id": str(opt_id)})
    assert r.status_code == 402 and "hết lượt" in r.json()["detail"]
    assert db.get(DesignJob, job_id).status == JobStatus.awaiting_choice


def test_choose_rejects_foreign_option_and_wrong_state(db, client, login):
    headers, job_id, _ = _ready_job(db, client, login)
    r = client.post(f"/api/v1/jobs/{job_id}/choose", headers=headers, json={"option_id": str(uuid.uuid4())})
    assert r.status_code == 400
    j = db.get(DesignJob, job_id)
    j.status = JobStatus.analyzing
    db.commit()
    r = client.post(f"/api/v1/jobs/{job_id}/choose", headers=headers, json={"option_id": str(uuid.uuid4())})
    assert r.status_code == 409


def test_events_stream_ends_on_terminal_state(db, client, login, monkeypatch):
    monkeypatch.setattr("bonsai_api.routers.jobs.POLL_SECONDS", 0.01)
    headers, job_id, _ = _ready_job(db, client, login)
    with client.stream("GET", f"/api/v1/jobs/{job_id}/events", headers=headers) as r:
        assert r.headers["content-type"].startswith("text/event-stream")
        body = "".join(r.iter_text())
    events = [json.loads(line[6:]) for line in body.splitlines() if line.startswith("data: ")]
    assert events == [{"status": "awaiting_choice", "progress": {}, "error_code": None}]


def test_done_job_exposes_final_image(db, client, login):
    from bonsai_api.db.models import RenderImage

    headers, job_id, opt_id = _ready_job(db, client, login)
    j = db.get(DesignJob, job_id)
    j.status, j.chosen_option_id = JobStatus.done, opt_id
    j.progress = {"result": {"low_confidence": True, "years": 4}}
    db.add(RenderImage(job_id=j.id, stage_code="S4", attempt=0, storage_key="a/S4_0.webp", model="m", selected=False))
    db.add(RenderImage(job_id=j.id, stage_code="S4", attempt=1, storage_key="a/S4_1.webp", model="m", selected=True))
    db.commit()
    out = client.get(f"/api/v1/jobs/{job_id}", headers=headers).json()
    assert out["result"]["low_confidence"] is True and out["result"]["years"] == 4
    assert "S4_1.webp" in out["result"]["final_url"] and out["result"]["chosen_style_vi"] == "Trực uốn"


def _done_with_stages(db, client, login):
    from bonsai_api.db.models import RenderImage, Stage

    headers, job_id, opt_id = _ready_job(db, client, login)
    j = db.get(DesignJob, job_id)
    j.status, j.chosen_option_id = JobStatus.done, opt_id
    j.progress = {"result": {"low_confidence": False, "years": 4}}
    j.report = {"material_review_vi": "Phôi khỏe", "guide_disclaimer_vi": "Ảnh là minh hoạ định hướng."}
    imgs = {}
    for code in ("S1", "S3", "S4"):
        r = RenderImage(job_id=j.id, stage_code=code, attempt=0, storage_key=f"a/{code}_0.webp", model="m", selected=True)
        db.add(r)
        db.flush()
        imgs[code] = r.id
    guide = lambda c: {"id": c, "title_vi": f"Giai đoạn {c}", "see_vi": "thấy", "actions_vi": ["việc 1", "việc 2"],
                       "best_time_vi": "xuân", "care_vi": [], "ready_signs_vi": [], "common_mistakes_vi": ["lỗi"]}
    for code in ("S0", "S1", "S2", "S3", "S4"):
        db.add(Stage(job_id=j.id, code=code, time_from_start=f"t{code}", image_id=imgs.get(code), guide_vi=guide(code),
                     plan={"fallback": "sketch"} if code == "S2" else {"name_vi": f"Tên {code}"}))
    db.commit()
    return headers, job_id


def test_result_tasks_and_feedback(db, client, login):
    headers, job_id = _done_with_stages(db, client, login)
    r = client.get(f"/api/v1/jobs/{job_id}/result", headers=headers).json()
    st = {s["code"]: s for s in r["stages"]}
    assert [s["code"] for s in r["stages"]] == ["S0", "S1", "S2", "S3", "S4"]
    assert st["S2"]["fallback_sketch"] and st["S2"]["image_url"] is None and r["sketch_svg_url"]
    assert "S3_0.webp" in st["S3"]["image_url"] and st["S0"]["image_url"]  # S0 = ảnh gốc
    assert st["S1"]["name_vi"] == "Tên S1" and st["S2"]["short_vi"] == "Nuôi cành"
    assert r["style_vi"] == "Trực uốn" and r["disclaimer_vi"] == "Ảnh là minh hoạ định hướng." and r["my_rating"] is None

    url = f"/api/v1/jobs/{job_id}/tasks"
    assert client.put(url, headers=headers, json={"stage_code": "S1", "task_index": 1, "done": True}).status_code == 204
    assert client.put(url, headers=headers, json={"stage_code": "S1", "task_index": 1, "done": True}).status_code == 204
    assert client.put(url, headers=headers, json={"stage_code": "S1", "task_index": 5, "done": True}).status_code == 400
    assert client.get(f"/api/v1/jobs/{job_id}/result", headers=headers).json()["stages"][1]["done_tasks"] == [1]
    client.put(url, headers=headers, json={"stage_code": "S1", "task_index": 1, "done": False})
    assert client.get(f"/api/v1/jobs/{job_id}/result", headers=headers).json()["stages"][1]["done_tasks"] == []

    fb = f"/api/v1/jobs/{job_id}/feedback"
    assert client.post(fb, headers=headers, json={"rating": 1}).status_code == 204
    assert client.post(fb, headers=headers, json={"rating": -1, "reason_tags": ["wrong_style"]}).status_code == 204
    assert client.get(f"/api/v1/jobs/{job_id}/result", headers=headers).json()["my_rating"] == -1
    assert client.post(fb, headers=headers, json={"rating": 3}).status_code == 422


def test_result_not_ready(db, client, login):
    headers, job_id, _ = _ready_job(db, client, login)
    assert client.get(f"/api/v1/jobs/{job_id}/result", headers=headers).status_code == 409


def test_retry_choose_after_phase_b_failure(db, client, login, enqueued):
    from bonsai_api.services.credits import refund_render

    headers, job_id, opt_id = _ready_job(db, client, login)
    assert client.post(f"/api/v1/jobs/{job_id}/choose", headers=headers, json={"option_id": str(opt_id)}).status_code == 200
    j = db.get(DesignJob, job_id)
    assert j.charge_ref == str(job_id)
    # phiên B lỗi → worker hoàn lượt
    refund_render(db, j.user_id, j.id, j.charge_ref)
    j.status, j.error_code = JobStatus.failed, "image_unavailable"
    db.commit()
    view = client.get(f"/api/v1/jobs/{job_id}", headers=headers).json()
    assert view["can_retry"] and view["credits_left"] == 1

    r = client.post(f"/api/v1/jobs/{job_id}/choose", headers=headers, json={"option_id": str(opt_id)})
    assert r.status_code == 200 and r.json()["status"] == "rendering_final" and r.json()["credits_left"] == 0
    db.expire_all()
    assert db.get(DesignJob, job_id).charge_ref == f"{job_id}#2" and db.get(DesignJob, job_id).error_code is None
    assert [c for c in enqueued if c[0].endswith("phase_b.run")].__len__() == 2


def test_create_job_with_region_and_front(db, client, login):
    from bonsai_api.db.models import TreePhoto

    headers, _ = login()
    tree = _tree(client, headers)
    photo_id = tree["photos"][0]["id"]
    r = client.post(f"/api/v1/trees/{tree['id']}/jobs", headers=headers, json={"region": "north", "front_photo_id": photo_id})
    assert r.status_code == 202
    j = db.get(DesignJob, uuid.UUID(r.json()["id"]))
    assert j.inputs == {"region": "north"} and str(j.front_photo_id) == photo_id
    other, _ = login("khac@example.com")
    other_tree = _tree(client, other)
    bad = client.post(f"/api/v1/trees/{tree['id']}/jobs", headers=headers, json={"front_photo_id": other_tree["photos"][0]["id"]})
    assert bad.status_code == 400
    assert client.post(f"/api/v1/trees/{tree['id']}/jobs", headers=headers, json={"region": "mars"}).status_code == 422
