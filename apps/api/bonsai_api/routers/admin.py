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
from ..services.audit import audit
from ..services.credits import apply_credit
from ..services.settings import cutout_model, get_all, seg_model_ready, set_setting

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
def create_prompt(body: PromptCreate, db: DB, admin: Annotated[User, Depends(require_admin)]):
    """Tạo phiên bản mới (chưa kích hoạt). Không sửa phiên bản cũ để kết quả cũ còn truy được."""
    existing = db.execute(select(PromptVersion).where(PromptVersion.step_code == body.step_code)).scalars().all()
    if not existing:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Bước không tồn tại.")
    nums = [int(v.version[1:]) for v in existing if v.version[1:].isdigit()]
    row = PromptVersion(step_code=body.step_code, version=f"v{max(nums, default=0) + 1}", kind=existing[0].kind,
                        template={"system": body.system, "user": body.user}, description=body.description, active=False)
    db.add(row)
    audit(db, admin, "prompt.create", "prompt", f"{body.step_code}.{row.version}", description=body.description)
    db.commit()
    return PromptOut.model_validate(row, from_attributes=True)


@router.post("/prompts/{prompt_id}/activate", response_model=PromptOut)
def activate_prompt(prompt_id: int, db: DB, admin: Annotated[User, Depends(require_admin)]):
    row = db.get(PromptVersion, prompt_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    previous = db.execute(select(PromptVersion.version).where(PromptVersion.step_code == row.step_code,
                                                              PromptVersion.active)).scalar_one_or_none()
    audit(db, admin, "prompt.activate", "prompt", f"{row.step_code}.{row.version}", previous=previous)
    db.execute(update(PromptVersion).where(PromptVersion.step_code == row.step_code).values(active=False))
    db.flush()
    row.active = True
    db.commit()
    return PromptOut.model_validate(row, from_attributes=True)


class PromptStat(BaseModel):
    prompt_version: str
    calls: int
    fail_rate: float
    avg_cost_usd: float
    avg_latency_ms: int
    avg_tokens_out: int
    first_used: datetime
    last_used: datetime


@router.get("/prompts/stats", response_model=list[PromptStat])
def prompt_stats(db: DB, days: int = 90):
    """Hiệu quả từng phiên bản prompt (từ pipeline_steps): để so sánh trước/sau khi kích hoạt bản mới."""
    since = datetime.now(UTC) - timedelta(days=days)
    rows = db.execute(
        select(PipelineStep.prompt_version, func.count(), func.avg(case((PipelineStep.ok, 0.0), else_=1.0)),
               func.avg(PipelineStep.cost_usd), func.avg(PipelineStep.latency_ms), func.avg(PipelineStep.tokens_out),
               func.min(PipelineStep.created_at), func.max(PipelineStep.created_at))
        .where(PipelineStep.prompt_version.isnot(None), PipelineStep.created_at >= since)
        .group_by(PipelineStep.prompt_version).order_by(PipelineStep.prompt_version)
    ).all()
    return [PromptStat(prompt_version=v, calls=n, fail_rate=round(float(f or 0), 3), avg_cost_usd=round(float(c or 0), 5),
                       avg_latency_ms=int(lat or 0), avg_tokens_out=int(t or 0), first_used=a, last_used=b)
            for v, n, f, c, lat, t, a, b in rows]


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
def gift_credits(body: GiftIn, db: DB, admin: Annotated[User, Depends(require_admin)]):
    """Cộng lượt cho một người (đã đăng nhập ít nhất 1 lần). Mỗi người chỉ nhận 1 lần mỗi đợt (`batch`)."""
    user = db.execute(select(User).where(func.lower(User.email) == body.email.lower())).scalar_one_or_none()
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Chưa có tài khoản với email này (người dùng cần đăng nhập trước).")
    credited = apply_credit(db, user.id, body.credits, CreditReason.gift, f"batch:{body.batch}")
    audit(db, admin, "credits.gift", "user", user.id, credits=body.credits, batch=body.batch, credited=credited)
    db.commit()
    db.refresh(user)
    return GiftOut(email=user.email, credited=credited, credits=user.credits)


# ---------- chế độ chi phí AI (bonsai_pipeline/cost_mode.py) ----------


class SettingsOut(BaseModel):
    cost_mode: Literal["standard", "economy"]
    analysis_mode: Literal["api", "hybrid"]
    design_mode: Literal["api", "rules"]
    cutout_mode: Literal["on", "off"] = "on"
    stage_mode: Literal["ai", "derive"] = "ai"
    cutout_model: str | None = None  # model tách nền trên worker (báo qua Redis)
    seg_model_ready: bool = False  # worker có trọng số YOLO-seg (báo cáo qua Redis heartbeat; xem worker monitoring)
    app_env: str = "dev"  # nhãn môi trường ở thanh trên trang quản trị


class SettingsIn(BaseModel):
    cost_mode: Literal["standard", "economy"] | None = None
    analysis_mode: Literal["api", "hybrid"] | None = None
    design_mode: Literal["api", "rules"] | None = None
    cutout_mode: Literal["on", "off"] | None = None
    stage_mode: Literal["ai", "derive"] | None = None


def _settings_out(db) -> SettingsOut:
    from ..settings import get_settings

    return SettingsOut(**get_all(db), cutout_model=cutout_model(), seg_model_ready=seg_model_ready(), app_env=get_settings().app_env)


@router.get("/settings", response_model=SettingsOut)
def get_settings(db: DB):
    return _settings_out(db)


@router.put("/settings", response_model=SettingsOut)
def put_settings(body: SettingsIn, db: DB, admin: Annotated[User, Depends(require_admin)]):
    """Áp dụng cho job bắt đầu sau khi đổi; job đang chạy giữ chế độ cũ."""
    for key, value in body.model_dump(exclude_none=True).items():
        before = get_all(db)[key]
        if before != value:
            audit(db, admin, "settings.update", "setting", key, before=before, after=value)
        set_setting(db, key, value, by=admin.email)
    return _settings_out(db)


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
def restore_user(body: RestoreIn, db: DB, admin: Annotated[User, Depends(require_admin)]):
    user = db.execute(select(User).where(func.lower(User.email) == body.email.lower())).scalar_one_or_none()
    if user is None or user.deleted_at is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không có tài khoản đã xóa với email này.")
    user.deleted_at = None
    audit(db, admin, "user.unlock", "user", user.id)
    db.commit()
    return {"email": user.email, "restored": True}
