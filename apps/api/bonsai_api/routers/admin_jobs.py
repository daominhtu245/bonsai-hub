"""/admin/jobs — tra cứu và xử lý phiên thiết kế: danh sách lọc, chi tiết đầy đủ (phân tích, phương án + bản vẽ,
mọi ảnh sinh ra kể cả ảnh bị loại, từng bước pipeline với chi phí / lỗi, phản hồi, sổ lượt), và thao tác:
chạy lại (miễn phí cho người dùng), hoàn lượt, đánh dấu lỗi cho phiên bị treo.
"""

import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import String, cast, func, or_, select

from .. import queue, storage
from ..db.models import (
    CreditLedger, CreditReason, DesignJob, DesignOption, Feedback, JobStatus, PhotoSource, PipelineStep, RenderImage,
    Stage, Tree, TreePhoto, User,
)
from ..security import DB, require_admin
from ..services.audit import audit
from ..services.credits import apply_credit, next_charge_ref, refund_render, spend_for_render
from .admin_common import Page, paginate

router = APIRouter(prefix="/admin/jobs", tags=["admin"], dependencies=[Depends(require_admin)])
Admin = Annotated[User, Depends(require_admin)]

ACTIVE = (JobStatus.queued, JobStatus.analyzing, JobStatus.designing, JobStatus.rendering_final, JobStatus.judging,
          JobStatus.rendering_stages, JobStatus.writing_guide)
STUCK_AFTER = timedelta(minutes=20)


class JobRow(BaseModel):
    id: uuid.UUID
    created_at: datetime
    status: JobStatus
    error_code: str | None
    user_id: uuid.UUID
    user_email: str | None
    tree_nickname: str | None
    species_key: str | None
    style_key: str | None
    paid: bool
    cost_usd: float
    cost_mode: str | None
    prompt_version: str | None
    duration_s: float | None
    stuck: bool


def _cost_subq():
    return (select(PipelineStep.job_id, func.sum(PipelineStep.cost_usd).label("cost"))
            .group_by(PipelineStep.job_id).subquery())


def _row(job: DesignJob, email, nickname, species, style, cost) -> JobRow:
    now = datetime.now(UTC)
    dur = (job.finished_at - job.started_at).total_seconds() if job.started_at and job.finished_at else None
    progress = job.progress or {}
    return JobRow(
        id=job.id, created_at=job.created_at, status=job.status, error_code=job.error_code, user_id=job.user_id,
        user_email=email, tree_nickname=nickname, species_key=species, style_key=style,
        paid=job.chosen_option_id is not None, cost_usd=round(float(cost or 0), 4),
        cost_mode=(progress.get("result") or {}).get("cost_mode") or progress.get("cost_mode_a"),
        prompt_version=job.prompt_version, duration_s=round(dur, 1) if dur is not None else None,
        stuck=job.status in ACTIVE and now - (job.started_at or job.created_at) > STUCK_AFTER,
    )


@router.get("", response_model=Page[JobRow])
def list_jobs(
    db: DB,
    q: str | None = None,
    status_: Annotated[str | None, Query(alias="status")] = None,
    paid: bool | None = None,
    user_id: uuid.UUID | None = None,
    days: int | None = None,
    sort: Literal["created_desc", "created_asc", "cost_desc"] = "created_desc",
    limit: int = 50,
    offset: int = 0,
):
    cost = _cost_subq()
    query = (select(DesignJob, User.email, Tree.nickname, Tree.species_key, DesignOption.style_key, cost.c.cost)
             .join(User, User.id == DesignJob.user_id)
             .join(Tree, Tree.id == DesignJob.tree_id)
             .outerjoin(DesignOption, DesignOption.id == DesignJob.chosen_option_id)
             .outerjoin(cost, cost.c.job_id == DesignJob.id))
    if q:
        like = f"%{q.strip().lower()}%"
        query = query.where(or_(func.lower(User.email).like(like), func.lower(Tree.nickname).like(like),
                                cast(DesignJob.id, String).like(like), func.lower(DesignJob.error_code).like(like)))
    if status_ == "active":
        query = query.where(DesignJob.status.in_(ACTIVE))
    elif status_ == "stuck":
        query = query.where(DesignJob.status.in_(ACTIVE),
                            func.coalesce(DesignJob.started_at, DesignJob.created_at) < datetime.now(UTC) - STUCK_AFTER)
    elif status_:
        query = query.where(DesignJob.status == JobStatus(status_))
    if paid is not None:
        query = query.where(DesignJob.chosen_option_id.isnot(None) if paid else DesignJob.chosen_option_id.is_(None))
    if user_id:
        query = query.where(DesignJob.user_id == user_id)
    if days:
        query = query.where(DesignJob.created_at >= datetime.now(UTC) - timedelta(days=days))
    order = {"created_desc": DesignJob.created_at.desc(), "created_asc": DesignJob.created_at.asc(),
             "cost_desc": func.coalesce(cost.c.cost, 0).desc()}[sort]
    rows, total, limit, offset = paginate(db, query.order_by(order), limit, offset)
    return Page(items=[_row(*r) for r in rows], total=total, limit=limit, offset=offset)


# ---------- chi tiết ----------

class OptionOut(BaseModel):
    id: uuid.UUID
    rank: int
    style_key: str
    suitability: float
    chosen: bool
    sketch_svg_url: str | None
    design: dict
    counts: dict | None


class RenderOut(BaseModel):
    id: uuid.UUID
    stage_code: str
    attempt: int
    url: str
    model: str
    selected: bool
    total_score: float | None
    cv_checks: dict | None
    judge: dict | None
    created_at: datetime


class StepOut(BaseModel):
    id: int
    step_code: str
    provider: str
    model: str
    prompt_version: str | None
    tokens_in: int
    tokens_out: int
    images_out: int
    cost_usd: float
    latency_ms: int
    ok: bool
    error: str | None
    output: dict | None
    created_at: datetime


class LedgerOut(BaseModel):
    delta: int
    reason: CreditReason
    ref_id: str | None
    created_at: datetime


class JobDetail(BaseModel):
    job: JobRow
    inputs: dict | None
    progress: dict
    analysis: dict | None
    targets: dict | None
    report: dict | None
    error: str | None
    charge_ref: str | None
    share_code: str | None
    photos: list[dict]
    cutout: dict | None = None  # ảnh đã tách nền + phác họa gửi P1 (bonsai_pipeline/cutout.py)
    s4_prep: dict | None = None  # ảnh ghép bố cục + vùng được vẽ của S4 (bonsai_pipeline/fidelity.py)
    options: list[OptionOut]
    renders: list[RenderOut]
    stages: list[dict]
    steps: list[StepOut]
    feedback: list[dict]
    ledger: list[LedgerOut]
    can_retry: Literal["phase_a", "phase_b"] | None
    can_refund: bool


def _charged_unrefunded(db, job: DesignJob) -> str | None:
    """ref của lần trừ lượt gần nhất chưa được hoàn (nếu có)."""
    refs = [r for (r,) in db.execute(select(CreditLedger.ref_id).where(
        CreditLedger.user_id == job.user_id, CreditLedger.reason == CreditReason.render,
        or_(CreditLedger.ref_id == str(job.id), CreditLedger.ref_id.like(f"{job.id}#%"))))]
    refunded = {r for (r,) in db.execute(select(CreditLedger.ref_id).where(
        CreditLedger.user_id == job.user_id, CreditLedger.reason == CreditReason.refund, CreditLedger.ref_id.in_(refs or [""])))}
    pending = [r for r in refs if r not in refunded]
    return pending[-1] if pending else None


def _retry_kind(job: DesignJob) -> str | None:
    if job.status != JobStatus.failed and not (job.status in ACTIVE and _is_stuck(job)):
        return None
    return "phase_b" if job.chosen_option_id else "phase_a"


def _is_stuck(job: DesignJob) -> bool:
    return datetime.now(UTC) - (job.started_at or job.created_at) > STUCK_AFTER


def _get(db, job_id: uuid.UUID) -> DesignJob:
    job = db.get(DesignJob, job_id)
    if job is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy phiên.")
    return job


@router.get("/{job_id}", response_model=JobDetail)
def job_detail(job_id: uuid.UUID, db: DB):
    job = _get(db, job_id)
    user, tree = db.get(User, job.user_id), db.get(Tree, job.tree_id)
    cost = db.execute(select(func.sum(PipelineStep.cost_usd)).where(PipelineStep.job_id == job.id)).scalar_one()
    chosen = db.get(DesignOption, job.chosen_option_id) if job.chosen_option_id else None
    photos = db.execute(select(TreePhoto).where(TreePhoto.tree_id == job.tree_id, TreePhoto.source == PhotoSource.upload)
                    .order_by(TreePhoto.view_index)).scalars()
    options = db.execute(select(DesignOption).where(DesignOption.job_id == job.id).order_by(DesignOption.rank)).scalars()
    renders = db.execute(select(RenderImage).where(RenderImage.job_id == job.id)
                         .order_by(RenderImage.stage_code.desc(), RenderImage.attempt)).scalars()
    stages = db.execute(select(Stage).where(Stage.job_id == job.id).order_by(Stage.code)).scalars()
    steps = db.execute(select(PipelineStep).where(PipelineStep.job_id == job.id).order_by(PipelineStep.id)).scalars()
    fb = db.execute(select(Feedback).where(Feedback.job_id == job.id)).scalars()
    ledger = db.execute(select(CreditLedger).where(
        CreditLedger.user_id == job.user_id,
        or_(CreditLedger.ref_id == str(job.id), CreditLedger.ref_id.like(f"{job.id}#%"),
            CreditLedger.ref_id.like(f"admin-retry:{job.id}%"))).order_by(CreditLedger.id)).scalars()
    return JobDetail(
        job=_row(job, user.email if user else None, tree.nickname if tree else None, tree.species_key if tree else None,
                 chosen.style_key if chosen else None, cost),
        inputs=job.inputs, progress=job.progress or {}, analysis=job.analysis, targets=job.targets, report=job.report,
        error=job.error, charge_ref=job.charge_ref, share_code=job.share_code,
        photos=[{"id": str(p.id), "url": storage.presign_get(p.storage_key), "is_front": p.id == job.front_photo_id,
                 "width": p.width, "height": p.height} for p in photos],
        cutout=({"image_url": storage.presign_get(c["image_key"]), "sketch_url": storage.presign_get(c["sketch_key"]), "box": c.get("box")}
                if (c := (job.progress or {}).get("cutout")) and c.get("image_key") else None),
        s4_prep=({"collage_url": storage.presign_get(p["collage_key"]), "editable_url": storage.presign_get(p["editable_key"]),
                  "trunk_source": p.get("trunk_source")} if (p := (job.progress or {}).get("s4_prep")) else None),
        options=[OptionOut(id=o.id, rank=o.rank, style_key=o.style_key, suitability=o.suitability,
                           chosen=o.id == job.chosen_option_id, design=o.design, counts=o.sketch_meta,
                           sketch_svg_url=storage.presign_get(o.sketch_svg_key) if o.sketch_svg_key else None)
                 for o in options],
        renders=[RenderOut(id=r.id, stage_code=r.stage_code, attempt=r.attempt, url=storage.presign_get(r.storage_key),
                           model=r.model, selected=r.selected, total_score=r.total_score, cv_checks=r.cv_checks,
                           judge=r.judge, created_at=r.created_at) for r in renders],
        stages=[{"code": s.code, "time_from_start": s.time_from_start, "plan": s.plan, "guide_vi": s.guide_vi,
                 "image_id": str(s.image_id) if s.image_id else None} for s in stages],
        steps=[StepOut(id=s.id, step_code=s.step_code, provider=s.provider, model=s.model, prompt_version=s.prompt_version,
                       tokens_in=s.tokens_in, tokens_out=s.tokens_out, images_out=s.images_out,
                       cost_usd=round(float(s.cost_usd), 6), latency_ms=s.latency_ms, ok=s.ok, error=s.error,
                       output=s.output, created_at=s.created_at) for s in steps],
        feedback=[{"rating": f.rating, "reason_tags": f.reason_tags, "comment": f.comment, "created_at": f.created_at}
                  for f in fb],
        ledger=[LedgerOut(delta=e.delta, reason=e.reason, ref_id=e.ref_id, created_at=e.created_at) for e in ledger],
        can_retry=_retry_kind(job),
        can_refund=job.status == JobStatus.failed and _charged_unrefunded(db, job) is not None,
    )


# ---------- thao tác ----------

class ActionIn(BaseModel):
    note: str | None = Field(default=None, max_length=300)


@router.post("/{job_id}/retry", response_model=JobDetail)
def retry(job_id: uuid.UUID, body: ActionIn, db: DB, admin: Admin):
    """Chạy lại phiên lỗi / bị treo. Phiên B: tặng 1 lượt rồi trừ lại → người dùng không mất lượt."""
    job = db.execute(select(DesignJob).where(DesignJob.id == job_id).with_for_update()).scalar_one_or_none()
    if job is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy phiên.")
    kind = _retry_kind(job)
    if kind is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Chỉ chạy lại được phiên lỗi hoặc bị treo.")
    if job.status != JobStatus.failed and (pending := _charged_unrefunded(db, job)):  # treo: hoàn lượt lần trước
        refund_render(db, job.user_id, job.id, pending)
    job.error = job.error_code = None
    job.finished_at = None
    if kind == "phase_a":
        job.status = JobStatus.queued
        job.started_at = None
        task, q = "bonsai_worker.tasks.phase_a.run", None
    else:
        ref = next_charge_ref(db, job.user_id, job.id)
        apply_credit(db, job.user_id, 1, CreditReason.gift, f"admin-retry:{ref}")
        spend_for_render(db, job.user_id, job.id, ref)
        job.charge_ref = ref
        job.status = JobStatus.rendering_final
        task, q = "bonsai_worker.tasks.phase_b.run", "render"
    audit(db, admin, "job.retry", "job", job.id, kind=kind, note=body.note)
    db.commit()
    queue.enqueue(task, str(job.id), queue=q)
    return job_detail(job_id, db)


@router.post("/{job_id}/fail", response_model=JobDetail)
def mark_failed(job_id: uuid.UUID, body: ActionIn, db: DB, admin: Admin):
    """Phiên treo (worker chết, mất task): đánh dấu lỗi và hoàn lượt nếu đã trừ."""
    job = db.execute(select(DesignJob).where(DesignJob.id == job_id).with_for_update()).scalar_one()
    if job.status not in ACTIVE:
        raise HTTPException(status.HTTP_409_CONFLICT, "Phiên không còn đang chạy.")
    job.status, job.error_code, job.error = JobStatus.failed, "admin_stopped", body.note or "Dừng bởi quản trị viên"
    job.finished_at = datetime.now(UTC)
    refunded = False
    if pending := _charged_unrefunded(db, job):
        refunded = refund_render(db, job.user_id, job.id, pending)
    audit(db, admin, "job.fail", "job", job.id, refunded=refunded, note=body.note)
    db.commit()
    return job_detail(job_id, db)


@router.post("/{job_id}/refund", response_model=JobDetail)
def refund(job_id: uuid.UUID, body: ActionIn, db: DB, admin: Admin):
    job = _get(db, job_id)
    pending = _charged_unrefunded(db, job) if job.status == JobStatus.failed else None
    if pending is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Không có lượt nào cần hoàn cho phiên này.")
    refund_render(db, job.user_id, job.id, pending)
    audit(db, admin, "job.refund", "job", job.id, ref=pending, note=body.note)
    db.commit()
    return job_detail(job_id, db)
