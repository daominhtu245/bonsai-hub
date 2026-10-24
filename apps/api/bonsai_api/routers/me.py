from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from ..db.models import PushSubscription, User, UserRole
from ..schemas import UserOut
from ..security import DB, CurrentUser
from ..services import referrals
from ..services.provinces import PROVINCES

router = APIRouter(tags=["me"])


class ProfileIn(BaseModel):
    name: str | None = Field(default=None, max_length=200)
    garden_name: str | None = Field(default=None, max_length=120)
    phone: str | None = Field(default=None, max_length=32, pattern=r"^[0-9 +().-]{8,32}$")
    consent_training: bool | None = None
    notify_zalo: bool | None = None
    birth_year: int | None = Field(default=None, ge=1920, le=2030)
    province: str | None = Field(default=None, max_length=32)
    bio: str | None = Field(default=None, max_length=1000)
    # trang công khai /nguoi/{slug} — chỉ nhà vườn, nghệ nhân (docs/ideas.md C3, D2)
    public_slug: str | None = Field(default=None, pattern=r"^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$")
    specialties: list[str] | None = Field(default=None, max_length=8)


RESERVED_SLUGS = {"admin", "api", "bonsai", "ho-tro", "nghe-nhan", "vuon", "tin", "cho"}


class ReferralClaimIn(BaseModel):
    code: str = Field(min_length=4, max_length=12)


class DeleteMeIn(BaseModel):
    confirm: bool


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser):
    return user


@router.patch("/me", response_model=UserOut)
def update_me(body: ProfileIn, user: CurrentUser, db: DB):
    data = body.model_dump(exclude_unset=True)
    for field in ("name", "garden_name", "phone"):
        if field in data:
            value = data[field]
            setattr(user, field, value.strip() if isinstance(value, str) and value.strip() else None)
    if "birth_year" in data:
        user.birth_year = data["birth_year"]
    if "province" in data:
        if data["province"] and data["province"] not in PROVINCES:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Tỉnh không hợp lệ.")
        user.province = data["province"] or None
    if "bio" in data:
        user.bio = (data["bio"] or "").strip() or None
    if "public_slug" in data or "specialties" in data:
        if user.role not in (UserRole.nursery, UserRole.artisan, UserRole.admin):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Trang công khai dành cho nhà vườn và nghệ nhân.")
    if "public_slug" in data:
        slug = data["public_slug"] or None
        if slug and (slug in RESERVED_SLUGS or db.execute(select(User.id).where(User.public_slug == slug, User.id != user.id)).first()):
            raise HTTPException(status.HTTP_409_CONFLICT, "Tên trang này đã có người dùng.")
        user.public_slug = slug
    if "specialties" in data:
        user.specialties = [t.strip()[:40] for t in (data["specialties"] or []) if t.strip()]
    if data.get("consent_training") is not None:
        user.consent_training = data["consent_training"]
        user.consent_at = datetime.now(UTC) if data["consent_training"] else None
    if data.get("notify_zalo") is not None:
        if data["notify_zalo"] and not user.phone:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cần số điện thoại (Zalo) để nhận thông báo.")
        user.notify_zalo = data["notify_zalo"]
    db.commit()
    return user


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
def delete_me(body: DeleteMeIn, user: CurrentUser, db: DB):
    """Xóa mềm: giữ nguyên dữ liệu (cây, ảnh, sổ lượt, thanh toán); tài khoản không đăng nhập được nữa,
    trang chia sẻ công khai bị ẩn, thôi gửi thông báo. Admin khôi phục được."""
    if not body.confirm:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cần xác nhận xóa tài khoản.")
    user.deleted_at = datetime.now(UTC)
    user.notify_zalo = False
    db.query(PushSubscription).filter(PushSubscription.user_id == user.id).delete()
    db.commit()


@router.get("/me/referral")
def my_referral(user: CurrentUser, db: DB):
    code = referrals.ensure_code(db, user)
    from ..settings import get_settings

    return {"code": code, "link": f"{get_settings().public_base_url.rstrip('/')}/?ref={code}",
            "claimed": user.referred_by is not None, **referrals.stats(db, user)}


@router.post("/me/referral/claim", status_code=status.HTTP_204_NO_CONTENT)
def claim_referral(body: ReferralClaimIn, user: CurrentUser, db: DB):
    try:
        referrals.claim(db, user, body.code)
    except referrals.ReferralError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e)) from e
