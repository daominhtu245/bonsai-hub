import io
import json
import uuid

import pytest
from PIL import Image
from sqlalchemy import select

from bonsai_api.db.models import (
    CreditLedger, DesignJob, DesignOption, JobStatus, PipelineStep, Tree, TreePhoto, User,
)
from bonsai_pipeline.adapters.base import AIError
from bonsai_pipeline.adapters.llm_client import LLMClient
from bonsai_pipeline.adapters.providers.fake import FakeLLM
from bonsai_worker.tasks.phase_a import run_phase_a

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
    monkeypatch.setattr("bonsai_worker.tasks.phase_a.get_llm_client", lambda **kw: LLMClient(fake))
    monkeypatch.setattr("bonsai_worker.tasks.phase_a.report_seg_status", lambda ready: None)
    return fake


def _jpeg(w=1000, h=1500, *, flat=False):
    """Ảnh thử có kết cấu (qua kiểm tra chất lượng); `flat=True`: một màu → bị loại là mờ / nhạt."""
    img = Image.new("RGB", (w, h), (200, 190, 170))
    if not flat:
        from PIL import ImageDraw

        d = ImageDraw.Draw(img)
        for x in range(0, w, 24):
            d.line([(x, 0), (x, h)], fill=(80, 70, 50), width=3)
        d.rectangle([w * 0.45, h * 0.3, w * 0.55, h * 0.9], fill=(107, 79, 58))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
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
    assert job.prompt_version == "P1.v2+P2.v1"
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
    assert [s for s, _ in steps] == ["A0", "A0", "A0q", "P1", "A2", "P2", "A5"] and all(ok for _, ok in steps)
    # P1 nhận ảnh mặt tiền trước
    assert llm.calls[0]["images"] == 2 and "1000x1500" in llm.calls[0]["messages"][0]["content"]

    run_phase_a(db, job.id)  # giao lại task: không chạy lại
    assert db.execute(select(PipelineStep).where(PipelineStep.job_id == job.id)).scalars().all().__len__() == 7


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


def run_phase_a_safe(db, job_id, fn=run_phase_a):
    with pytest.raises(Exception):
        fn(db, job_id)
    db.expire_all()


def test_cutout_feeds_p1_and_shifts_coordinates(db, login, bucket, llm, monkeypatch):
    import numpy as np

    class FakeRemover:
        name = "fake-cutout"

        def alpha(self, img):
            a = np.zeros((img.height, img.width), np.float32)
            a[300:1400, 350:650] = 1
            return a

    monkeypatch.setattr("bonsai_worker.tasks.phase_a.get_remover", lambda: FakeRemover())
    user, tree, job = _job(db, login, bucket)
    llm.responses.extend([json.dumps(analysis()), json.dumps(design())])
    run_phase_a(db, job.id)
    db.expire_all()
    job = db.get(DesignJob, job.id)
    assert job.status == JobStatus.awaiting_choice, job.error
    box = job.progress["cutout"]["box"]
    assert box[0] > 0 and box[1] > 0
    # P1: ảnh đã tách + 1 góc khác + bản phác họa + ảnh gốc cùng khung; prompt biết khung đã cắt và cờ tiền xử lý
    call = llm.calls[0]
    assert call["images"] == 4
    text = call["messages"][0]["content"]
    assert "cutout_sketch" in text and f"{box[2] - box[0]}x{box[3] - box[1]}" in text and "Images: 2 views" in text
    # tọa độ trả về theo khung cắt → cộng lại độ lệch về ảnh gốc
    assert job.analysis["trunk"]["base_point_px"] == [analysis()["trunk"]["base_point_px"][0] + box[0],
                                                      analysis()["trunk"]["base_point_px"][1] + box[1]]
    assert bucket[job.progress["cutout"]["sketch_key"]][:4] == b"\x89PNG"
    step = db.execute(select(PipelineStep).where(PipelineStep.job_id == job.id, PipelineStep.step_code == "A0c")).scalar_one()
    assert step.ok and step.model == "fake-cutout"


def test_cutout_off_by_admin(db, login, bucket, llm, monkeypatch):
    from bonsai_api.services.settings import set_setting

    called = []
    monkeypatch.setattr("bonsai_worker.tasks.phase_a.get_remover", lambda: called.append(1))
    set_setting(db, "cutout_mode", "off", by="t")
    user, tree, job = _job(db, login, bucket)
    llm.responses.extend([json.dumps(analysis()), json.dumps(design())])
    run_phase_a(db, job.id)
    assert not called and llm.calls[0]["images"] == 2 and "Pre-processing: none" in llm.calls[0]["messages"][0]["content"].replace("On-device pre-processing", "Pre-processing")


def test_phase_a_uses_rules_edited_by_artisan(db, login, bucket, llm):
    import copy

    from bonsai_api.db.models import RuleDoc
    from bonsai_pipeline.dictionaries import default_rule_doc

    rs = copy.deepcopy(default_rule_doc("rule_set"))
    rs["proportions"]["first_branch_height_ratio"] = [0.3, 0.38]
    db.query(RuleDoc).filter(RuleDoc.doc == "rule_set").update({"active": False})
    db.add(RuleDoc(doc="rule_set", version=2, content=rs, active=True, created_by="nghenhan@example.com"))
    db.commit()
    user, tree, job = _job(db, login, bucket)
    llm.responses.extend([json.dumps(analysis()), json.dumps(design())])
    run_phase_a(db, job.id)
    db.expire_all()
    job = db.get(DesignJob, job.id)
    assert job.progress["rules"]["rule_set"] == 2
    assert "0.38" in llm.calls[1]["messages"][0]["content"]  # P2 nhận bộ luật đã chỉnh
    from bonsai_pipeline.dictionaries import rule_set

    assert rule_set() == default_rule_doc("rule_set")  # hết phiên → về bản gốc
