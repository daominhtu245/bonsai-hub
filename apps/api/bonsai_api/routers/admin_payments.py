"""/admin/payments — đối soát thanh toán chuyển khoản: danh sách lọc, tổng doanh thu theo gói, chi tiết (dữ liệu
webhook gốc), xác nhận tay (khách chuyển khoản sai nội dung / webhook không tới) và hủy đơn chờ.
"""

import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select

from ..db.models import CreditReason, Payment, PaymentStatus, User, UserRole
from ..security import DB, require_admin
from ..services.audit import audit
from ..services.credits import apply_credit
from ..services.payments import PACKAGE_BY_CODE
from .admin_common import Page, paginate

router = APIRouter(prefix="/admin/payments", tags=["admin"], dependencies=[Depends(require_admin)])
Admin = Annotated[User, Depends(require_admin)]


class PaymentRow(BaseModel):
    id: uuid.UUID
    created_at: datetime
    paid_at: datetime | None
    user_id: uuid.UUID
    user_email: str | None
    package_code: str
    package_name: str
    credits: int
    amount_vnd: int
    transfer_code: str
    status: PaymentStatus
    provider: str | None
    provider_txn_id: str | None
    underpaid_vnd: int | None


class PackageSum(BaseModel):
    package_code: str
    package_name: str
    orders: int
    revenue_vnd: int


class PaymentPage(Page[PaymentRow]):
    revenue_vnd: int
    by_package: list[PackageSum]
    pending: int


def _row(p: Payment, email: str | None) -> PaymentRow:
    pkg = PACKAGE_BY_CODE.get(p.package_code)
    under = (p.raw or {}).get("received") if p.status != PaymentStatus.paid else None
    return PaymentRow(
        id=p.id, created_at=p.created_at, paid_at=p.paid_at, user_id=p.user_id, user_email=email,
        package_code=p.package_code, package_name=pkg.name_vi if pkg else p.package_code, credits=pkg.credits if pkg else 0,
        amount_vnd=p.amount_vnd, transfer_code=p.transfer_code, status=p.status, provider=p.provider,
        provider_txn_id=p.provider_txn_id, underpaid_vnd=int(under) if under is not None else None,
    )


@router.get("", response_model=PaymentPage)
def list_payments(
    db: DB,
    q: str | None = None,
    status_: Annotated[PaymentStatus | None, Query(alias="status")] = None,
    provider: str | None = None,
    days: int = 30,
    limit: int = 50,
    offset: int = 0,
):
    start = datetime.now(UTC) - timedelta(days=max(1, min(days, 365)))
    query = select(Payment, User.email).join(User, User.id == Payment.user_id).where(Payment.created_at >= start)
    if q:
        like = f"%{q.strip().lower()}%"
        query = query.where(or_(func.lower(User.email).like(like), func.lower(Payment.transfer_code).like(like),
                                func.lower(Payment.provider_txn_id).like(like)))
    if status_:
        query = query.where(Payment.status == status_)
    if provider:
        query = query.where(Payment.provider == provider)
    rows, total, limit, offset = paginate(db, query.order_by(Payment.created_at.desc()), limit, offset)
    sums = db.execute(select(Payment.package_code, func.count(), func.sum(Payment.amount_vnd))
                      .where(Payment.status == PaymentStatus.paid, Payment.paid_at >= start)
                      .group_by(Payment.package_code)).all()
    pending = db.execute(select(func.count()).select_from(Payment).where(Payment.status == PaymentStatus.pending)).scalar_one()
    by_pkg = [PackageSum(package_code=c, package_name=PACKAGE_BY_CODE[c].name_vi if c in PACKAGE_BY_CODE else c,
                         orders=n, revenue_vnd=int(v or 0)) for c, n, v in sums]
    return PaymentPage(items=[_row(p, e) for p, e in rows], total=total, limit=limit, offset=offset,
                       revenue_vnd=sum(p.revenue_vnd for p in by_pkg), by_package=by_pkg, pending=pending)


class PaymentDetail(BaseModel):
    payment: PaymentRow
    raw: dict | None


def _get(db, payment_id: uuid.UUID) -> Payment:
    p = db.execute(select(Payment).where(Payment.id == payment_id).with_for_update()).scalar_one_or_none()
    if p is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy thanh toán.")
    return p


@router.get("/{payment_id}", response_model=PaymentDetail)
def payment_detail(payment_id: uuid.UUID, db: DB):
    p = _get(db, payment_id)
    email = db.execute(select(User.email).where(User.id == p.user_id)).scalar_one()
    return PaymentDetail(payment=_row(p, email), raw=p.raw)


class ConfirmIn(BaseModel):
    bank_ref: str = Field(min_length=3, max_length=80)  # mã giao dịch trên sao kê ngân hàng
    note: str | None = Field(default=None, max_length=300)


@router.post("/{payment_id}/confirm", response_model=PaymentDetail)
def confirm(payment_id: uuid.UUID, body: ConfirmIn, db: DB, admin: Admin):
    """Đã đối chiếu sao kê: đánh dấu đã thanh toán và cộng lượt (idempotent theo payment id)."""
    p = _get(db, payment_id)
    if p.status == PaymentStatus.paid:
        raise HTTPException(status.HTTP_409_CONFLICT, "Thanh toán này đã được ghi nhận.")
    txn = f"manual:{body.bank_ref.strip()}"
    if db.execute(select(Payment.id).where(Payment.provider_txn_id == txn)).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "Mã giao dịch ngân hàng này đã dùng cho thanh toán khác.")
    pkg = PACKAGE_BY_CODE[p.package_code]
    p.status, p.paid_at, p.provider, p.provider_txn_id = PaymentStatus.paid, datetime.now(UTC), "manual", txn
    p.raw = {**(p.raw or {}), "manual": {"by": admin.email, "bank_ref": body.bank_ref, "note": body.note}}
    apply_credit(db, p.user_id, pkg.credits, CreditReason.purchase, str(p.id))
    if pkg.nursery:
        user = db.get(User, p.user_id)
        if user.role == UserRole.player:
            user.role = UserRole.nursery
    audit(db, admin, "payment.confirm", "payment", p.id, bank_ref=body.bank_ref, credits=pkg.credits, note=body.note)
    db.commit()
    return payment_detail(payment_id, db)


class CancelIn(BaseModel):
    note: str | None = Field(default=None, max_length=300)


@router.post("/{payment_id}/cancel", response_model=PaymentDetail)
def cancel(payment_id: uuid.UUID, body: CancelIn, db: DB, admin: Admin):
    p = _get(db, payment_id)
    if p.status not in (PaymentStatus.pending, PaymentStatus.expired):
        raise HTTPException(status.HTTP_409_CONFLICT, "Chỉ hủy được đơn chưa thanh toán.")
    p.status = PaymentStatus.cancelled
    audit(db, admin, "payment.cancel", "payment", p.id, note=body.note)
    db.commit()
    return payment_detail(payment_id, db)

