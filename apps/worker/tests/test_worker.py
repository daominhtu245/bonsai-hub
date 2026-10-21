import io
import uuid

import pytest
from PIL import Image
from sqlalchemy import select

from bonsai_api.db.models import CreditLedger, CreditReason, DesignJob, JobStatus, PipelineStep, Tree, TreePhoto, User
from bonsai_api.services.credits import spend_for_render
from bonsai_worker.recording import job_guard
from bonsai_worker.tasks import preprocess


@pytest.fixture
def bucket(monkeypatch):
    store: dict[str, bytes] = {}
    monkeypatch.setattr("bonsai_api.storage.get_bytes", lambda k: store[k])
    monkeypatch.setattr("bonsai_api.storage.put_bytes", lambda k, d, ct: store.__setitem__(k, d))
    monkeypatch.setattr("bonsai_api.storage.delete", lambda k: store.pop(k))
    return store


def _tree(db, login, raw_key=None):
    _, body = login()
    user = db.get(User, uuid.UUID(body["user"]["id"]))
    tree = Tree(user_id=user.id)
    tree.photos = [TreePhoto(storage_key=raw_key or f"uploads/{user.id}/a.jpg", view_index=0, is_front=True)]
    db.add(tree)
    db.commit()
    return user, tree


def _jpeg(w, h):
    buf = io.BytesIO()
    Image.new("RGB", (w, h), (90, 120, 60)).save(buf, format="JPEG")
    return buf.getvalue()


def test_normalize_photo_replaces_raw_with_clean_webp(db, login, bucket):
    user, tree = _tree(db, login)
    raw = tree.photos[0].storage_key
    bucket[raw] = _jpeg(3000, 4000)
    result = preprocess.normalize_tree_photos.run(str(tree.id))
    assert result["ok"]
    db.expire_all()
    photo = db.get(TreePhoto, tree.photos[0].id)
    assert photo.storage_key == f"trees/{tree.id}/photos/{photo.id}.webp"
    assert (photo.width, photo.height) == (1152, 1536)
    assert raw not in bucket  # ảnh thô có GPS không còn lưu
    assert Image.open(io.BytesIO(bucket[photo.storage_key])).format == "WEBP"
    step = db.execute(select(PipelineStep)).scalar_one()
    assert step.step_code == "A0" and step.ok
    # chạy lại không làm gì
    assert preprocess.normalize_tree_photos.run(str(tree.id))["ok"]


def test_normalize_photo_invalid_image(db, login, bucket):
    _, tree = _tree(db, login)
    bucket[tree.photos[0].storage_key] = b"garbage"
    assert not preprocess.normalize_tree_photos.run(str(tree.id))["ok"]
    assert not db.execute(select(PipelineStep)).scalar_one().ok


def test_job_guard_refunds_charged_credit(db, login):
    user, tree = _tree(db, login)
    job = DesignJob(tree_id=tree.id, status=JobStatus.rendering_final)
    db.add(job)
    db.commit()
    spend_for_render(db, user.id, job.id)
    db.commit()
    with pytest.raises(RuntimeError):
        with job_guard(db, job.id):
            raise RuntimeError("image model down")
    db.expire_all()
    assert db.get(DesignJob, job.id).status == JobStatus.failed
    assert db.get(User, user.id).credits == 1
    reasons = [r.reason for r in db.execute(select(CreditLedger).order_by(CreditLedger.id)).scalars()]
    assert reasons == [CreditReason.gift, CreditReason.render, CreditReason.refund]


def test_job_guard_phase_a_failure_does_not_add_credit(db, login):
    user, tree = _tree(db, login)
    job = DesignJob(tree_id=tree.id)
    db.add(job)
    db.commit()
    with pytest.raises(ValueError):
        with job_guard(db, job.id):
            raise ValueError("P1 bad")
    db.expire_all()
    assert db.get(User, user.id).credits == 1
