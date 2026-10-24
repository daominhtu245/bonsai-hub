import io

from PIL import Image

from bonsai_api.db.models import DesignJob, JobStatus, RenderImage
from bonsai_worker.tasks import media

from test_worker import _tree, bucket  # noqa: F401 (fixture)


def _webp(color):
    buf = io.BytesIO()
    Image.new("RGB", (300, 400), color).save(buf, "WEBP")
    return buf.getvalue()


def _job(db, login, bucket):  # noqa: F811
    user, tree = _tree(db, login, raw_key="trees/t/p.webp")
    bucket["trees/t/p.webp"] = _webp((200, 190, 170))
    job = DesignJob(user_id=user.id, tree_id=tree.id, status=JobStatus.done, front_photo_id=tree.photos[0].id,
                    progress={"result": {"years": 5}})
    db.add(job)
    db.flush()
    for code, color in (("S1", (90, 80, 60)), ("S4", (60, 90, 60))):
        bucket[f"trees/t/{code}.webp"] = _webp(color)
        db.add(RenderImage(job_id=job.id, stage_code=code, attempt=0, storage_key=f"trees/t/{code}.webp", model="m", selected=True))
    db.add(RenderImage(job_id=job.id, stage_code="S4", attempt=1, storage_key="trees/t/bad.webp", model="m", selected=False))
    db.commit()
    return job


def test_timelapse_stores_video(db, login, bucket, monkeypatch):  # noqa: F811
    job = _job(db, login, bucket)
    seen = {}

    def fake_render(stages, brand):
        seen["captions"], seen["brand"] = [c for _, c in stages], brand
        return b"mp4", "video/mp4"

    monkeypatch.setattr("bonsai_pipeline.timelapse.render", fake_render)
    media.run_timelapse(db, job.id)
    db.refresh(job)
    v = job.progress["media"]["video"]
    assert v["state"] == "done" and bucket[v["key"]] == b"mp4" and v["key"].endswith("timelapse.mp4")
    assert seen["captions"] == ["Phôi hôm nay", "Cắt tạo khung", "Sau 5 năm"] and seen["brand"] == "Bonsai AI"
    assert job.progress["result"] == {"years": 5}  # không đè dữ liệu khác


def test_timelapse_failure_is_recorded(db, login, bucket, monkeypatch):  # noqa: F811
    job = _job(db, login, bucket)
    monkeypatch.setattr("bonsai_pipeline.timelapse.render", lambda *a: (_ for _ in ()).throw(RuntimeError("x")))
    media.run_timelapse(db, job.id)
    db.refresh(job)
    assert job.progress["media"]["video"]["state"] == "failed"


def test_final_cutout(db, login, bucket, monkeypatch):  # noqa: F811
    job = _job(db, login, bucket)
    monkeypatch.setattr("bonsai_pipeline.cutout.get_remover", lambda: None)
    media.run_final_cutout(db, job.id)
    db.refresh(job)
    assert job.progress["media"]["cutout"] == {"state": "failed", "reason": "no_model"}

    monkeypatch.setattr("bonsai_pipeline.cutout.get_remover", lambda: object())
    monkeypatch.setattr("bonsai_pipeline.cutout.object_png", lambda data, remover: (b"png", (10, 20, 110, 220)))
    media.run_final_cutout(db, job.id)
    db.refresh(job)
    c = job.progress["media"]["cutout"]
    assert c["state"] == "done" and c["width"] == 100 and c["height"] == 200 and bucket[c["key"]] == b"png"
