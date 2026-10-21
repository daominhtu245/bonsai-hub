from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from ..db.models import PushSubscription
from ..schemas import UserOut
from ..security import DB, CurrentUser

router = APIRouter(tags=["me"])


class ProfileIn(BaseModel):
    name: str | None = Field(default=None, max_length=200)
    garden_name: str | None = Field(default=None, max_length=120)
    phone: str | None = Field(default=None, max_length=32, pattern=r"^[0-9 +().-]{8,32}$")
    consent_training: bool | None = None
    notify_zalo: bool | None = None


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
