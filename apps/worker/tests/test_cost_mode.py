"""Chế độ chi phí A (standard) và B (economy): ít lời gọi AI, chất lượng ảnh theo hồ sơ."""

import pytest
from sqlalchemy import select

from bonsai_api.db.models import DesignJob, JobStatus, PipelineStep, Stage
from bonsai_api.services.settings import set_cost_mode
from bonsai_pipeline.adapters.image_client import ImageClient
from bonsai_pipeline.adapters.providers.fake import DemoImage
from bonsai_worker.tasks.phase_b import run_phase_b

from test_phase_a import bucket, llm  # noqa: F401
from test_phase_b import chosen_job, routed, verdict  # noqa: F401


class RecordingImage(DemoImage):
    def __init__(self):
        super().__init__()
        self.qualities: list[str | None] = []

    def edit(self, *, prompt, images, n=1, quality=None, mask=None):
        self.qualities.append(quality)
        return super().edit(prompt=prompt, images=images, n=n, quality=quality)


@pytest.fixture
def provider(monkeypatch):
    p = RecordingImage()
    monkeypatch.setattr("bonsai_worker.tasks.phase_b.get_image_client",
                        lambda: ImageClient(p, max_retries=0, sleep=lambda _: None))
    return p


def _steps(db, job_id):
    return db.execute(select(PipelineStep).where(PipelineStep.job_id == job_id).order_by(PipelineStep.id)).scalars().all()


@pytest.mark.parametrize("mode,s4_quality", [("standard", "medium"), ("economy", "low")])
def test_cheap_modes_skip_llm_after_design(db, chosen_job, provider, routed, llm, mode, s4_quality, monkeypatch):  # noqa: F811
    _, job = chosen_job
    set_cost_mode(db, mode, by="test")
    llm.responses.extend([verdict(8)] * 2)  # điểm P4 (chỉ chế độ Tiêu chuẩn dùng)
    economy_flags = []
    from bonsai_pipeline.adapters.llm_client import LLMClient

    monkeypatch.setattr("bonsai_worker.tasks.phase_b.get_llm_client",
                        lambda **kw: economy_flags.append(kw.get("economy")) or LLMClient(routed))
    run_phase_b(db, job.id)
    db.expire_all()
    job = db.get(DesignJob, job.id)
    assert job.status == JobStatus.done, job.error
    assert job.progress["result"]["cost_mode"] == mode and job.progress["result"]["candidates"] == 1
    assert economy_flags == [mode == "economy"]

    # Tiêu chuẩn: chỉ P4 chấm ảnh kết quả (bật lại sau phản hồi beta); Tiết kiệm: không LLM nào ở phiên B
    assert routed.steps == (["P4"] if mode == "standard" else [])
    steps = _steps(db, job.id)
    codes = [s.step_code for s in steps]
    assert codes.count("P3a") == 1 and codes.count("P3d") == 3 and codes.count("P4") == (mode == "standard") and "P5" not in codes
    assert {s.step_code: s.provider for s in steps if s.step_code in ("P2b", "P6")} == {"P2b": "code", "P6": "code"}
    assert provider.qualities == [s4_quality, "low", "low", "low"]

    st = {s.code: s for s in db.execute(select(Stage).where(Stage.job_id == job.id)).scalars()}
    assert sorted(st) == ["S0", "S1", "S2", "S3", "S4"]
    assert st["S1"].guide_vi["title_vi"] == "Tạo khung" and st["S2"].time_from_start == "Khoảng 1 năm"
    assert job.report["style_reason_vi"] and job.report["species_care_vi"]
