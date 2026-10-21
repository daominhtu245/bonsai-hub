"""Trang admin: prompt (phiên bản, kích hoạt), chi phí từ pipeline_steps, job lỗi."""

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import Integer, case, cast, func, select, update

from ..db.models import DesignJob, JobStatus, PipelineStep, PromptVersion
from ..security import DB, require_admin

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
