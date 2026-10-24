"""Gán nhãn trong app: mask nháp (hình học khi không có SAM) cho ảnh tải lên và ảnh từ phiên A."""

import io
import json
import uuid

import numpy as np
from PIL import Image

from bonsai_api.db.models import PipelineStep, SegLabel, SegLabelStatus
from bonsai_worker.tasks.labeling import draft_label

from pipeline_samples import analysis
from test_phase_a import _jpeg, bucket, llm  # noqa: F401


def _label(db, bucket, **kw):  # noqa: F811
    key = f"uploads/{uuid.uuid4()}/raw.jpg"
    bucket[key] = _jpeg()
    row = SegLabel(source="upload", image_key=key, objects=[], **kw)
    db.add(row)
    db.commit()
    return row


def test_upload_is_normalized_analyzed_cheaply_and_drafted(db, bucket, llm, monkeypatch):  # noqa: F811
    economy = []
    from bonsai_pipeline.adapters.llm_client import LLMClient

    monkeypatch.setattr("bonsai_worker.tasks.labeling.get_llm_client",
                        lambda **kw: economy.append(kw) or LLMClient(llm))
    llm.responses.append(json.dumps(analysis()))
    label = _label(db, bucket)
    raw_key = label.image_key
    draft_label(db, label.id)
    db.refresh(label)
    assert label.status == SegLabelStatus.draft, label.error
    assert economy == [{"economy": True, "effort": "low"}]  # P1 bằng model chữ rẻ
    assert raw_key not in bucket and label.image_key == f"labels/{label.id}/image.webp"  # ảnh thô (EXIF) đã xóa
    assert (label.width, label.height) == (1000, 1500)  # chỉ thu nhỏ, không phóng to
    ids = [o["id"] for o in label.objects]
    assert ids[0] == "trunk" and "root" in ids and sum(i.startswith("branch_") for i in ids) == 5
    assert label.draft_source == "geometry" and all(o["accepted"] for o in label.objects)
    trunk = np.asarray(Image.open(io.BytesIO(bucket[label.objects[0]["key"]])).convert("L")) > 127
    assert trunk.shape == (1500, 1000) and trunk.any()
    step = db.query(PipelineStep).filter(PipelineStep.step_code == "L1").one()
    assert step.job_id is None and step.input_ref == {"seg_label_id": str(label.id)}


def test_existing_analysis_skips_llm(db, bucket, llm):  # noqa: F811
    label = _label(db, bucket, analysis=analysis())
    draft_label(db, label.id)
    db.refresh(label)
    assert label.status == SegLabelStatus.draft and llm.calls == []


def test_unusable_photo_rejected(db, bucket, llm):  # noqa: F811
    label = _label(db, bucket, analysis=analysis(image_quality={"usable": False, "issues": ["not_a_tree"]}, trunk=None,
                                                 species=None, nebari=None, branches=[]))
    draft_label(db, label.id)
    db.refresh(label)
    assert label.status == SegLabelStatus.rejected and label.error == "not_a_tree"
