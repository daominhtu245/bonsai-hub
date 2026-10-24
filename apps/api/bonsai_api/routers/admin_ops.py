"""Quản trị vận hành: cấu hình chạy (tạm dừng, thông báo chung, giới hạn), gói bán, mã quà tặng, gửi thông báo
hàng loạt, xuất Excel danh sách phiên / người dùng / thanh toán. Mọi thay đổi ghi admin_audit."""

import secrets
import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import queue
from ..db.models import GiftCode, GiftRedemption, Payment, PaymentStatus, User, UserRole
from ..security import DB, require_admin
from ..services.audit import audit
from ..services.broadcast import SEGMENT_VI, segment_users
from ..services.gift_codes import CODE_RE, normalize
from ..services.ops import get_ops, get_packages, package_active, set_ops, set_packages
from ..services.xlsx import write_xlsx

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_admin)])
Admin = Annotated[User, Depends(require_admin)]


# ---------- cấu hình vận hành ----------

class AnnouncementIn(BaseModel):
    active: bool
    text: str = Field(default="", max_length=300)
    tone: Literal["info", "success", "warn"] = "info"


class OpsIn(BaseModel):
    trial_credits: int | None = Field(default=None, ge=0, le=20)
    phase_a_daily_limit: int | None = Field(default=None, ge=1, le=200)
    usd_vnd_rate: int | None = Field(default=None, ge=10_000, le=50_000)
    pause_analysis: bool | None = None
    pause_render: bool | None = None
    pause_message: str | None = Field(default=None, min_length=5, max_length=200)
    announcement: AnnouncementIn | None = None
    referral_credits: int | None = Field(default=None, ge=0, le=10)
    diary_reward_credits: int | None = Field(default=None, ge=0, le=10)
    consult_credits: int | None = Field(default=None, ge=1, le=20)
    nursery_listing_free: int | None = Field(default=None, ge=0, le=100)
    nursery_featured_max: int | None = Field(default=None, ge=0, le=50)
    nursery_preview_limit: int | None = Field(default=None, ge=2, le=50)
    health_daily_free: int | None = Field(default=None, ge=0, le=100)
    assistant_daily_ai: int | None = Field(default=None, ge=0, le=500)


@router.get("/ops")
def ops(db: DB) -> dict:
    return get_ops(db)


@router.put("/ops")
def update_ops(body: OpsIn, db: DB, admin: Admin) -> dict:
    patch = body.model_dump(exclude_none=True)
    before = get_ops(db)
    after = set_ops(db, patch, by=admin.email)
    changed = {k: {"before": before[k], "after": after[k]} for k in patch if before[k] != after[k]}
    if changed:
        audit(db, admin, "ops.update", "setting", "ops", **changed)
    db.commit()
    return after


# ---------- gói bán ----------

class PackageRow(BaseModel):
    code: str
    name_vi: str
    credits: int
    amount_vnd: int
    note_vi: str
    popular: bool
    nursery: bool
    active: bool
    sold_30d: int


class PackageIn(BaseModel):
    name_vi: str | None = Field(default=None, min_length=1, max_length=40)
    credits: int | None = Field(default=None, ge=1, le=500)
    amount_vnd: int | None = Field(default=None, ge=1_000, le=50_000_000)
    note_vi: str | None = Field(default=None, max_length=120)
    popular: bool | None = None
    active: bool | None = None


def _packages(db: Session) -> list[PackageRow]:
    since = datetime.now(UTC) - timedelta(days=30)
    sold = dict(db.execute(select(Payment.package_code, func.count()).where(
        Payment.status == PaymentStatus.paid, Payment.paid_at >= since).group_by(Payment.package_code)).all())
    return [PackageRow(**p.__dict__, active=package_active(db, p.code), sold_30d=sold.get(p.code, 0))
            for p in get_packages(db, include_inactive=True)]


@router.get("/packages", response_model=list[PackageRow])
def packages(db: DB):
    return _packages(db)


@router.put("/packages/{code}", response_model=list[PackageRow])
def update_package(code: str, body: PackageIn, db: DB, admin: Admin):
    if code not in {p.code for p in get_packages(db, include_inactive=True)}:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Gói không tồn tại.")
    patch = body.model_dump(exclude_none=True)
    if patch.get("active") is False and sum(package_active(db, p.code) for p in get_packages(db, include_inactive=True)) <= 1 \
            and package_active(db, code):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Phải còn ít nhất một gói đang bán.")
    before = next(p for p in _packages(db) if p.code == code)
    set_packages(db, {code: patch}, by=admin.email)
    audit(db, admin, "package.update", "package", code,
          **{k: {"before": getattr(before, k), "after": v} for k, v in patch.items() if getattr(before, k) != v})
    db.commit()
    return _packages(db)


# ---------- mã quà tặng ----------

class GiftCodeRow(BaseModel):
    code: str
    credits: int
    max_uses: int | None
    used: int
    expires_at: datetime | None
    active: bool
    note: str | None
    created_by: str | None
    created_at: datetime
    status: Literal["active", "expired", "used_up", "disabled"]


class GiftCodeIn(BaseModel):
    code: str | None = Field(default=None, max_length=32)  # trống → sinh ngẫu nhiên
    credits: int = Field(ge=1, le=100)
    max_uses: int | None = Field(default=None, ge=1, le=100_000)
    expires_at: datetime | None = None
    note: str | None = Field(default=None, max_length=200)


class GiftCodePatch(BaseModel):
    active: bool | None = None
    max_uses: int | None = Field(default=None, ge=1, le=100_000)
    expires_at: datetime | None = None
    note: str | None = Field(default=None, max_length=200)


def _gc_row(g: GiftCode) -> GiftCodeRow:
    now = datetime.now(UTC)
    st = ("disabled" if not g.active else "expired" if g.expires_at and g.expires_at < now
          else "used_up" if g.max_uses is not None and g.used >= g.max_uses else "active")
    return GiftCodeRow(code=g.code, credits=g.credits, max_uses=g.max_uses, used=g.used, expires_at=g.expires_at,
                       active=g.active, note=g.note, created_by=g.created_by, created_at=g.created_at, status=st)


@router.get("/gift-codes", response_model=list[GiftCodeRow])
def gift_codes(db: DB):
    return [_gc_row(g) for g in db.execute(select(GiftCode).order_by(GiftCode.created_at.desc()).limit(500)).scalars()]


@router.post("/gift-codes", response_model=GiftCodeRow, status_code=status.HTTP_201_CREATED)
def create_gift_code(body: GiftCodeIn, db: DB, admin: Admin):
    code = normalize(body.code) if body.code else f"BONSAI-{secrets.token_hex(3).upper()}"
    if not CODE_RE.match(code):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Mã chỉ gồm chữ không dấu, số và dấu gạch ngang (4–32 ký tự).")
    if db.get(GiftCode, code):
        raise HTTPException(status.HTTP_409_CONFLICT, "Mã này đã có.")
    g = GiftCode(code=code, credits=body.credits, max_uses=body.max_uses, expires_at=body.expires_at, note=body.note,
                 created_by=admin.email, active=True, used=0)
    db.add(g)
    audit(db, admin, "giftcode.create", "giftcode", code, credits=body.credits, max_uses=body.max_uses,
          expires_at=body.expires_at.isoformat() if body.expires_at else None)
    db.commit()
    db.refresh(g)
    return _gc_row(g)


@router.put("/gift-codes/{code}", response_model=GiftCodeRow)
def update_gift_code(code: str, body: GiftCodePatch, db: DB, admin: Admin):
    g = db.get(GiftCode, normalize(code))
    if g is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không có mã này.")
    patch = body.model_dump(exclude_unset=True)
    for k, v in patch.items():
        setattr(g, k, v)
    audit(db, admin, "giftcode.update", "giftcode", g.code, **{k: (v.isoformat() if isinstance(v, datetime) else v) for k, v in patch.items()})
    db.commit()
    return _gc_row(g)


class RedemptionRow(BaseModel):
    user_id: uuid.UUID
    email: str | None
    at: datetime


@router.get("/gift-codes/{code}/redemptions", response_model=list[RedemptionRow])
def redemptions(code: str, db: DB):
    rows = db.execute(select(GiftRedemption, User.email).join(User, User.id == GiftRedemption.user_id)
                      .where(GiftRedemption.code == normalize(code)).order_by(GiftRedemption.id.desc()).limit(1000)).all()
    return [RedemptionRow(user_id=r.user_id, email=email, at=r.created_at) for r, email in rows]


# ---------- gửi thông báo hàng loạt (Web Push) ----------

Segment = Literal["all", "nursery", "paying", "never_paid", "inactive_30d", "no_credits"]


class BroadcastIn(BaseModel):
    segment: Segment
    title: str = Field(min_length=3, max_length=60)
    body: str = Field(min_length=3, max_length=180)
    path: str = Field(default="/", pattern=r"^/[A-Za-z0-9/_?=&.-]*$", max_length=200)


@router.get("/broadcast/segments")
def broadcast_segments(db: DB) -> list[dict]:
    return [{"key": k, "label": v, "recipients": db.execute(select(func.count()).select_from(segment_users(k).subquery())).scalar_one()}
            for k, v in SEGMENT_VI.items()]


@router.post("/broadcast", status_code=status.HTTP_202_ACCEPTED)
def broadcast(body: BroadcastIn, db: DB, admin: Admin) -> dict:
    n = db.execute(select(func.count()).select_from(segment_users(body.segment).subquery())).scalar_one()
    if n == 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Nhóm này chưa có ai bật nhận thông báo.")
    audit(db, admin, "broadcast.send", "segment", body.segment, title=body.title, body=body.body, path=body.path, recipients=n)
    db.commit()
    queue.enqueue("bonsai_worker.tasks.notify.broadcast", body.segment, body.title, body.body, body.path)
    return {"recipients": n}


# ---------- xuất Excel ----------

ExportKind = Literal["jobs", "users", "payments"]


@router.get("/export/{kind}.xlsx")
def export_xlsx(kind: ExportKind, db: DB, admin: Admin,
                q: str | None = None, status_: Annotated[str | None, Query(alias="status")] = None,
                days: int | None = None, paid: bool | None = None, role: str | None = None, state: str = "active",
                provider: str | None = None) -> Response:
    """Cùng bộ lọc với danh sách đang xem; tối đa 10.000 dòng."""
    from .admin_jobs import list_jobs
    from .admin_payments import list_payments
    from .admin_users import list_users

    rows: list[list] = []
    offset, limit = 0, 200
    while len(rows) < 10_000:
        if kind == "jobs":
            page = list_jobs(db, q=q, status_=status_, paid=paid, user_id=None, days=days, sort="created_desc", limit=limit, offset=offset)
            rows += [[r.created_at, str(r.id), r.user_email, r.tree_nickname, r.species_key, r.style_key, r.status.value,
                      r.error_code, "có" if r.paid else "", r.cost_mode, r.prompt_version, r.duration_s, r.cost_usd] for r in page.items]
        elif kind == "users":
            page = list_users(db, q=q, role=UserRole(role) if role else None, state=state, consent=None, paying=None,
                              sort="created_desc", limit=limit, offset=offset)
            rows += [[r.created_at, r.email, r.name, r.phone, r.garden_name, r.role.value, r.auth_provider.value, r.credits,
                      r.trees, r.jobs, r.paid_jobs, r.revenue_vnd, r.last_active_at, "có" if r.consent_training else "",
                      "đã khóa" if r.deleted else ""] for r in page.items]
        else:
            page = list_payments(db, q=q, status_=PaymentStatus(status_) if status_ else None, provider=provider,
                                 days=days or 30, limit=limit, offset=offset)
            rows += [[r.created_at, r.paid_at, r.transfer_code, r.user_email, r.package_name, r.credits, r.amount_vnd,
                      r.status.value, r.provider, r.provider_txn_id] for r in page.items]
        offset += limit
        if offset >= page.total:
            break
    headers = {
        "jobs": ["Tạo lúc", "Mã phiên", "Email", "Cây", "Loài", "Thế", "Trạng thái", "Mã lỗi", "Trả lượt", "Chế độ", "Prompt",
                 "Thời gian (s)", "Chi phí AI (USD)"],
        "users": ["Đăng ký", "Email", "Tên", "SĐT", "Tên vườn", "Vai trò", "Đăng nhập", "Lượt", "Cây", "Phiên", "Lượt trả",
                  "Đã trả (VND)", "Hoạt động gần nhất", "Đồng ý ảnh", "Trạng thái"],
        "payments": ["Tạo lúc", "Thanh toán lúc", "Nội dung CK", "Email", "Gói", "Lượt", "Số tiền (VND)", "Trạng thái",
                     "Nguồn", "Mã giao dịch"],
    }[kind]
    title = {"jobs": "Phiên", "users": "Người dùng", "payments": "Thanh toán"}[kind]
    data = write_xlsx(title, headers, rows)
    audit(db, admin, "export.xlsx", "export", kind, rows=len(rows))
    db.commit()
    stamp = datetime.now(UTC).strftime("%Y%m%d-%H%M")
    return Response(data, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": f'attachment; filename="bonsai-{kind}-{stamp}.xlsx"'})

