"""Xem thử nhanh bản tự thiết kế (worker)."""

import json

from sqlalchemy import select

from bonsai_api.db.models import DesignJob, DesignOption, JobStatus, PipelineStep, RenderImage, Style
from bonsai_api.scripts.seed import seed_dictionaries, seed_prompts, default_prompts_dir
from bonsai_pipeline.adapters.base import AIError
from bonsai_pipeline.adapters.image_client import ImageClient
from bonsai_pipeline.adapters.providers.fake import FakeImage
from bonsai_pipeline.rule_engine import compute_targets
from bonsai_pipeline.schemas import Analysis
from bonsai_pipeline.user_design import UserDesignIn, build_user_option
from bonsai_worker.tasks import studio

from pipeline_samples import analysis
from test_phase_a import _job, bucket, llm  # noqa: F401
from bonsai_worker.tasks.phase_a import run_phase_a
from pipeline_samples import design


def _prepare(db, login, bucket, llm):  # noqa: F811
    user, tree, job = _job(db, login, bucket, species="si")
    llm.responses.extend([json.dumps(analysis()), json.dumps(design())])
    run_phase_a(db, job.id)  # ảnh mặt tiền đã chuẩn hóa, có bản vẽ
    db.expire_all()
    job = db.get(DesignJob, job.id)
    a = Analysis.model_validate(job.analysis)
    opt = build_user_option(a, compute_targets(a, image_size=(1000, 1500)), UserDesignIn(style_key="moyogi", pads=[
        {"center_px": [500, 800], "rx": 150, "ry": 50, "kind": "ficus_wide"}]))
    first = db.execute(select(DesignOption).where(DesignOption.job_id == job.id, DesignOption.rank == 1)).scalar_one()
    db.add(DesignOption(job_id=job.id, rank=9, style_key="moyogi", suitability=0, design=opt.model_dump(mode="json"),
                        sketch_svg_key=first.sketch_svg_key, sketch_png_key=first.sketch_png_key))
    job.progress = {**job.progress, "preview": {"state": "running", "count": 1}}
    db.commit()
    return job


def test_preview_renders_low_quality_and_records(db, login, bucket, llm, monkeypatch):  # noqa: F811
    seed_dictionaries(db)
    seed_prompts(db, default_prompts_dir())
    db.commit()
    job = _prepare(db, login, bucket, llm)
    fake = FakeImage(model="gpt-image-2")
    monkeypatch.setattr(studio, "get_image_client", lambda: ImageClient(fake, max_retries=0, sleep=lambda _: None))
    assert studio.preview.run(str(job.id)) == "done"
    assert fake.qualities == ["low"]
    db.expire_all()
    job = db.get(DesignJob, job.id)
    pv = job.progress["preview"]
    assert pv["state"] == "done" and pv["key"] in bucket and job.status == JobStatus.awaiting_choice
    img = db.execute(select(RenderImage).where(RenderImage.job_id == job.id, RenderImage.stage_code == "PV")).scalar_one()
    assert img.selected is False
    assert db.execute(select(PipelineStep).where(PipelineStep.job_id == job.id, PipelineStep.step_code == "PV")).scalar_one().ok
    assert db.get(Style, "moyogi") is not None


def test_failed_preview_does_not_use_up_a_try(db, login, bucket, llm, monkeypatch):  # noqa: F811
    seed_dictionaries(db)
    seed_prompts(db, default_prompts_dir())
    db.commit()
    job = _prepare(db, login, bucket, llm)

    class Broken(FakeImage):
        def edit(self, **kw):
            raise AIError("down", retryable=False)

    monkeypatch.setattr(studio, "get_image_client", lambda: ImageClient(Broken(), max_retries=0, sleep=lambda _: None))
    assert studio.preview.run(str(job.id)) == "failed"
    db.expire_all()
    assert db.get(DesignJob, job.id).progress["preview"] == {"state": "failed", "count": 0}
