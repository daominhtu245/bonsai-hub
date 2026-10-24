"""Tạo nội dung chia sẻ trên máy (docs/ideas.md B5, F3, F6): video tua nhanh, ảnh cây tách nền. Không tốn API.

Trạng thái ở job.progress["media"][loại] = {state: running|done|failed, key, …}; api đọc và ký URL.
"""

from __future__ import annotations

import logging
import uuid

from sqlalchemy.orm.attributes import flag_modified

from bonsai_api import storage
from bonsai_api.db.models import DesignJob, User
from bonsai_api.db.session import get_sessionmaker
from bonsai_api.services.stage_images import stage_keys

from ..celery_app import app

log = logging.getLogger(__name__)
CAPTION = {"S0": "Phôi hôm nay", "S1": "Cắt tạo khung", "S2": "Nuôi cành", "S3": "Định tầng tán"}


def _set(db, job: DesignJob, kind: str, **kw) -> None:
    media = dict((job.progress or {}).get("media") or {})
    media[kind] = {**(media.get(kind) or {}), **kw}
    job.progress = {**(job.progress or {}), "media": media}
    flag_modified(job, "progress")
    db.commit()


def _stage_images(db, job: DesignJob) -> list[tuple[str, bytes]]:
    return [(code, storage.get_bytes(key)) for code, key in stage_keys(db, job).items()]


def run_timelapse(db, job_id: uuid.UUID) -> None:
    from bonsai_pipeline.timelapse import render

    job = db.get(DesignJob, job_id)
    if job is None:
        return
    try:
        imgs = _stage_images(db, job)
        years = ((job.progress or {}).get("result") or {}).get("years")
        user = db.get(User, job.user_id)
        brand = (user.garden_name or "Bonsai AI") if user else "Bonsai AI"
        data, ctype = render([(b, CAPTION.get(c) or (f"Sau {years} năm" if years else "Dáng hoàn chỉnh")) for c, b in imgs], brand)
        key = f"trees/{job.tree_id}/jobs/{job.id}/timelapse.{'mp4' if ctype == 'video/mp4' else 'webp'}"
        storage.put_bytes(key, data, ctype)
        _set(db, job, "video", state="done", key=key, content_type=ctype)
    except Exception:  # noqa: BLE001
        log.exception("timelapse failed for %s", job_id)
        _set(db, job, "video", state="failed")


def run_final_cutout(db, job_id: uuid.UUID) -> None:
    from bonsai_pipeline.cutout import get_remover, object_png

    job = db.get(DesignJob, job_id)
    if job is None:
        return
    remover = get_remover()
    imgs = dict(_stage_images(db, job))
    if remover is None or "S4" not in imgs:
        _set(db, job, "cutout", state="failed", reason="no_model" if remover is None else "no_result")
        return
    res = object_png(imgs["S4"], remover)
    if res is None:
        _set(db, job, "cutout", state="failed", reason="cutout_failed")
        return
    png, box = res
    key = f"trees/{job.tree_id}/jobs/{job.id}/final_cutout.png"
    storage.put_bytes(key, png, "image/png")
    _set(db, job, "cutout", state="done", key=key, width=box[2] - box[0], height=box[3] - box[1])


@app.task(name="bonsai_worker.tasks.media.timelapse")
def timelapse(job_id: str) -> str:
    with get_sessionmaker()() as db:
        run_timelapse(db, uuid.UUID(job_id))
    return "ok"


@app.task(name="bonsai_worker.tasks.media.final_cutout")
def final_cutout(job_id: str) -> str:
    with get_sessionmaker()() as db:
        run_final_cutout(db, uuid.UUID(job_id))
    return "ok"
