"""Màn 08 — Vườn của tôi: mỗi cây kèm phiên thiết kế mới nhất, giai đoạn hiện tại và việc tiếp theo."""

import uuid

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import select

from .. import storage
from ..db.models import (
    DesignJob, DesignOption, JobStatus, PhotoSource, RenderImage, Stage, StageTaskCheck, Style, Tree, TreePhoto,
)
from ..security import DB, CurrentUser
from ..services.results import NAME

router = APIRouter(tags=["garden"])
STAGE_ORDER = ("S0", "S1", "S2", "S3", "S4")


class GardenTree(BaseModel):
    tree_id: uuid.UUID
    nickname: str | None
    species_key: str | None
    thumbnail_url: str | None
    job_id: uuid.UUID | None
    job_status: str | None
    style_vi: str | None
    stage_code: str | None
    stage_name_vi: str | None
    stages_done: int  # số giai đoạn đã làm xong hết việc (để vẽ thanh tiến độ)
    next_task_vi: str | None


class GardenOut(BaseModel):
    trees: list[GardenTree]
    credits: int


def _current_stage(stages: dict[str, Stage], checks: dict[str, set[int]]) -> tuple[str | None, int, str | None]:
    """Giai đoạn đầu tiên còn việc chưa tick; trả (mã, số giai đoạn đã xong, việc tiếp theo)."""
    done = 0
    for code in STAGE_ORDER:
        st = stages.get(code)
        actions = ((st.guide_vi or {}).get("actions_vi") or []) if st else []
        pending = [a for i, a in enumerate(actions) if i not in checks.get(code, set())]
        if pending:
            return code, done, pending[0]
        done += 1
    return "S4", done, None


@router.get("/garden", response_model=GardenOut)
def garden(user: CurrentUser, db: DB):
    trees = db.execute(select(Tree).where(Tree.user_id == user.id).order_by(Tree.created_at.desc())).scalars().all()
    styles = {s.key: s for s in db.execute(select(Style)).scalars()}
    out = []
    for tree in trees:
        job = db.execute(select(DesignJob).where(DesignJob.tree_id == tree.id).order_by(DesignJob.created_at.desc())).scalars().first()
        thumb_key = None
        front = db.execute(select(TreePhoto).where(TreePhoto.tree_id == tree.id, TreePhoto.source == PhotoSource.upload)
                           .order_by(TreePhoto.is_front.desc(), TreePhoto.view_index)).scalars().first()
        if front and not front.storage_key.startswith("uploads/"):
            thumb_key = front.storage_key
        item = GardenTree(tree_id=tree.id, nickname=tree.nickname, species_key=tree.species_key, thumbnail_url=None,
                          job_id=job.id if job else None, job_status=job.status.value if job else None, style_vi=None,
                          stage_code=None, stage_name_vi=None, stages_done=0, next_task_vi=None)
        if job and job.chosen_option_id:
            opt = db.get(DesignOption, job.chosen_option_id)
            item.style_vi = styles[opt.style_key].name_vi if opt and opt.style_key in styles else None
        if job and job.status == JobStatus.done:
            stages = {s.code: s for s in db.execute(select(Stage).where(Stage.job_id == job.id)).scalars()}
            checks: dict[str, set[int]] = {}
            for c in db.execute(select(StageTaskCheck).where(StageTaskCheck.job_id == job.id)).scalars():
                checks.setdefault(c.stage_code, set()).add(c.task_index)
            code, done, task = _current_stage(stages, checks)
            item.stage_code, item.stage_name_vi, item.stages_done, item.next_task_vi = code, NAME.get(code), done, task
            final = db.execute(select(RenderImage).where(RenderImage.job_id == job.id, RenderImage.stage_code == "S4",
                                                         RenderImage.selected)).scalars().first()
            if final:
                thumb_key = final.storage_key
        item.thumbnail_url = storage.presign_get(thumb_key) if thumb_key else None
        out.append(item)
    return GardenOut(trees=out, credits=user.credits)
