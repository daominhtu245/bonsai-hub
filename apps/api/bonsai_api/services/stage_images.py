"""Ảnh từng giai đoạn của một phiên đã xong: S0 = ảnh phôi chính diện, S1–S4 = ảnh được chọn (mới nhất)."""

from __future__ import annotations

from sqlalchemy import select

from ..db.models import DesignJob, RenderImage, TreePhoto


def stage_keys(db, job: DesignJob) -> dict[str, str]:
    out: dict[str, str] = {}
    front = db.get(TreePhoto, job.front_photo_id) if job.front_photo_id else None
    if front is not None:
        out["S0"] = front.storage_key
    rows = db.execute(select(RenderImage).where(RenderImage.job_id == job.id, RenderImage.selected.is_(True))
                      .order_by(RenderImage.stage_code, RenderImage.attempt.desc())).scalars()
    for img in rows:
        out.setdefault(img.stage_code, img.storage_key)
    return dict(sorted(out.items()))
