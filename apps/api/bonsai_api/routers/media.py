"""Nội dung từ kết quả (docs/ideas.md A1, A2, B5, F3, F6): tranh phác họa / thủy mặc (tạo ngay, lưu lại), video tua nhanh
và ảnh cây tách nền (worker tạo). Không tốn lượt, không gọi API AI."""

from __future__ import annotations

import uuid
from typing import Literal

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm.attributes import flag_modified

from bonsai_pipeline.art_styles import stylize

from .. import queue, storage
from ..db.models import DesignJob, JobStatus
from ..security import DB, CurrentUser
from ..services.stage_images import stage_keys

router = APIRouter(tags=["media"])
Style = Literal["pencil", "ink"]


def _done(db, job_id: uuid.UUID, user) -> DesignJob:
    job = db.get(DesignJob, job_id)
    if job is None or job.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy phiên thiết kế.")
    if job.status != JobStatus.done:
        raise HTTPException(status.HTTP_409_CONFLICT, "Kết quả chưa sẵn sàng.")
    return job



@router.get("/jobs/{job_id}/art")
def art(job_id: uuid.UUID, style: Style, db: DB, user: CurrentUser) -> dict[str, str]:
    """{giai đoạn: URL} ảnh đã chuyển kiểu tranh; chưa có thì tạo (≈ 0,1–2 s / ảnh) và lưu lại."""
    job = _done(db, job_id, user)
    out = {}
    for code, key in stage_keys(db, job).items():
        art_key = f"trees/{job.tree_id}/jobs/{job.id}/art/{code}_{style}.webp"
        if storage.head(art_key) is None:
            storage.put_bytes(art_key, stylize(storage.get_bytes(key), style), "image/webp")
        out[code] = storage.presign_get(art_key)
    return out


class MediaOut(BaseModel):
    state: Literal["none", "running", "done", "failed"]
    url: str | None = None
    content_type: str | None = None
    width: int | None = None
    height: int | None = None


def _media(job: DesignJob, kind: str) -> MediaOut:
    m = ((job.progress or {}).get("media") or {}).get(kind) or {}
    if m.get("state") == "done" and m.get("key"):
        return MediaOut(state="done", url=storage.presign_get(m["key"]), content_type=m.get("content_type"),
                        width=m.get("width"), height=m.get("height"))
    return MediaOut(state=m.get("state", "none"))


def _start(db, job: DesignJob, kind: str, task: str) -> MediaOut:
    cur = _media(job, kind)
    if cur.state in ("running", "done"):
        return cur
    media = dict((job.progress or {}).get("media") or {})
    media[kind] = {"state": "running"}
    job.progress = {**(job.progress or {}), "media": media}
    flag_modified(job, "progress")
    db.commit()
    if not queue.enqueue(task, str(job.id), queue="render"):
        media[kind] = {"state": "failed"}
        job.progress = {**job.progress, "media": media}
        flag_modified(job, "progress")
        db.commit()
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Hệ thống đang bận, bạn thử lại sau.")
    return MediaOut(state="running")


@router.get("/jobs/{job_id}/video", response_model=MediaOut)
def video(job_id: uuid.UUID, db: DB, user: CurrentUser):
    return _media(_done(db, job_id, user), "video")


@router.post("/jobs/{job_id}/video", response_model=MediaOut, status_code=status.HTTP_202_ACCEPTED)
def make_video(job_id: uuid.UUID, db: DB, user: CurrentUser):
    return _start(db, _done(db, job_id, user), "video", "bonsai_worker.tasks.media.timelapse")


@router.get("/jobs/{job_id}/cutout", response_model=MediaOut)
def final_cutout(job_id: uuid.UUID, db: DB, user: CurrentUser):
    return _media(_done(db, job_id, user), "cutout")


@router.post("/jobs/{job_id}/cutout", response_model=MediaOut, status_code=status.HTTP_202_ACCEPTED)
def make_cutout(job_id: uuid.UUID, db: DB, user: CurrentUser):
    return _start(db, _done(db, job_id, user), "cutout", "bonsai_worker.tasks.media.final_cutout")
