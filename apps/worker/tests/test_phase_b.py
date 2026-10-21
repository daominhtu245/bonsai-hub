import io
import json
import uuid

import pytest
from PIL import Image
from sqlalchemy import select

from bonsai_api.db.models import (
    CreditLedger, DesignJob, DesignOption, JobStatus, PipelineStep, RenderImage, Stage, User,
)
from bonsai_api.services.credits import spend_for_render
from bonsai_pipeline.adapters.base import AIError
from bonsai_pipeline.adapters.image_client import ImageClient
from bonsai_pipeline.adapters.providers.fake import DemoImage, FakeImage
from bonsai_worker.tasks.phase_a import run_phase_a
from bonsai_worker.tasks.phase_b import run_phase_b

from pipeline_samples import analysis, design
from test_phase_a import _job, bucket, llm  # noqa: F401 (fixture)

SCORES = ["trunk_fidelity", "proportions", "silhouette", "branch_structure", "negative_space", "species_realism",
          "timeline_plausibility", "photo_realism"]


def verdict(score, **kw):
    return json.dumps(dict.fromkeys(SCORES, score) | {"hard_fail": [], "fix_instructions": "smaller pads",
                                                      "summary_en": f"score {score}"} | kw)


@pytest.fixture
def images(monkeypatch):
    holder = {"provider": DemoImage()}
    monkeypatch.setattr("bonsai_worker.tasks.phase_b.get_image_client",
                        lambda: ImageClient(holder["provider"], max_retries=0, sleep=lambda _: None))
    return holder


@pytest.fixture
def chosen_job(db, login, bucket, llm, monkeypatch):  # noqa: F811
    monkeypatch.setattr("bonsai_worker.tasks.phase_b.get_llm_client", lambda: __import__(
        "bonsai_pipeline.adapters.llm_client", fromlist=["LLMClient"]).LLMClient(llm))
    user, tree, job = _job(db, login, bucket, species="si")
    llm.responses.extend([json.dumps(analysis()), json.dumps(design())])
    run_phase_a(db, job.id)
    db.expire_all()
    job = db.get(DesignJob, job.id)
    opt = db.execute(select(DesignOption).where(DesignOption.job_id == job.id, DesignOption.rank == 1)).scalar_one()
    spend_for_render(db, user.id, job.id)
    job.chosen_option_id, job.status = opt.id, JobStatus.rendering_final
    db.commit()
    llm.calls.clear()
    return user, job


def _steps(db, job_id):
    return [s for (s,) in db.execute(select(PipelineStep.step_code).where(PipelineStep.job_id == job_id)
                                     .order_by(PipelineStep.id)).all()]


def _renders(db, job_id):
    return db.execute(select(RenderImage).where(RenderImage.job_id == job_id).order_by(RenderImage.attempt)).scalars().all()


def test_passes_first_round(db, chosen_job, images, llm, bucket):
    user, job = chosen_job
    llm.responses.extend([verdict(7), verdict(9), verdict(8)])
    run_phase_b(db, job.id)
    db.expire_all()
    job = db.get(DesignJob, job.id)
    assert job.status == JobStatus.done, job.error
    assert job.progress["result"] == {"low_confidence": False, "years": 4, "repair_rounds": 0, "candidates": 3}
    rows = _renders(db, job.id)
    assert len(rows) == 3 and sum(r.selected for r in rows) == 1
    assert all(r.cv_checks["fails"] == [] and r.judge for r in rows)
    best = max(rows, key=lambda r: r.total_score)
    assert best.selected and best.storage_key == f"trees/{job.tree_id}/jobs/{job.id}/S4_{best.attempt}.webp"
    assert Image.open(io.BytesIO(bucket[best.storage_key])).size == (1000, 1500)
    stages = {s.code: s for s in db.execute(select(Stage).where(Stage.job_id == job.id)).scalars()}
    assert stages["S4"].image_id == best.id and stages["S4"].time_from_start == "4 năm"
    assert _steps(db, job.id)[-7:] == ["P3a", "P3a", "P3a", "P4cv", "P4", "P4", "P4"]
    # P3a nhận ảnh gốc + sketch; P4 nhận ảnh gốc + ứng viên
    assert all(c["images"] == 2 for c in llm.calls)
    assert db.get(User, user.id).credits == 0  # lượt đã dùng, không hoàn


def test_repairs_until_pass(db, chosen_job, images, llm):
    _, job = chosen_job
    llm.responses.extend([verdict(5), verdict(6), verdict(5, hard_fail=["trunk_changed"]), verdict(8)])
    run_phase_b(db, job.id)
    db.expire_all()
    job = db.get(DesignJob, job.id)
    assert job.status == JobStatus.done
    assert job.progress["result"]["repair_rounds"] == 1 and not job.progress["result"]["low_confidence"]
    rows = _renders(db, job.id)
    assert [r.attempt for r in rows] == [0, 1, 2, 3] and rows[3].selected
    assert _steps(db, job.id).count("P3c") == 1


def test_low_confidence_after_two_rounds(db, chosen_job, images, llm):
    _, job = chosen_job
    llm.responses.extend([verdict(5), verdict(6), verdict(4), verdict(5), verdict(5)])
    run_phase_b(db, job.id)
    db.expire_all()
    job = db.get(DesignJob, job.id)
    assert job.status == JobStatus.done
    assert job.progress["result"]["low_confidence"] is True and job.progress["result"]["repair_rounds"] == 2
    assert len(_renders(db, job.id)) == 5
    selected = [r for r in _renders(db, job.id) if r.selected]
    assert selected[0].total_score == 6.0


def test_cv_rejects_skip_vlm(db, chosen_job, images, llm):
    _, job = chosen_job
    images["provider"] = FakeImage()  # ảnh xanh đặc: nền bị đổi hoàn toàn
    run_phase_b(db, job.id)
    db.expire_all()
    job = db.get(DesignJob, job.id)
    assert job.status == JobStatus.done and job.progress["result"]["low_confidence"] is True
    assert llm.calls == []  # không gọi VLM cho ảnh bị CV loại
    rows = _renders(db, job.id)
    assert len(rows) == 5 and all("background_changed" in r.cv_checks["fails"] for r in rows)


def test_image_model_down_refunds(db, chosen_job, images, llm):
    user, job = chosen_job

    class Down(FakeImage):
        def edit(self, **kw):
            raise AIError("503", retryable=False)

    images["provider"] = Down()
    with pytest.raises(Exception):
        run_phase_b(db, job.id)
    db.expire_all()
    job = db.get(DesignJob, job.id)
    assert job.status == JobStatus.failed and job.error_code == "image_unavailable"
    assert db.get(User, user.id).credits == 1
    reasons = [r.reason.value for r in db.execute(select(CreditLedger).order_by(CreditLedger.id)).scalars()]
    assert reasons == ["gift", "render", "refund"]


def test_skips_when_not_active(db, chosen_job, images, llm):
    _, job = chosen_job
    job.status = JobStatus.done
    db.commit()
    run_phase_b(db, job.id)
    assert _renders(db, job.id) == []
