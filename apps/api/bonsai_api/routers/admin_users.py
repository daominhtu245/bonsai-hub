"""/admin/users — quản lý người dùng: tìm kiếm, lọc, hồ sơ chi tiết (thống kê, sổ lượt, thanh toán, phiên, nhật ký),
đổi vai trò, cộng/trừ lượt có lý do, khóa (xóa mềm) / mở khóa, tặng lượt hàng loạt.
"""

import uuid
from datetime import UTC, datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select

from ..db.models import (
    AdminAudit, AuthProvider, CreditLedger, CreditReason, DesignJob, JobStatus, Payment, PaymentStatus, PipelineStep,
    PushSubscription, Tree, User, UserRole,
)
from ..security import DB, require_admin
from ..services.audit import audit
from ..services.credits import InsufficientCredits, apply_credit
from .admin_common import Page, paginate

router = APIRouter(prefix="/admin/users", tags=["admin"], dependencies=[Depends(require_admin)])
Admin = Annotated[User, Depends(require_admin)]


class UserRow(BaseModel):
    id: uuid.UUID
    email: str | None
    name: str | None
    phone: str | None
    garden_name: str | None
    auth_provider: AuthProvider
    role: UserRole
    credits: int
    consent_training: bool
    deleted: bool
    created_at: datetime
    trees: int
    jobs: int
    paid_jobs: int
    revenue_vnd: int
    last_active_at: datetime | None


def _stats_subqueries():
    trees = select(Tree.user_id, func.count().label("n")).group_by(Tree.user_id).subquery()
    jobs = (select(DesignJob.user_id, func.count().label("n"), func.count(DesignJob.chosen_option_id).label("paid"),
                   func.max(DesignJob.created_at).label("last")).group_by(DesignJob.user_id).subquery())
    pay = (select(Payment.user_id, func.sum(Payment.amount_vnd).label("vnd"))
           .where(Payment.status == PaymentStatus.paid).group_by(Payment.user_id).subquery())
    return trees, jobs, pay


def _row(u: User, trees, jobs, paid, last, vnd) -> UserRow:
    return UserRow(
        id=u.id, email=u.email, name=u.name, phone=u.phone, garden_name=u.garden_name, auth_provider=u.auth_provider,
        role=u.role, credits=u.credits, consent_training=u.consent_training, deleted=u.deleted_at is not None,
        created_at=u.created_at, trees=trees or 0, jobs=jobs or 0, paid_jobs=paid or 0, revenue_vnd=int(vnd or 0),
        last_active_at=last,
    )


@router.get("", response_model=Page[UserRow])
def list_users(
    db: DB,
    q: str | None = None,
    role: UserRole | None = None,
    state: Literal["active", "deleted", "all"] = "active",
    consent: bool | None = None,
    paying: bool | None = None,
    sort: Literal["created_desc", "active_desc", "revenue_desc", "credits_desc"] = "created_desc",
    limit: int = 50,
    offset: int = 0,
):
    trees, jobs, pay = _stats_subqueries()
    query = (select(User, trees.c.n, jobs.c.n, jobs.c.paid, jobs.c.last, pay.c.vnd)
             .outerjoin(trees, trees.c.user_id == User.id)
             .outerjoin(jobs, jobs.c.user_id == User.id)
             .outerjoin(pay, pay.c.user_id == User.id))
    if q:
        like = f"%{q.strip().lower()}%"
        query = query.where(or_(func.lower(User.email).like(like), func.lower(User.name).like(like),
                                User.phone.like(like), func.lower(User.garden_name).like(like)))
    if role:
        query = query.where(User.role == role)
    if state == "active":
        query = query.where(User.deleted_at.is_(None))
    elif state == "deleted":
        query = query.where(User.deleted_at.isnot(None))
    if consent is not None:
        query = query.where(User.consent_training.is_(consent))
    if paying is not None:
        query = query.where(pay.c.vnd.isnot(None) if paying else pay.c.vnd.is_(None))
    order = {"created_desc": User.created_at.desc(), "active_desc": jobs.c.last.desc().nulls_last(),
             "revenue_desc": func.coalesce(pay.c.vnd, 0).desc(), "credits_desc": User.credits.desc()}[sort]
    rows, total, limit, offset = paginate(db, query.order_by(order), limit, offset)
    return Page(items=[_row(*r) for r in rows], total=total, limit=limit, offset=offset)


class LedgerRow(BaseModel):
    id: int
    delta: int
    reason: CreditReason
    ref_id: str | None
    created_at: datetime


class PaymentRow(BaseModel):
    id: uuid.UUID
    package_code: str
    amount_vnd: int
    status: PaymentStatus
    transfer_code: str
    created_at: datetime
    paid_at: datetime | None


class UserJob(BaseModel):
    id: uuid.UUID
    created_at: datetime
    status: JobStatus
    tree_nickname: str | None
    paid: bool
    cost_usd: float


class AuditRow(BaseModel):
    id: int
    admin_email: str | None
    action: str
    detail: dict | None
    created_at: datetime


class UserDetail(BaseModel):
    user: UserRow
    consent_at: datetime | None
    deleted_at: datetime | None
    notify_zalo: bool
    push_devices: int
    ai_cost_usd: float
    ledger: list[LedgerRow]
    ledger_balance: int
    payments: list[PaymentRow]
    jobs: list[UserJob]
    audit: list[AuditRow]


def _get(db, user_id: uuid.UUID) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy người dùng.")
    return user


@router.get("/{user_id}", response_model=UserDetail)
def user_detail(user_id: uuid.UUID, db: DB):
    u = _get(db, user_id)
    trees, jobs, pay = _stats_subqueries()
    stats = db.execute(select(trees.c.n, jobs.c.n, jobs.c.paid, jobs.c.last, pay.c.vnd)
                       .select_from(User).outerjoin(trees, trees.c.user_id == User.id)
                       .outerjoin(jobs, jobs.c.user_id == User.id).outerjoin(pay, pay.c.user_id == User.id)
                       .where(User.id == u.id)).one()
    ledger = db.execute(select(CreditLedger).where(CreditLedger.user_id == u.id).order_by(CreditLedger.id.desc()).limit(200)).scalars().all()
    balance = db.execute(select(func.coalesce(func.sum(CreditLedger.delta), 0)).where(CreditLedger.user_id == u.id)).scalar_one()
    payments = db.execute(select(Payment).where(Payment.user_id == u.id).order_by(Payment.created_at.desc()).limit(100)).scalars()
    cost = (select(PipelineStep.job_id, func.sum(PipelineStep.cost_usd).label("c")).group_by(PipelineStep.job_id).subquery())
    job_rows = db.execute(select(DesignJob, Tree.nickname, cost.c.c).join(Tree, Tree.id == DesignJob.tree_id)
                          .outerjoin(cost, cost.c.job_id == DesignJob.id)
                          .where(DesignJob.user_id == u.id).order_by(DesignJob.created_at.desc()).limit(100)).all()
    total_cost = db.execute(select(func.coalesce(func.sum(PipelineStep.cost_usd), 0)).join(DesignJob, DesignJob.id == PipelineStep.job_id)
                            .where(DesignJob.user_id == u.id)).scalar_one()
    audits = db.execute(select(AdminAudit).where(AdminAudit.target_type == "user", AdminAudit.target_id == str(u.id))
                        .order_by(AdminAudit.id.desc()).limit(50)).scalars()
    devices = db.execute(select(func.count()).select_from(PushSubscription).where(PushSubscription.user_id == u.id)).scalar_one()
    return UserDetail(
        user=_row(u, *stats), consent_at=u.consent_at, deleted_at=u.deleted_at, notify_zalo=u.notify_zalo,
        push_devices=devices, ai_cost_usd=round(float(total_cost), 4),
        ledger=[LedgerRow(id=e.id, delta=e.delta, reason=e.reason, ref_id=e.ref_id, created_at=e.created_at) for e in ledger],
        ledger_balance=balance,
        payments=[PaymentRow(id=p.id, package_code=p.package_code, amount_vnd=p.amount_vnd, status=p.status,
                             transfer_code=p.transfer_code, created_at=p.created_at, paid_at=p.paid_at) for p in payments],
        jobs=[UserJob(id=j.id, created_at=j.created_at, status=j.status, tree_nickname=n, paid=j.chosen_option_id is not None,
                      cost_usd=round(float(c or 0), 4)) for j, n, c in job_rows],
        audit=[AuditRow(id=a.id, admin_email=a.admin_email, action=a.action, detail=a.detail, created_at=a.created_at) for a in audits],
    )


class RoleIn(BaseModel):
    role: UserRole


@router.put("/{user_id}/role", response_model=UserDetail)
def set_role(user_id: uuid.UUID, body: RoleIn, db: DB, admin: Admin):
    u = _get(db, user_id)
    if u.id == admin.id and body.role != UserRole.admin:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Không tự bỏ quyền quản trị của chính mình.")
    old = u.role
    u.role = body.role
    audit(db, admin, "user.role", "user", u.id, old=old.value, new=body.role.value)
    db.commit()
    return user_detail(user_id, db)


class CreditsIn(BaseModel):
    delta: int = Field(ge=-1000, le=1000)
    note: str = Field(min_length=3, max_length=300)


@router.post("/{user_id}/credits", response_model=UserDetail)
def adjust_credits(user_id: uuid.UUID, body: CreditsIn, db: DB, admin: Admin):
    """Cộng/trừ lượt tay (vd. bù lỗi, sửa nhầm). Ghi sổ lượt lý do `adjust` + nhật ký kèm ghi chú."""
    u = _get(db, user_id)
    if body.delta == 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Số lượt phải khác 0.")
    try:
        apply_credit(db, u.id, body.delta, CreditReason.adjust, f"adm:{uuid.uuid4().hex[:20]}")
    except InsufficientCredits:
        db.rollback()
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Người dùng chỉ còn {u.credits} lượt.")
    audit(db, admin, "user.credits", "user", u.id, delta=body.delta, note=body.note)
    db.commit()
    return user_detail(user_id, db)


class LockIn(BaseModel):
    locked: bool
    note: str | None = Field(default=None, max_length=300)


@router.put("/{user_id}/lock", response_model=UserDetail)
def lock(user_id: uuid.UUID, body: LockIn, db: DB, admin: Admin):
    """Khóa = xóa mềm (giữ dữ liệu, không đăng nhập được, ẩn trang chia sẻ). Mở khóa = khôi phục."""
    u = _get(db, user_id)
    if u.id == admin.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Không tự khóa tài khoản của mình.")
    if body.locked:
        u.deleted_at = u.deleted_at or datetime.now(UTC)
        u.notify_zalo = False
        db.query(PushSubscription).filter(PushSubscription.user_id == u.id).delete()
    else:
        u.deleted_at = None
    audit(db, admin, "user.lock" if body.locked else "user.unlock", "user", u.id, note=body.note)
    db.commit()
    return user_detail(user_id, db)


class BulkGiftIn(BaseModel):
    emails: list[str] = Field(min_length=1, max_length=500)
    credits: int = Field(ge=1, le=100)
    batch: str = Field(min_length=1, max_length=40, pattern=r"^[a-zA-Z0-9_-]+$")


class BulkGiftOut(BaseModel):
    credited: list[str]
    already: list[str]
    not_found: list[str]


@router.post("/gift", response_model=BulkGiftOut)
def bulk_gift(body: BulkGiftIn, db: DB, admin: Admin):
    """Tặng lượt cho nhiều email (mời dùng thử). Mỗi người 1 lần mỗi đợt (`batch`)."""
    out = BulkGiftOut(credited=[], already=[], not_found=[])
    for raw in dict.fromkeys(e.strip().lower() for e in body.emails if e.strip()):
        user = db.execute(select(User).where(func.lower(User.email) == raw)).scalar_one_or_none()
        if user is None:
            out.not_found.append(raw)
        elif apply_credit(db, user.id, body.credits, CreditReason.gift, f"batch:{body.batch}"):
            out.credited.append(raw)
        else:
            out.already.append(raw)
    audit(db, admin, "credits.bulk_gift", "batch", body.batch, credits=body.credits, credited=len(out.credited),
          already=len(out.already), not_found=len(out.not_found))
    db.commit()
    return out
