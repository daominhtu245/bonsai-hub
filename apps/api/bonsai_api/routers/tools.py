"""Công cụ chăm cây (docs/ideas.md E1, E5–E8, F5) — chạy trên máy, không tốn lượt, không gọi API AI."""

from __future__ import annotations

import uuid
from dataclasses import asdict
from datetime import date
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select

from bonsai_pipeline.care_tools import (
    RESCUE_QUESTIONS, graft_suggestions, mai_plan, menh, price_estimate, rescue_plan, wire_plan,
)
from bonsai_pipeline.schemas import Analysis, DesignOption

from ..db.models import DesignJob, DesignOption as OptionRow, Listing, Tree
from ..security import DB, CurrentUser
from ..services.provinces import PROVINCES, region_of

router = APIRouter(prefix="/tools", tags=["tools"])
VN = ZoneInfo("Asia/Ho_Chi_Minh")


def _design(db, job_id: uuid.UUID, user, option_id: uuid.UUID | None) -> tuple[DesignJob, Analysis, DesignOption, Tree]:
    job = db.get(DesignJob, job_id)
    if job is None or job.user_id != user.id or not job.analysis:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy phiên thiết kế.")
    oid = option_id or job.chosen_option_id
    row = db.get(OptionRow, oid) if oid else db.execute(
        select(OptionRow).where(OptionRow.job_id == job.id).order_by(OptionRow.rank)).scalars().first()
    if row is None or row.job_id != job.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Chưa có phương án thiết kế.")
    return job, Analysis.model_validate(job.analysis), DesignOption.model_validate(row.design), db.get(Tree, job.tree_id)


@router.get("/wire/{job_id}")
def wire(job_id: uuid.UUID, db: DB, user: CurrentUser, option_id: uuid.UUID | None = None):
    _, a, o, tree = _design(db, job_id, user, option_id)
    return asdict(wire_plan(a, o, tree.real_height_cm))


@router.get("/graft/{job_id}")
def graft(job_id: uuid.UUID, db: DB, user: CurrentUser, option_id: uuid.UUID | None = None):
    _, a, o, tree = _design(db, job_id, user, option_id)
    spots, season = graft_suggestions(a, o, tree.species_key)
    return {"spots": [asdict(s) for s in spots], "season_vi": season}


@router.get("/price/{job_id}")
def price(job_id: uuid.UUID, db: DB, user: CurrentUser):
    job, a, _, tree = _design(db, job_id, user, None)
    comps = [float(p) / float(t) for p, t in db.execute(
        select(Listing.price_vnd, Listing.trunk_cm).where(Listing.species_key == tree.species_key, Listing.price_vnd.is_not(None),
                                                          Listing.trunk_cm > 0, Listing.status.in_(["active", "sold"]))).all()]
    est = price_estimate(a, tree.species_key, tree.real_height_cm, comps)
    return asdict(est) if est else None


@router.get("/rescue/questions")
def rescue_questions():
    return [{"key": k, "text_vi": t} for k, t in RESCUE_QUESTIONS]


class RescueIn(BaseModel):
    answers: dict[str, bool]


@router.post("/rescue")
def rescue(body: RescueIn):
    return asdict(rescue_plan(body.answers))


@router.get("/menh")
def menh_for(year: int = Query(ge=1920, le=2030)):
    return asdict(menh(year))


@router.get("/provinces")
def provinces():
    return [{"code": k, "name": v[0], "region": v[1]} for k, v in PROVINCES.items()]


@router.get("/mai-tet")
def mai_tet(province: str | None = None, avg_temp_c: float | None = None):
    plan = mai_plan(date.today(), region_of(province), avg_temp_c)
    out = asdict(plan)
    out["province"] = province if province in PROVINCES else None
    return out
