"""/admin/system, /admin/audit, /admin/catalog — sức khỏe hệ thống, nhật ký quản trị, danh mục loài & thế."""

import json
import logging
from datetime import UTC, datetime, timedelta
from typing import Annotated

import redis
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import Integer, cast, func, select

from ..db.models import AdminAudit, DesignJob, JobStatus, PipelineStep, Species, Style, User
from ..queue import _celery
from ..security import DB, require_admin
from ..services.audit import audit
from ..services.ops import get_ops, get_packages, package_active
from ..services.settings import get_all
from ..settings import get_settings
from .admin_common import Page, paginate
from .admin_jobs import ACTIVE, STUCK_AFTER

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_admin)])
Admin = Annotated[User, Depends(require_admin)]
log = logging.getLogger(__name__)

QUEUES = ("celery", "render")
WORKER_INFO_KEY = "bonsai:worker:info"  # worker ghi (bonsai_worker/seg_status.py)
MONITOR_KEY = "bonsai:monitoring:last"  # worker ghi sau mỗi lần kiểm tra (tasks/monitoring.py)


def _redis() -> redis.Redis:
    return redis.Redis.from_url(get_settings().redis_url, socket_timeout=1, socket_connect_timeout=1)


class ErrorCount(BaseModel):
    error_code: str
    count: int


class SystemOut(BaseModel):
    checked_at: datetime
    redis_ok: bool
    queues: dict[str, int]
    workers: list[str]
    worker_info: dict | None
    monitoring: dict | None
    active_jobs: dict[str, int]
    stuck_jobs: int
    jobs_24h: int
    failed_24h: int
    top_errors_24h: list[ErrorCount]
    slow_steps_24h: list[dict]
    config: dict


@router.get("/system", response_model=SystemOut)
def system(db: DB):
    s = get_settings()
    queues: dict[str, int] = {}
    worker_info = monitoring = None
    redis_ok = True
    try:
        r = _redis()
        queues = {q: int(r.llen(q)) for q in QUEUES}
        worker_info = json.loads(raw) if (raw := r.get(WORKER_INFO_KEY)) else None
        monitoring = json.loads(raw) if (raw := r.get(MONITOR_KEY)) else None
    except redis.RedisError:
        redis_ok = False
    workers: list[str] = []
    try:
        workers = sorted(name for reply in (_celery().control.ping(timeout=1.0) or []) for name in reply)
    except Exception:  # broker lỗi → để trống, trang hiện "không có worker"
        log.warning("celery ping failed", exc_info=True)

    now = datetime.now(UTC)
    active = {st.value: n for st, n in db.execute(
        select(DesignJob.status, func.count()).where(DesignJob.status.in_(ACTIVE)).group_by(DesignJob.status))}
    stuck = db.execute(select(func.count()).select_from(DesignJob).where(
        DesignJob.status.in_(ACTIVE), func.coalesce(DesignJob.started_at, DesignJob.created_at) < now - STUCK_AFTER)).scalar_one()
    day = now - timedelta(hours=24)
    n24, f24 = db.execute(select(func.count(), func.sum(cast(DesignJob.status == JobStatus.failed, Integer)))
                          .where(DesignJob.created_at >= day)).one()
    errors = db.execute(select(DesignJob.error_code, func.count()).where(
        DesignJob.created_at >= day, DesignJob.status == JobStatus.failed).group_by(DesignJob.error_code)
        .order_by(func.count().desc()).limit(8)).all()
    slow = db.execute(select(PipelineStep.step_code, func.count(), func.avg(PipelineStep.latency_ms),
                             func.percentile_cont(0.95).within_group(PipelineStep.latency_ms),
                             func.avg(cast(~PipelineStep.ok, Integer)))
                      .where(PipelineStep.created_at >= day).group_by(PipelineStep.step_code)
                      .order_by(func.avg(PipelineStep.latency_ms).desc()).limit(12)).all()
    return SystemOut(
        checked_at=now, redis_ok=redis_ok, queues=queues, workers=workers, worker_info=worker_info, monitoring=monitoring,
        active_jobs=active, stuck_jobs=stuck, jobs_24h=n24 or 0, failed_24h=int(f24 or 0),
        top_errors_24h=[ErrorCount(error_code=c or "unknown", count=n) for c, n in errors],
        slow_steps_24h=[{"step_code": c, "calls": n, "avg_ms": int(a or 0), "p95_ms": int(p or 0),
                         "fail_rate": round(float(f or 0), 3)} for c, n, a, p, f in slow],
        config={
            "app_env": s.app_env,
            "modes": get_all(db),
            "usd_vnd_rate": int(get_ops(db)["usd_vnd_rate"]),
            "packages": [{"code": p.code, "name": p.name_vi, "credits": p.credits, "price_vnd": p.amount_vnd,
                          "active": package_active(db, p.code)} for p in get_packages(db, include_inactive=True)],
            "bank_configured": bool(s.bank_account),
            "webhooks": {"sepay": bool(s.sepay_api_key), "casso": bool(s.casso_secure_token)},
            "login": {"google": bool(s.google_client_id), "zalo": bool(s.zalo_app_id)},
            "sentry": bool(s.sentry_dsn),
        },
    )


# ---------- nhật ký quản trị ----------

class AuditRow(BaseModel):
    id: int
    created_at: datetime
    admin_email: str | None
    action: str
    target_type: str | None
    target_id: str | None
    detail: dict | None


@router.get("/audit", response_model=Page[AuditRow])
def audit_log(db: DB, action: str | None = None, admin: str | None = None, target_id: str | None = None,
              limit: int = 50, offset: int = 0):
    q = select(AdminAudit)
    if action:
        q = q.where(AdminAudit.action.like(f"{action}%"))
    if admin:
        q = q.where(func.lower(AdminAudit.admin_email) == admin.lower())
    if target_id:
        q = q.where(AdminAudit.target_id == target_id)
    rows, total, limit, offset = paginate(db, q.order_by(AdminAudit.id.desc()), limit, offset)
    return Page(items=[AuditRow(id=a.id, created_at=a.created_at, admin_email=a.admin_email, action=a.action,
                                target_type=a.target_type, target_id=a.target_id, detail=a.detail) for (a,) in rows],
                total=total, limit=limit, offset=offset)


# ---------- danh mục loài & thế ----------

class SpeciesOut(BaseModel):
    key: str
    name_vi: str
    growth_speed: str
    prompt_desc_en: str
    refs: int
    trees: int
    admin_edited_at: datetime | None


class StyleOut(BaseModel):
    key: str
    name_vi: str
    name_jp: str | None
    prompt_desc_en: str
    chosen: int
    admin_edited_at: datetime | None


class CatalogOut(BaseModel):
    species: list[SpeciesOut]
    styles: list[StyleOut]


@router.get("/catalog", response_model=CatalogOut)
def catalog(db: DB):
    from ..db.models import DesignOption, Tree

    trees = dict(db.execute(select(Tree.species_key, func.count()).group_by(Tree.species_key)).all())
    chosen = dict(db.execute(select(DesignOption.style_key, func.count()).join(
        DesignJob, DesignJob.chosen_option_id == DesignOption.id).group_by(DesignOption.style_key)).all())
    return CatalogOut(
        species=[SpeciesOut(key=s.key, name_vi=s.name_vi, growth_speed=s.growth_speed, prompt_desc_en=s.prompt_desc_en,
                            refs=len(s.ref_image_keys or []), trees=trees.get(s.key, 0), admin_edited_at=s.admin_edited_at)
                 for s in db.execute(select(Species).order_by(Species.name_vi)).scalars()],
        styles=[StyleOut(key=s.key, name_vi=s.name_vi, name_jp=s.name_jp, prompt_desc_en=s.prompt_desc_en,
                         chosen=chosen.get(s.key, 0), admin_edited_at=s.admin_edited_at)
                for s in db.execute(select(Style).order_by(Style.name_vi)).scalars()],
    )


class SpeciesIn(BaseModel):
    name_vi: str = Field(min_length=1, max_length=100)
    growth_speed: str = Field(pattern="^(slow|medium|fast)$")
    prompt_desc_en: str = Field(min_length=10, max_length=600)


class StyleIn(BaseModel):
    name_vi: str = Field(min_length=1, max_length=100)
    name_jp: str | None = Field(default=None, max_length=100)
    prompt_desc_en: str = Field(min_length=10, max_length=600)


@router.put("/catalog/species/{key}", response_model=CatalogOut)
def update_species(key: str, body: SpeciesIn, db: DB, admin: Admin):
    sp = db.get(Species, key)
    if sp is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Loài không tồn tại.")
    before = {"name_vi": sp.name_vi, "growth_speed": sp.growth_speed, "prompt_desc_en": sp.prompt_desc_en}
    sp.name_vi, sp.growth_speed, sp.prompt_desc_en = body.name_vi, body.growth_speed, body.prompt_desc_en
    sp.admin_edited_at = datetime.now(UTC)
    audit(db, admin, "catalog.species", "species", key, before=before, after=body.model_dump())
    db.commit()
    return catalog(db)


@router.put("/catalog/styles/{key}", response_model=CatalogOut)
def update_style(key: str, body: StyleIn, db: DB, admin: Admin):
    st = db.get(Style, key)
    if st is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Thế không tồn tại.")
    before = {"name_vi": st.name_vi, "name_jp": st.name_jp, "prompt_desc_en": st.prompt_desc_en}
    st.name_vi, st.name_jp, st.prompt_desc_en = body.name_vi, body.name_jp, body.prompt_desc_en
    st.admin_edited_at = datetime.now(UTC)
    audit(db, admin, "catalog.style", "style", key, before=before, after=body.model_dump())
    db.commit()
    return catalog(db)

