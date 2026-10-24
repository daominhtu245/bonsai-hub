"""Trang admin: prompt (phiên bản, kích hoạt), chi phí từ pipeline_steps, job lỗi."""

import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import Integer, case, cast, func, select, update

from .. import storage
from ..db.models import (
    CreditReason, DesignJob, DesignOption, Feedback, JobStatus, PipelineStep, PromptVersion, Species, User,
)
from ..security import DB, require_admin
from ..services.credits import apply_credit
from ..services.settings import get_cost_mode, set_cost_mode

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_admin)])


class PromptOut(BaseModel):
    id: int
    step_code: str
    version: str
    kind: str
    description: str | None
    template: dict
    active: bool
    created_at: datetime


class PromptCreate(BaseModel):
    step_code: str = Field(max_length=32)
    system: str | None = None
    user: str = Field(min_length=10)
    description: str | None = None


@router.get("/prompts", response_model=list[PromptOut])
def prompts(db: DB):
    rows = db.execute(select(PromptVersion).order_by(PromptVersion.step_code, PromptVersion.id.desc())).scalars()
    return [PromptOut.model_validate(r, from_attributes=True) for r in rows]


@router.post("/prompts", response_model=PromptOut, status_code=status.HTTP_201_CREATED)
def create_prompt(body: PromptCreate, db: DB):
    """Tạo phiên bản mới (chưa kích hoạt). Không sửa phiên bản cũ để kết quả cũ còn truy được."""
    existing = db.execute(select(PromptVersion).where(PromptVersion.step_code == body.step_code)).scalars().all()
    if not existing:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Bước không tồn tại.")
    nums = [int(v.version[1:]) for v in existing if v.version[1:].isdigit()]
    row = PromptVersion(step_code=body.step_code, version=f"v{max(nums, default=0) + 1}", kind=existing[0].kind,
                        template={"system": body.system, "user": body.user}, description=body.description, active=False)
    db.add(row)
    db.commit()
    return PromptOut.model_validate(row, from_attributes=True)


@router.post("/prompts/{prompt_id}/activate", response_model=PromptOut)
def activate_prompt(prompt_id: int, db: DB):
    row = db.get(PromptVersion, prompt_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    db.execute(update(PromptVersion).where(PromptVersion.step_code == row.step_code).values(active=False))
    db.flush()
    row.active = True
    db.commit()
    return PromptOut.model_validate(row, from_attributes=True)


class DayCost(BaseModel):
    day: str
    cost_usd: float
    jobs: int
    paid_jobs: int
    failed_jobs: int


class StepCost(BaseModel):
    step_code: str
    calls: int
    cost_usd: float
    avg_latency_ms: int
    fail_rate: float


class CostsOut(BaseModel):
    days: list[DayCost]
    steps: list[StepCost]
    total_usd: float
    avg_cost_per_paid_job_usd: float | None


@router.get("/costs", response_model=CostsOut)
def costs(db: DB, days: int = 14):
    since = datetime.now(UTC) - timedelta(days=days)
    day = func.date_trunc("day", PipelineStep.created_at)
    cost_rows = db.execute(select(day, func.sum(PipelineStep.cost_usd)).where(PipelineStep.created_at >= since).group_by(day)).all()
    jday = func.date_trunc("day", DesignJob.created_at)
    job_rows = db.execute(
        select(jday, func.count(), func.count(DesignJob.chosen_option_id),
               func.sum(cast(DesignJob.status == JobStatus.failed, Integer)))
        .where(DesignJob.created_at >= since).group_by(jday)
    ).all()
    by_day: dict[str, DayCost] = {}
    for d, c in cost_rows:
        k = d.date().isoformat()
        by_day[k] = DayCost(day=k, cost_usd=round(float(c or 0), 4), jobs=0, paid_jobs=0, failed_jobs=0)
    for d, n, paid, failed in job_rows:
        k = d.date().isoformat()
        item = by_day.setdefault(k, DayCost(day=k, cost_usd=0, jobs=0, paid_jobs=0, failed_jobs=0))
        item.jobs, item.paid_jobs, item.failed_jobs = n, paid, int(failed or 0)
    steps = db.execute(
        select(PipelineStep.step_code, func.count(), func.sum(PipelineStep.cost_usd), func.avg(PipelineStep.latency_ms),
               func.avg(case((PipelineStep.ok, 0.0), else_=1.0)))
        .where(PipelineStep.created_at >= since).group_by(PipelineStep.step_code).order_by(func.sum(PipelineStep.cost_usd).desc())
    ).all()
    total = sum(d.cost_usd for d in by_day.values())
    paid = sum(d.paid_jobs for d in by_day.values())
    return CostsOut(
        days=sorted(by_day.values(), key=lambda d: d.day),
        steps=[StepCost(step_code=s, calls=n, cost_usd=round(float(c or 0), 4), avg_latency_ms=int(lat or 0),
                        fail_rate=round(float(fr or 0), 3)) for s, n, c, lat, fr in steps],
        total_usd=round(total, 4),
        avg_cost_per_paid_job_usd=round(total / paid, 4) if paid else None,
    )


class FailedJob(BaseModel):
    id: str
    status: str
    error_code: str | None
    error: str | None
    created_at: datetime
    charged: bool


@router.get("/jobs/failed", response_model=list[FailedJob])
def failed_jobs(db: DB, limit: int = 50):
    rows = db.execute(select(DesignJob).where(DesignJob.status == JobStatus.failed)
                      .order_by(DesignJob.created_at.desc()).limit(min(limit, 200))).scalars()
    return [FailedJob(id=str(j.id), status=j.status.value, error_code=j.error_code, error=(j.error or "")[:500],
                      created_at=j.created_at, charged=j.chosen_option_id is not None) for j in rows]


# ---------- phản hồi người dùng ----------

class FeedbackRow(BaseModel):
    job_id: str
    rating: int
    reason_tags: list
    comment: str | None
    style_key: str | None
    user_email: str | None
    created_at: datetime


@router.get("/feedback", response_model=list[FeedbackRow])
def feedback_list(db: DB, rating: int | None = None, limit: int = 100):
    q = (select(Feedback, User.email, DesignOption.style_key)
         .join(User, User.id == Feedback.user_id)
         .join(DesignJob, DesignJob.id == Feedback.job_id)
         .outerjoin(DesignOption, DesignOption.id == DesignJob.chosen_option_id)
         .order_by(Feedback.created_at.desc()).limit(min(limit, 500)))
    if rating in (1, -1):
        q = q.where(Feedback.rating == rating)
    return [FeedbackRow(job_id=str(f.job_id), rating=f.rating, reason_tags=f.reason_tags or [], comment=f.comment,
                        style_key=style, user_email=email, created_at=f.created_at) for f, email, style in db.execute(q)]


# ---------- tặng lượt (mời dùng thử beta) ----------

class GiftIn(BaseModel):
    email: str
    credits: int = Field(ge=1, le=100)
    batch: str = Field(min_length=1, max_length=40, pattern=r"^[a-zA-Z0-9_-]+$")


class GiftOut(BaseModel):
    email: str
    credited: bool
    credits: int


@router.post("/credits/gift", response_model=GiftOut)
def gift_credits(body: GiftIn, db: DB):
    """Cộng lượt cho một người (đã đăng nhập ít nhất 1 lần). Mỗi người chỉ nhận 1 lần mỗi đợt (`batch`)."""
    user = db.execute(select(User).where(func.lower(User.email) == body.email.lower())).scalar_one_or_none()
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Chưa có tài khoản với email này (người dùng cần đăng nhập trước).")
    credited = apply_credit(db, user.id, body.credits, CreditReason.gift, f"batch:{body.batch}")
    db.commit()
    db.refresh(user)
    return GiftOut(email=user.email, credited=credited, credits=user.credits)


# ---------- chế độ chi phí AI (bonsai_pipeline/cost_mode.py) ----------


class SettingsOut(BaseModel):
    cost_mode: Literal["standard", "economy"]


@router.get("/settings", response_model=SettingsOut)
def get_settings(db: DB):
    return SettingsOut(cost_mode=get_cost_mode(db))


@router.put("/settings", response_model=SettingsOut)
def put_settings(body: SettingsOut, db: DB, admin: Annotated[User, Depends(require_admin)]):
    """Áp dụng cho job bắt đầu sau khi đổi; job đang chạy giữ chế độ cũ."""
    return SettingsOut(cost_mode=set_cost_mode(db, body.cost_mode, by=admin.email))


# ---------- ảnh tham chiếu loài (đưa vào P3a/P3d) ----------

MAX_REFS = 5
REF_TYPES = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}


class SpeciesRefs(BaseModel):
    key: str
    name_vi: str
    refs: list[dict]  # [{"key", "url"}]


class RefPresignIn(BaseModel):
    content_type: str


class RefKeyIn(BaseModel):
    key: str


def _species(db, key: str) -> Species:
    sp = db.get(Species, key)
    if sp is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Loài không tồn tại.")
    return sp


def _refs_out(sp: Species) -> SpeciesRefs:
    return SpeciesRefs(key=sp.key, name_vi=sp.name_vi,
                       refs=[{"key": k, "url": storage.presign_get(k)} for k in (sp.ref_image_keys or [])])


@router.get("/species", response_model=list[SpeciesRefs])
def species_refs(db: DB):
    return [_refs_out(sp) for sp in db.execute(select(Species).order_by(Species.name_vi)).scalars()]


@router.post("/species/{key}/refs/presign")
def species_ref_presign(key: str, body: RefPresignIn, db: DB):
    _species(db, key)
    ext = REF_TYPES.get(body.content_type)
    if ext is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Chỉ nhận JPEG, PNG, WebP.")
    obj = f"refs/species/{key}/{uuid.uuid4().hex}.{ext}"
    return {"key": obj, "url": storage.presign_put(obj, body.content_type), "headers": {"Content-Type": body.content_type}}


@router.post("/species/{key}/refs", response_model=SpeciesRefs)
def species_ref_add(key: str, body: RefKeyIn, db: DB):
    sp = _species(db, key)
    if not body.key.startswith(f"refs/species/{key}/") or ".." in body.key:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Ảnh không thuộc loài này.")
    refs = list(sp.ref_image_keys or [])
    if len(refs) >= MAX_REFS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Tối đa {MAX_REFS} ảnh mỗi loài.")
    if body.key not in refs:
        refs.append(body.key)
    sp.ref_image_keys = refs
    db.commit()
    return _refs_out(sp)


@router.delete("/species/{key}/refs", response_model=SpeciesRefs)
def species_ref_remove(key: str, body: RefKeyIn, db: DB):
    sp = _species(db, key)
    sp.ref_image_keys = [k for k in (sp.ref_image_keys or []) if k != body.key]
    db.commit()
    return _refs_out(sp)


# ---------- tài khoản đã xóa mềm ----------

class RestoreIn(BaseModel):
    email: str


@router.post("/users/restore")
def restore_user(body: RestoreIn, db: DB):
    user = db.execute(select(User).where(func.lower(User.email) == body.email.lower())).scalar_one_or_none()
    if user is None or user.deleted_at is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không có tài khoản đã xóa với email này.")
    user.deleted_at = None
    db.commit()
    return {"email": user.email, "restored": True}
