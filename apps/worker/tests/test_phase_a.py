import io
import json
import uuid

import pytest
from PIL import Image
from sqlalchemy import select

from bonsai_api.db.models import (
    CreditLedger, DesignJob, DesignOption, JobStatus, PipelineStep, Tree, TreePhoto, User,
)
from bonsai_api.services.credits import spend_for_render
from bonsai_pipeline.adapters.base import AIError
from bonsai_pipeline.adapters.llm_client import LLMClient
from bonsai_pipeline.adapters.providers.fake import FakeLLM
from bonsai_worker.tasks.phase_a import run_phase_a
from bonsai_worker.tasks.phase_b import run_phase_b

from pipeline_samples import analysis, design


@pytest.fixture
def bucket(monkeypatch):
    store: dict[str, bytes] = {}
    monkeypatch.setattr("bonsai_api.storage.get_bytes", lambda k: store[k])
    monkeypatch.setattr("bonsai_api.storage.put_bytes", lambda k, d, ct: store.__setitem__(k, d))
    monkeypatch.setattr("bonsai_api.storage.delete", lambda k: store.pop(k))
    return store


@pytest.fixture
def llm(monkeypatch):
    fake = FakeLLM(model="claude-sonnet-5-5")
    monkeypatch.setattr("bonsai_worker.tasks.phase_a.get_llm_client", lambda: LLMClient(fake))
    return fake


def _jpeg(w=1000, h=1500):
    buf = io.BytesIO()
    Image.new("RGB", (w, h), (200, 190, 170)).save(buf, format="JPEG")
    return buf.getvalue()


def _job(db, login, bucket, *, species=None, height=50.0, n_photos=2):
    _, body = login()
    user = db.get(User, uuid.UUID(body["user"]["id"]))
    tree = Tree(user_id=user.id, species_key=species, real_height_cm=height)
    tree.photos = []
    for i in range(n_photos):
        key = f"uploads/{user.id}/{i}.jpg"
        bucket[key] = _jpeg()
        tree.photos.append(TreePhoto(storage_key=key, view_index=i, is_front=i == 1))
    db.add(tree)
    db.flush()
    job = DesignJob(tree_id=tree.id, user_id=user.id, inputs={"style": "moyogi", "goal": "display"})
    db.add(job)
    db.commit()
    return user, tree, job


def test_phase_a_happy_path(db, login, bucket, llm):
    user, tree, job = _job(db, login, bucket)
    llm.responses.extend([json.dumps(analysis()), json.dumps(design())])
    run_phase_a(db, job.id)
    db.expire_all()
    job = db.get(DesignJob, job.id)
    assert job.status == JobStatus.awaiting_choice, job.error
    assert job.front_photo_id == next(p.id for p in tree.photos if p.is_front)
    assert job.prompt_version == "P1.v1+P2.v1"
    assert job.targets["target_height_px"] == 720 and job.targets["cv"]["cv_fallback"] is True
    assert {k: v["state"] for k, v in job.progress["steps"].items()} == dict.fromkeys(
        ["species", "trunk", "branches", "front", "design"], "done")
    assert job.progress["steps"]["branches"]["count"] == 5
    assert db.get(Tree, tree.id).species_key == "si"  # AI nhận diện khi người dùng chưa chọn

    opts = db.execute(select(DesignOption).where(DesignOption.job_id == job.id).order_by(DesignOption.rank)).scalars().all()
    assert [o.style_key for o in opts] == ["moyogi", "shakan", "bunjingi"]
    assert opts[0].sketch_meta["cut"] == 2
    assert bucket[opts[0].sketch_svg_key].startswith(b"<svg")
    assert Image.open(io.BytesIO(bucket[opts[0].sketch_png_key])).size == (1000, 1500)

    steps = db.execute(select(PipelineStep.step_code, PipelineStep.ok).where(PipelineStep.job_id == job.id)
                       .order_by(PipelineStep.id)).all()
    assert [s for s, _ in steps] == ["A0", "A0", "P1", "A2", "P2", "A5"] and all(ok for _, ok in steps)
    # P1 nhận ảnh mặt tiền trước
    assert llm.calls[0]["images"] == 2 and "1000x1500" in llm.calls[0]["messages"][0]["content"]

    run_phase_a(db, job.id)  # giao lại task: không chạy lại
    assert db.execute(select(PipelineStep).where(PipelineStep.job_id == job.id)).scalars().all().__len__() == 6


def test_unusable_photo_stops_without_charging(db, login, bucket, llm):
    user, tree, job = _job(db, login, bucket, species="si")
    llm.responses.append(json.dumps({"image_quality": {"usable": False, "issues": ["blurry", "base_hidden"]}}))
    run_phase_a(db, job.id)
    db.expire_all()
    job = db.get(DesignJob, job.id)
    assert job.status == JobStatus.failed and job.error_code == "unusable_photo"
    assert job.error == "blurry, base_hidden"
    assert db.get(User, user.id).credits == 1
    assert len(db.execute(select(CreditLedger)).scalars().all()) == 1  # chỉ dòng tặng


def test_ai_failure_records_cost_and_fails(db, login, bucket, llm):
    _, _, job = _job(db, login, bucket)
    llm.responses.extend(["not json"] * 3)
    run_phase_a_safe(db, job.id)
    job = db.get(DesignJob, job.id)
    assert job.status == JobStatus.failed and job.error_code == "ai_unavailable"
    p1 = db.execute(select(PipelineStep).where(PipelineStep.step_code == "P1")).scalar_one()
    assert not p1.ok and p1.tokens_in == 300 and float(p1.cost_usd) > 0


def test_provider_down(db, login, bucket, llm):
    _, _, job = _job(db, login, bucket)
    llm.responses.append(AIError("503"))
    run_phase_a_safe(db, job.id)
    assert db.get(DesignJob, job.id).error_code == "ai_unavailable"


def test_invalid_image(db, login, bucket, llm):
    _, tree, job = _job(db, login, bucket, n_photos=1)
    bucket[tree.photos[0].storage_key] = b"garbage"
    run_phase_a_safe(db, job.id)
    assert db.get(DesignJob, job.id).error_code == "invalid_image"


def test_phase_b_stub_refunds(db, login, bucket):
    user, _, job = _job(db, login, bucket)
    job.status = JobStatus.rendering_final
    spend_for_render(db, user.id, job.id)
    db.commit()
    run_phase_a_safe(db, job.id, fn=run_phase_b)
    job = db.get(DesignJob, job.id)
    assert job.status == JobStatus.failed and job.error_code == "phase_b_not_ready"
    assert db.get(User, user.id).credits == 1


def run_phase_a_safe(db, job_id, fn=run_phase_a):
    with pytest.raises(Exception):
        fn(db, job_id)
    db.expire_all()
