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
from ..db.models import DesignJob, DesignOption, JobStatus, Style, Tree, TreePhoto
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
    species_key: str | None
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
    mine = db.execute(select(DesignOption).where(DesignOption.job_id == job.id, DesignOption.rank == USER_RANK)).scalar_one_or_none()
    return studio_payload(db, job, mine.design.get("_input") if mine else None)


def studio_payload(db, job: DesignJob, draft: dict | None) -> StudioOut:
    """Dữ liệu màn Tự thiết kế cho một phôi đã phân tích (dùng cả cho thử thách phôi)."""
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
    tree = db.get(Tree, job.tree_id)
    return StudioOut(
        species_key=(tree.species_key if tree else None) or (a.species.guess if a.species else None),
        photo_url=storage.presign_get(photo.storage_key), width=photo.width or t.image_width, height=photo.height or t.image_height,
        trunk=a.trunk.model_dump() if a.trunk else {},
        branches=[b.model_dump() for b in a.branches],
        candidate_apex_px=list(t.candidate_apex_px), first_branch_y_range_px=list(t.first_branch_y_range_px),
        styles=styles, templates=templates, draft=draft,
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
    if row.design and row.design.get("share_code"):  # giữ link nhờ góp ý đã gửi, ảnh theo thiết kế mới
        from bonsai_pipeline.studio_compose import compose

        design |= {"share_code": row.design["share_code"], "share_key": row.design["share_key"]}
        storage.put_bytes(design["share_key"], compose(storage.get_bytes(photo.storage_key), a, body), "image/jpeg")
    row.style_key, row.suitability, row.design = body.style_key, 0.0, design
    row.sketch_svg_key, row.sketch_png_key, row.sketch_meta = f"{base}.svg", f"{base}.png", scene.counts
    db.commit()
    return MyDesignOut(option_id=row.id, hints=tips, sketch_svg_url=storage.presign_get(f"{base}.svg"))


# ---------- xem thử nhanh (AI, chất lượng thấp, miễn phí 2 lần mỗi phiên) ----------

PREVIEW_LIMIT = 2


class PreviewOut(BaseModel):
    state: str  # none | running | done | failed
    url: str | None
    remaining: int


def preview_limit(db, user) -> int:
    """Gói nhà vườn tháng còn hạn: nhiều lượt xem thử hơn (Cấu hình vận hành)."""
    from ..services.market import plan_active
    from ..services.ops import get_ops

    return int(get_ops(db).get("nursery_preview_limit") or PREVIEW_LIMIT) if plan_active(user) else PREVIEW_LIMIT


def _preview_out(job: DesignJob, limit: int = PREVIEW_LIMIT) -> PreviewOut:
    pv = (job.progress or {}).get("preview") or {}
    url = storage.presign_get(pv["key"]) if pv.get("state") == "done" and pv.get("key") else None
    return PreviewOut(state=pv.get("state", "none"), url=url, remaining=max(0, limit - int(pv.get("count", 0))))


def _mine(db, job: DesignJob) -> DesignOption:
    row = db.execute(select(DesignOption).where(DesignOption.job_id == job.id, DesignOption.rank == USER_RANK)).scalar_one_or_none()
    if row is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Bạn lưu thiết kế trước nhé.")
    return row


@router.get("/jobs/{job_id}/my-design/preview", response_model=PreviewOut)
def preview_status(job_id: uuid.UUID, user: CurrentUser, db: DB):
    job = db.get(DesignJob, job_id)
    if job is None or job.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy phiên thiết kế.")
    return _preview_out(job, preview_limit(db, user))


@router.post("/jobs/{job_id}/my-design/preview", response_model=PreviewOut, status_code=status.HTTP_202_ACCEPTED)
def start_preview(job_id: uuid.UUID, user: CurrentUser, db: DB):
    from .. import queue
    from ..services.ops import get_ops

    job = _job(db, job_id, user)
    _mine(db, job)
    ops = get_ops(db)
    if ops["pause_render"]:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, ops["pause_message"])
    pv = dict((job.progress or {}).get("preview") or {})
    limit = preview_limit(db, user)
    if pv.get("state") == "running":
        return _preview_out(job, limit)
    if int(pv.get("count", 0)) >= limit:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, f"Bạn đã xem thử {limit} lần cho cây này. Bấm “Tạo ảnh tương lai” để có ảnh đẹp.")
    pv.update(state="running", count=int(pv.get("count", 0)) + 1)
    job.progress = {**(job.progress or {}), "preview": pv}
    db.commit()
    queue.enqueue("bonsai_worker.tasks.studio.preview", str(job.id), queue="render")
    return _preview_out(job, limit)


# ---------- chia sẻ thiết kế để nhờ góp ý (ảnh ghép từ thư viện, không tốn AI) ----------

class DesignShareOut(BaseModel):
    url: str
    image_url: str


@router.post("/jobs/{job_id}/my-design/share", response_model=DesignShareOut)
def share_design(job_id: uuid.UUID, user: CurrentUser, db: DB):
    from bonsai_pipeline.studio_compose import compose

    from ..services.share import new_code
    from ..settings import get_settings

    job = db.get(DesignJob, job_id)
    if job is None or job.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy phiên thiết kế.")
    row = _mine(db, job)
    d = UserDesignIn.model_validate(row.design.get("_input") or {})
    photo = db.get(TreePhoto, job.front_photo_id)
    key = f"trees/{job.tree_id}/jobs/{job.id}/design_share.jpg"
    storage.put_bytes(key, compose(storage.get_bytes(photo.storage_key), Analysis.model_validate(job.analysis), d), "image/jpeg")
    code = row.design.get("share_code") or new_code()
    row.design = {**row.design, "share_code": code, "share_key": key}
    db.commit()
    base = get_settings().public_base_url.rstrip("/")
    return DesignShareOut(url=f"{base}/tk/{code}", image_url=storage.presign_get(key))
