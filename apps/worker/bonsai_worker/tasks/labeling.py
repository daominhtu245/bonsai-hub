"""Gán nhãn trong app (/admin → Gán nhãn): tạo mask nháp thân / cành / rễ cho một ảnh của bộ dữ liệu YOLO-seg.

Ảnh tải lên chưa có phân tích → thử trước nháp miễn phí trên máy (tách nền + màu: thân / cành / rễ thô); không ra thân thì
P1 bằng model chữ rẻ (chế độ tiết kiệm, ~$0,002/ảnh) để lấy tọa độ gợi ý, rồi SAM (nếu worker có) hoặc mask hình học. Người duyệt sửa bằng cọ/tẩy rồi bấm "Duyệt xong".
"""

from __future__ import annotations

import logging
import uuid

from sqlalchemy.orm import Session

from bonsai_api import storage
from bonsai_api.db.models import SegLabel, SegLabelStatus
from bonsai_api.db.session import get_sessionmaker
from bonsai_pipeline.adapters import AIError, ImageInput, get_llm_client
from bonsai_pipeline.labeling import local_drafts, make_drafts, mask_png
from bonsai_pipeline.phase_a import run_p1
from bonsai_pipeline.preprocess import InvalidImageError, prepare_upload
from bonsai_pipeline.schemas import Analysis

from ..celery_app import app
from ..prompts_repo import load_active_prompt
from ..recording import record_step

log = logging.getLogger(__name__)


def label_image_key(label_id: uuid.UUID) -> str:
    return f"labels/{label_id}/image.webp"


def label_mask_key(label_id: uuid.UUID, obj_id: str) -> str:
    return f"labels/{label_id}/{obj_id}.png"


def _save_drafts(db: Session, label: SegLabel, drafts: list, source: str) -> bool:
    """Lưu mask nháp; False nếu không có thân (để thử cách khác)."""
    if not any(o.cls == "trunk" and o.mask.any() for o in drafts):
        return False
    objects = []
    for o in drafts:
        key = label_mask_key(label.id, o.id)
        storage.put_bytes(key, mask_png(o.mask), "image/png")
        objects.append({"id": o.id, "cls": o.cls, "key": key, "source": source, "accepted": True})
    label.objects, label.draft_source = objects, source
    label.status, label.error = SegLabelStatus.draft, None
    db.commit()
    return True


def draft_label(db: Session, label_id: uuid.UUID) -> None:
    label = db.get(SegLabel, label_id)
    if label is None or label.status not in (SegLabelStatus.pending, SegLabelStatus.failed):
        return
    try:
        # Ảnh tải lên: xóa EXIF, cạnh dài 1536 px, lưu WebP (giống ảnh người dùng).
        if label.width is None:
            raw = storage.get_bytes(label.image_key)
            prepared = prepare_upload(raw)
            new_key = label_image_key(label.id)
            storage.put_bytes(new_key, prepared.data, prepared.media_type)
            if label.image_key != new_key and label.image_key.startswith("uploads/"):  # ảnh thô còn EXIF
                storage.delete(label.image_key)
            label.image_key, label.width, label.height = new_key, prepared.width, prepared.height
            db.commit()
        image = storage.get_bytes(label.image_key)
        size = (label.width, label.height)

        if label.analysis is None and _save_drafts(db, label, local_drafts(image), "local"):
            return  # nháp miễn phí (tách nền + màu) — không tốn API; không ra thì mới nhờ AI đọc tọa độ
        if label.analysis is None:
            p1 = load_active_prompt(db, "P1")
            llm = get_llm_client(economy=True, effort="low")
            analysis, rec = run_p1(llm, p1, [ImageInput(image, "image/webp")], image_size=size,
                                   species_key=None, real_height_cm=None)
            rec.step_code = "L1"  # chi phí gán nhãn, tách khỏi phiên A của người dùng
            record_step(db, None, rec, input_ref={"seg_label_id": str(label.id)})
            label.analysis = analysis.model_dump(mode="json")
        analysis = Analysis.model_validate(label.analysis)
        if not analysis.image_quality.usable or analysis.trunk is None:
            label.status, label.error = SegLabelStatus.rejected, ", ".join(analysis.image_quality.issues) or "no trunk"
            db.commit()
            return

        drafts, source = make_drafts(image, analysis, size)
        _save_drafts(db, label, drafts, source)
    except (InvalidImageError, AIError) as e:
        db.rollback()
        label = db.get(SegLabel, label_id)
        label.status, label.error = SegLabelStatus.failed, str(e)[:500]
        db.commit()


@app.task(name="bonsai_worker.tasks.labeling.draft")
def draft(label_id: str) -> str:
    with get_sessionmaker()() as db:
        try:
            draft_label(db, uuid.UUID(label_id))
        except Exception:
            log.exception("labeling draft failed for %s", label_id)
            db.rollback()
            label = db.get(SegLabel, uuid.UUID(label_id))
            if label is not None:
                label.status, label.error = SegLabelStatus.failed, "internal error"
                db.commit()
            return "failed"
        return db.get(SegLabel, uuid.UUID(label_id)).status.value
