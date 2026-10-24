"""Phiên A ít/không dùng API: kiểm tra ảnh trên máy, model riêng (YOLO-seg) và bộ thiết kế bằng luật."""

import json

import numpy as np
from sqlalchemy import select

from bonsai_api.db.models import DesignJob, DesignOption, JobStatus, PipelineStep
from bonsai_api.services.settings import set_setting
from bonsai_pipeline.segmentation import Parts
from bonsai_worker.tasks.phase_a import run_phase_a

from pipeline_samples import analysis
from test_phase_a import _jpeg, _job, bucket, llm  # noqa: F401


def _steps(db, job_id):
    return {s.step_code: s for s in db.execute(select(PipelineStep).where(PipelineStep.job_id == job_id)).scalars()}


class FakeSegmenter:
    """Thân dọc giữa ảnh, thuôn lên; 3 cành so le; rễ xòe ở gốc."""

    def __init__(self, conf=0.9, with_branches=True):
        self.conf, self.with_branches = conf, with_branches

    def segment_parts(self, image):
        w, h = image.size
        trunk = np.zeros((h, w), bool)
        base_y, top_y, cx = int(h * 0.85), int(h * 0.2), w // 2
        for y in range(top_y, base_y):
            half = int(w * (0.02 + 0.05 * (y - top_y) / (base_y - top_y)))
            trunk[y, cx - half:cx + half] = True
        branches = []
        for frac, side in ((0.35, -1), (0.5, 1), (0.65, -1)):
            m = np.zeros((h, w), bool)
            y = int(base_y - frac * (base_y - top_y))
            x0, x1 = sorted((cx, cx + side * int(w * 0.25)))
            m[y - 6:y + 6, x0:x1] = True
            branches.append(m)
        roots = np.zeros((h, w), bool)
        roots[base_y - 10:base_y + 20, cx - int(w * 0.18):cx + int(w * 0.18)] = True
        return Parts(trunk, branches if self.with_branches else [], roots, trunk_conf=self.conf,
                     has_branch_class=self.with_branches)


def test_bad_photo_rejected_without_api(db, login, bucket, llm, monkeypatch):  # noqa: F811
    _, tree, job = _job(db, login, bucket)
    for p in tree.photos:
        bucket[p.storage_key] = _jpeg(flat=True)
    run_phase_a(db, job.id)
    db.expire_all()
    job = db.get(DesignJob, job.id)
    assert job.status == JobStatus.failed and job.error_code == "unusable_photo"
    assert set(job.analysis["image_quality"]["issues"]) >= {"blurry"}
    assert llm.calls == [] and "P1" not in _steps(db, job.id)


def test_rule_designer_replaces_p2(db, login, bucket, llm):  # noqa: F811
    _, _, job = _job(db, login, bucket)
    set_setting(db, "design_mode", "rules", by="test")
    llm.responses.append(json.dumps(analysis()))  # chỉ P1
    run_phase_a(db, job.id)
    db.expire_all()
    job = db.get(DesignJob, job.id)
    assert job.status == JobStatus.awaiting_choice, job.error
    assert job.prompt_version == "P1.v2+P2.rules" and len(llm.calls) == 1
    steps = _steps(db, job.id)
    assert steps["P2"].provider == "code" and steps["P2"].cost_usd == 0
    opts = db.execute(select(DesignOption).where(DesignOption.job_id == job.id)).scalars().all()
    assert 2 <= len(opts) <= 3 and all(o.sketch_svg_key for o in opts)


def test_local_model_replaces_p1(db, login, bucket, llm, monkeypatch):  # noqa: F811
    _, _, job = _job(db, login, bucket, species="si")
    set_setting(db, "design_mode", "rules", by="test")
    monkeypatch.setattr("bonsai_worker.tasks.phase_a.get_segmenter", lambda: FakeSegmenter())
    run_phase_a(db, job.id)
    db.expire_all()
    job = db.get(DesignJob, job.id)
    assert job.status == JobStatus.awaiting_choice, job.error
    assert llm.calls == [] and job.prompt_version == "A1.local+P2.rules"  # phiên A không tốn API
    a = job.analysis
    assert a["species"] == {"guess": "si", "confidence": 1.0}
    assert len(a["branches"]) == 3 and a["trunk"]["taper"] == "good" and a["trunk"]["movement"] == "straight"
    assert job.targets["mask_key"] and job.targets["cv"]["source"] == "yolo"
    assert _steps(db, job.id)["A1"].output["confident"] is True


def test_unsure_local_model_falls_back_to_p1(db, login, bucket, llm, monkeypatch):  # noqa: F811
    _, _, job = _job(db, login, bucket)
    monkeypatch.setattr("bonsai_worker.tasks.phase_a.get_segmenter", lambda: FakeSegmenter(with_branches=False))
    from pipeline_samples import design

    llm.responses.extend([json.dumps(analysis()), json.dumps(design())])
    run_phase_a(db, job.id)
    db.expire_all()
    job = db.get(DesignJob, job.id)
    assert job.status == JobStatus.awaiting_choice, job.error
    assert job.prompt_version == "P1.v2+P2.v1"
    a1 = _steps(db, job.id)["A1"]
    assert a1.ok is False and "model_has_no_branch_class" in a1.output["reasons"]
