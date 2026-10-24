"""/admin/dashboard — số liệu tổng quan: người dùng, phiên, chuyển đổi, doanh thu, chi phí AI, lỗi, thời gian xử lý.

Mọi chỉ số tính cho khoảng `days` ngày gần nhất và khoảng liền trước (để so sánh).
"""

import statistics
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import Integer, cast, func, literal_column, select

from ..db.models import DesignJob, Feedback, JobStatus, Payment, PaymentStatus, PipelineStep, User
from ..security import DB, require_admin
from ..services.ops import get_ops

router = APIRouter(prefix="/admin/dashboard", tags=["admin"], dependencies=[Depends(require_admin)])

VN_TZ = ZoneInfo("Asia/Ho_Chi_Minh")
PHASE_B_STEPS = ("P3a", "P3c", "P4cv", "P4", "P2b", "P3d", "P6", "P5")
_A_OK = (JobStatus.awaiting_choice, JobStatus.rendering_final, JobStatus.judging, JobStatus.rendering_stages,
         JobStatus.writing_guide, JobStatus.done)


class Kpi(BaseModel):
    value: float
    previous: float


class DayRow(BaseModel):
    day: str
    users: int
    jobs_a: int
    jobs_paid: int
    jobs_failed: int
    revenue_vnd: int
    ai_cost_vnd: int


class Funnel(BaseModel):
    users: int
    analysed: int
    chose: int
    done: int
    shared: int


class DashboardOut(BaseModel):
    days: int
    usd_vnd_rate: int
    kpis: dict[str, Kpi]
    series: list[DayRow]
    funnel: Funnel
    median_phase_a_s: float | None
    median_phase_b_s: float | None


def _period(db, start: datetime, end: datetime | None, rate: int) -> dict[str, float]:
    """end=None: tới hiện tại (không chặn trên — đồng hồ DB có thể lệch vài giây so với api)."""

    def within(col):
        return (col >= start) & (col < end) if end is not None else col >= start

    jobs = select(DesignJob).where(within(DesignJob.created_at)).subquery()
    n_jobs, n_a_ok, n_paid, n_done, n_failed = db.execute(select(
        func.count(),
        func.sum(cast(jobs.c.status.in_([s.value for s in _A_OK]), Integer)),
        func.count(jobs.c.chosen_option_id),
        func.sum(cast(jobs.c.status == JobStatus.done.value, Integer)),
        func.sum(cast(jobs.c.status == JobStatus.failed.value, Integer)),
    ).select_from(jobs)).one()
    users = db.execute(select(func.count()).select_from(User).where(within(User.created_at))).scalar_one()
    revenue = db.execute(select(func.coalesce(func.sum(Payment.amount_vnd), 0)).where(
        Payment.status == PaymentStatus.paid, within(Payment.paid_at))).scalar_one()
    cost = float(db.execute(select(func.coalesce(func.sum(PipelineStep.cost_usd), 0)).where(
        within(PipelineStep.created_at))).scalar_one())
    fb = db.execute(select(func.count(), func.sum(cast(Feedback.rating == 1, Integer))).where(
        within(Feedback.created_at))).one()
    n_paid = n_paid or 0
    return {
        "users_new": users,
        "jobs_a": n_jobs or 0,
        "jobs_paid": n_paid,
        "jobs_done": n_done or 0,
        "conversion": round(n_paid / n_a_ok, 4) if n_a_ok else 0.0,
        "fail_rate": round((n_failed or 0) / n_jobs, 4) if n_jobs else 0.0,
        "revenue_vnd": int(revenue),
        "ai_cost_vnd": round(cost * rate),
        "gross_margin_vnd": int(revenue) - round(cost * rate),
        "ai_cost_per_paid_vnd": round(cost * rate / n_paid) if n_paid else 0,
        "feedback_positive": round((fb[1] or 0) / fb[0], 4) if fb[0] else 0.0,
    }


def _durations(db, start: datetime) -> tuple[float | None, float | None]:
    a = [(f - s).total_seconds() for s, f in db.execute(
        select(DesignJob.started_at, DesignJob.finished_at).where(
            DesignJob.created_at >= start, DesignJob.status == JobStatus.awaiting_choice,
            DesignJob.started_at.isnot(None), DesignJob.finished_at.isnot(None)))]
    # Phiên B: từ lúc bước B đầu tiên bắt đầu (created_at − latency) tới bước B cuối cùng xong.
    rows = db.execute(
        select(PipelineStep.job_id, func.min(PipelineStep.created_at - func.make_interval(0, 0, 0, 0, 0, 0, PipelineStep.latency_ms / 1000.0)),
               func.max(PipelineStep.created_at))
        .join(DesignJob, DesignJob.id == PipelineStep.job_id)
        .where(DesignJob.status == JobStatus.done, PipelineStep.created_at >= start, PipelineStep.step_code.in_(PHASE_B_STEPS))
        .group_by(PipelineStep.job_id)).all()
    b = [(last - first).total_seconds() for _, first, last in rows]
    return (round(statistics.median(a), 1) if a else None, round(statistics.median(b), 1) if b else None)


@router.get("", response_model=DashboardOut)
def dashboard(db: DB, days: int = 30):
    days = max(1, min(days, 365))
    rate = int(get_ops(db)["usd_vnd_rate"])
    now = datetime.now(UTC)
    start, prev_start = now - timedelta(days=days), now - timedelta(days=2 * days)
    cur, prev = _period(db, start, None, rate), _period(db, prev_start, start, rate)

    by_day: dict[str, DayRow] = {}
    today = now.astimezone(VN_TZ).date()
    for i in range(days - 1, -1, -1):
        d = (today - timedelta(days=i)).isoformat()
        by_day[d] = DayRow(day=d, users=0, jobs_a=0, jobs_paid=0, jobs_failed=0, revenue_vnd=0, ai_cost_vnd=0)

    def day_of(col):
        # Ngày theo giờ Việt Nam; literal (không bind) để GROUP BY khớp biểu thức SELECT.
        return func.date(func.timezone(literal_column("'Asia/Ho_Chi_Minh'"), col))

    for d, n in db.execute(select(day_of(User.created_at), func.count()).where(User.created_at >= start)
                           .group_by(day_of(User.created_at))):
        if (d := d.isoformat() if d else None) in by_day:
            by_day[d].users = n
    for d, n, paid, failed in db.execute(select(
            day_of(DesignJob.created_at), func.count(), func.count(DesignJob.chosen_option_id),
            func.sum(cast(DesignJob.status == JobStatus.failed, Integer))).where(DesignJob.created_at >= start)
            .group_by(day_of(DesignJob.created_at))):
        if (d := d.isoformat() if d else None) in by_day:
            by_day[d].jobs_a, by_day[d].jobs_paid, by_day[d].jobs_failed = n, paid, int(failed or 0)
    for d, v in db.execute(select(day_of(Payment.paid_at), func.sum(Payment.amount_vnd)).where(
            Payment.status == PaymentStatus.paid, Payment.paid_at >= start).group_by(day_of(Payment.paid_at))):
        if (d := d.isoformat() if d else None) in by_day:
            by_day[d].revenue_vnd = int(v or 0)
    for d, c in db.execute(select(day_of(PipelineStep.created_at), func.sum(PipelineStep.cost_usd)).where(
            PipelineStep.created_at >= start).group_by(day_of(PipelineStep.created_at))):
        if (d := d.isoformat() if d else None) in by_day:
            by_day[d].ai_cost_vnd = round(float(c or 0) * rate)

    jobs = select(DesignJob).where(DesignJob.created_at >= start).subquery()
    analysed, chose, done, shared = db.execute(select(
        func.count(func.distinct(jobs.c.user_id)).filter(jobs.c.status.in_([s.value for s in _A_OK])),
        func.count(func.distinct(jobs.c.user_id)).filter(jobs.c.chosen_option_id.isnot(None)),
        func.count(func.distinct(jobs.c.user_id)).filter(jobs.c.status == JobStatus.done.value),
        func.count(func.distinct(jobs.c.user_id)).filter(jobs.c.share_code.isnot(None)),
    ).select_from(jobs)).one()
    active_users = db.execute(select(func.count(func.distinct(DesignJob.user_id))).where(DesignJob.created_at >= start)).scalar_one()

    med_a, med_b = _durations(db, start)
    return DashboardOut(
        days=days, usd_vnd_rate=rate,
        kpis={k: Kpi(value=cur[k], previous=prev[k]) for k in cur},
        series=list(by_day.values()),
        funnel=Funnel(users=active_users, analysed=analysed, chose=chose, done=done, shared=shared),
        median_phase_a_s=med_a, median_phase_b_s=med_b,
    )
