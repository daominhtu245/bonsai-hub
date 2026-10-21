import io

import pytest
from PIL import Image
from sqlalchemy import select

from bonsai_api.db.models import DesignJob, JobStatus, PipelineStep, RenderImage, Stage
from bonsai_pipeline.adapters.base import AIError
from bonsai_pipeline.adapters.providers.fake import DemoImage
from bonsai_worker.tasks.phase_b import run_phase_b

from test_phase_a import bucket, llm  # noqa: F401
from test_phase_b import chosen_job, images, routed, verdict  # noqa: F401


def _stages(db, job_id):
    return {s.code: s for s in db.execute(select(Stage).where(Stage.job_id == job_id)).scalars()}


def test_full_roadmap(db, chosen_job, images, llm, bucket):  # noqa: F811
    _, job = chosen_job
    llm.responses.extend([verdict(8)] * 3)
    run_phase_b(db, job.id)
    db.expire_all()
    job = db.get(DesignJob, job.id)
    assert job.status == JobStatus.done, job.error
    st = _stages(db, job.id)
    assert sorted(st) == ["S0", "S1", "S2", "S3", "S4"]
    for code in ("S1", "S2", "S3"):
        assert st[code].image_id is not None and st[code].plan["fallback"] is None
        assert st[code].guide_vi["id"] == code and st[code].plan["id"] == code
    assert st["S0"].guide_vi["title_vi"].startswith("Giai đoạn 0") and st["S0"].image_id is None
    assert st["S4"].plan["years"] == 4 and st["S4"].plan["trunk_thicken_pct_vs_original"] == 50
    assert st["S2"].time_from_start == "6–12 tháng"
    assert job.report["style_reason_vi"] and job.report["guide_disclaimer_vi"].startswith("Ảnh là minh hoạ")

    s2 = db.get(RenderImage, st["S2"].image_id)
    assert s2.stage_code == "S2" and s2.selected and "cut_region_change" in s2.cv_checks
    assert Image.open(io.BytesIO(bucket[s2.storage_key])).size == (1000, 1500)
    steps = [s for (s,) in db.execute(select(PipelineStep.step_code).where(PipelineStep.job_id == job.id).order_by(PipelineStep.id))]
    assert {"P2b", "P3d", "P6", "P5"} <= set(steps) and steps.index("P2b") < steps.index("P3d") < steps.index("P6")
    assert steps.count("P3d") == 3
    assert {k for k, v in job.progress["steps"].items() if v["state"] == "done"} >= {"plan", "S1", "S2", "S3", "guide"}


def test_stage_falls_back_to_sketch(db, chosen_job, images, llm, monkeypatch):  # noqa: F811
    _, job = chosen_job
    llm.responses.extend([verdict(8)] * 3)

    class S2Breaks(DemoImage):
        """Ảnh S2 đổi hẳn nền → vi phạm kiểm tra, sinh lại 2 lần vẫn hỏng → dùng bản vẽ."""

        def edit(self, *, prompt, images, n=1):
            r = super().edit(prompt=prompt, images=images, n=n)
            if 'stage "recovery and branch growth"' in prompt:
                buf = io.BytesIO()
                Image.new("RGB", Image.open(io.BytesIO(r.images[0])).size, (10, 80, 10)).save(buf, format="PNG")
                r.images = [buf.getvalue()]
            return r

    images["provider"] = S2Breaks()
    run_phase_b(db, job.id)
    db.expire_all()
    st = _stages(db, job.id)
    assert db.get(DesignJob, job.id).status == JobStatus.done
    assert st["S2"].image_id is None and st["S2"].plan["fallback"] == "sketch"
    assert st["S3"].image_id is not None  # S3 dựng tiếp từ S1
    rows = db.execute(select(RenderImage).where(RenderImage.job_id == job.id, RenderImage.stage_code == "S2")).scalars().all()
    assert len(rows) == 3 and not any(r.selected for r in rows)  # vẫn lưu ảnh bị loại


def test_guide_failure_refunds(db, chosen_job, images, llm, routed, monkeypatch):  # noqa: F811
    user, job = chosen_job
    llm.responses.extend([verdict(8)] * 3)
    original = routed.demo.complete

    def broken(**kw):
        if "Viết hướng dẫn lộ trình" in kw["messages"][0]["content"]:
            raise AIError("down")
        return original(**kw)

    monkeypatch.setattr(routed.demo, "complete", broken)
    with pytest.raises(Exception):
        run_phase_b(db, job.id)
    db.expire_all()
    job = db.get(DesignJob, job.id)
    assert job.status == JobStatus.failed and job.error_code == "ai_unavailable"
    from bonsai_api.db.models import User

    assert db.get(User, user.id).credits == 1
