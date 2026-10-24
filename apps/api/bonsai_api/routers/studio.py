"""Màn Tự thiết kế: người dùng tự chọn cành giữ / cắt, kéo tầng lá, cành mới, ngọn, chậu lên ảnh phôi.

GET  /jobs/{id}/studio     dữ liệu để vẽ (ảnh, cành P1 đã đọc, mẫu từ phương án AI, thế, bản nháp đã lưu)
POST /jobs/{id}/my-design  lưu thành một phương án (source=user, rank 9) + bản vẽ; trả gợi ý theo luật (không chặn).
Sau đó người dùng chọn phương án này ở màn Chọn thế → trả 1 lượt → phiên B như phương án AI.
"""

import uuid

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select

from bonsai_pipeline.rule_engine import Targets
from bonsai_pipeline.schemas import Analysis
from bonsai_pipeline.sketch import build_scene, to_png, to_svg
from bonsai_pipeline.user_design import UserDesignIn, build_user_option, hints

from .. import storage
from ..db.models import DesignJob, DesignOption, JobStatus, Style, TreePhoto
from ..security import DB, CurrentUser

router = APIRouter(tags=["studio"])
USER_RANK = 9


def _job(db, job_id: uuid.UUID, user) -> DesignJob:
    job = db.get(DesignJob, job_id)
    if job is None or job.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy phiên thiết kế.")
    if job.status != JobStatus.awaiting_choice or not job.analysis or not job.targets or job.front_photo_id is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Chỉ tự thiết kế được sau khi phân tích xong và trước khi tạo ảnh.")
    return job


def _targets(job: DesignJob) -> Targets:
    t = job.targets or {}
    return Targets(**{k: t[k] for k in Targets.__dataclass_fields__ if k in t})


class StudioOut(BaseModel):
    photo_url: str
    width: int
    height: int
    trunk: dict
    branches: list[dict]
    candidate_apex_px: list[float]
    first_branch_y_range_px: list[int]
    styles: list[dict]
    templates: list[dict]
    draft: dict | None


@router.get("/jobs/{job_id}/studio", response_model=StudioOut)
def studio(job_id: uuid.UUID, user: CurrentUser, db: DB):
    job = _job(db, job_id, user)
    photo = db.get(TreePhoto, job.front_photo_id)
    a = Analysis.model_validate(job.analysis)
    t = _targets(job)
    allowed = set(t.allowed_styles)
    styles = [{"key": s.key, "name_vi": s.name_vi, "suggested": s.key in allowed}
              for s in db.execute(select(Style).order_by(Style.name_vi)).scalars()]
    rows = db.execute(select(DesignOption).where(DesignOption.job_id == job.id).order_by(DesignOption.rank)).scalars().all()
    templates = [{"rank": o.rank, "style_key": o.style_key, "removed": [r["id"] for r in o.design.get("remove_branches", [])],
                  "apex": o.design.get("apex", {}).get("point_px"), "pads": o.design.get("silhouette", {}).get("pads", 4),
                  "silhouette": o.design.get("silhouette"), "pot": o.design.get("pot")}
                 for o in rows if o.design.get("source", "ai") == "ai"]
    mine = next((o for o in rows if o.rank == USER_RANK), None)
    return StudioOut(
        photo_url=storage.presign_get(photo.storage_key), width=photo.width or t.image_width, height=photo.height or t.image_height,
        trunk=a.trunk.model_dump() if a.trunk else {},
        branches=[b.model_dump() for b in a.branches],
        candidate_apex_px=list(t.candidate_apex_px), first_branch_y_range_px=list(t.first_branch_y_range_px),
        styles=styles, templates=templates, draft=(mine.design.get("_input") if mine else None),
    )


class MyDesignOut(BaseModel):
    option_id: uuid.UUID
    hints: list[str]
    sketch_svg_url: str


@router.post("/jobs/{job_id}/my-design", response_model=MyDesignOut)
def save_my_design(job_id: uuid.UUID, body: UserDesignIn, user: CurrentUser, db: DB):
    job = _job(db, job_id, user)
    if db.get(Style, body.style_key) is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Thế không hợp lệ.")
    a = Analysis.model_validate(job.analysis)
    t = _targets(job)
    option = build_user_option(a, t, body)
    tips = hints(a, t, option)
    photo = db.get(TreePhoto, job.front_photo_id)
    size = (photo.width or t.image_width, photo.height or t.image_height)
    scene = build_scene(a, option, size)
    base = f"trees/{job.tree_id}/jobs/{job.id}/sketch_user"
    storage.put_bytes(f"{base}.svg", to_svg(scene, title="Thiết kế của bạn").encode(), "image/svg+xml")
    storage.put_bytes(f"{base}.png", to_png(scene, storage.get_bytes(photo.storage_key)), "image/png")
    design = {**option.model_dump(mode="json"), "_input": body.model_dump(mode="json"), "hints": tips}
    row = db.execute(select(DesignOption).where(DesignOption.job_id == job.id, DesignOption.rank == USER_RANK)).scalar_one_or_none()
    if row is None:
        row = DesignOption(job_id=job.id, rank=USER_RANK)
        db.add(row)
    row.style_key, row.suitability, row.design = body.style_key, 0.0, design
    row.sketch_svg_key, row.sketch_png_key, row.sketch_meta = f"{base}.svg", f"{base}.png", scene.counts
    db.commit()
    return MyDesignOut(option_id=row.id, hints=tips, sketch_svg_url=storage.presign_get(f"{base}.svg"))
