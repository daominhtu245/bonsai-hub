"""A0 — chuẩn hóa ảnh tải lên: xoay EXIF, xóa EXIF/GPS, cạnh dài 1536 px, lưu WebP vào R2 private."""

from __future__ import annotations

import time
import uuid

from bonsai_api import storage
from bonsai_api.db.models import TreePhoto
from bonsai_api.db.session import get_sessionmaker
from bonsai_pipeline.preprocess import InvalidImageError, prepare_upload
from bonsai_pipeline.steps import StepRecord

from ..celery_app import app
from ..recording import record_step


def normalize_photo(db, photo: TreePhoto, *, job_id: uuid.UUID | None = None) -> bool:
    """Trả True nếu đã chuẩn hóa (hoặc đã chuẩn hóa từ trước). Ảnh thô bị xóa ngay sau khi lưu bản sạch."""
    raw_key = photo.storage_key
    if not raw_key.startswith("uploads/"):
        return True
    started = time.monotonic()
    try:
        prepared = prepare_upload(storage.get_bytes(raw_key))
    except InvalidImageError as e:
        record_step(db, job_id, StepRecord("A0", "code", "pillow", None, 0, 0, 0, 0.0,
                                           int((time.monotonic() - started) * 1000), ok=False, error=str(e)))
        return False
    clean_key = storage.tree_photo_key(photo.tree_id, photo.id)
    storage.put_bytes(clean_key, prepared.data, prepared.media_type)
    photo.storage_key, photo.width, photo.height = clean_key, prepared.width, prepared.height
    db.commit()
    storage.delete(raw_key)
    record_step(db, job_id, StepRecord("A0", "code", "pillow", None, 0, 0, 0, 0.0,
                                       int((time.monotonic() - started) * 1000), ok=True,
                                       output={"photo_id": str(photo.id), "w": prepared.width, "h": prepared.height}))
    return True


@app.task(name="bonsai_worker.tasks.preprocess.normalize_tree_photos", bind=True, max_retries=3)
def normalize_tree_photos(self, tree_id: str) -> dict:
    with get_sessionmaker()() as db:
        photos = db.query(TreePhoto).filter(TreePhoto.tree_id == uuid.UUID(tree_id)).all()
        results = {str(p.id): normalize_photo(db, p) for p in photos}
    return {"tree_id": tree_id, "ok": all(results.values()), "photos": results}


@app.task(name="bonsai_worker.tasks.preprocess.ping")
def ping() -> str:
    return "pong"
