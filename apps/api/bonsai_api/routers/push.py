"""Đăng ký Web Push cho thiết bị/trình duyệt của người dùng."""

from fastapi import APIRouter, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.dialects.postgresql import insert

from ..db.models import PushSubscription
from ..security import DB, CurrentUser
from ..settings import get_settings

router = APIRouter(prefix="/push", tags=["push"])


class Keys(BaseModel):
    p256dh: str = Field(max_length=200)
    auth: str = Field(max_length=100)


class SubscriptionIn(BaseModel):
    endpoint: str = Field(pattern=r"^https://", max_length=2000)
    keys: Keys


class EndpointIn(BaseModel):
    endpoint: str


@router.get("/config")
def push_config():
    key = get_settings().vapid_public_key
    return {"enabled": bool(key), "public_key": key}


@router.post("/subscriptions", status_code=status.HTTP_204_NO_CONTENT)
def subscribe(body: SubscriptionIn, request: Request, user: CurrentUser, db: DB):
    stmt = insert(PushSubscription).values(
        user_id=user.id, endpoint=body.endpoint, p256dh=body.keys.p256dh, auth=body.keys.auth,
        user_agent=(request.headers.get("user-agent") or "")[:300],
    )
    # Cùng trình duyệt đăng nhập tài khoản khác → chuyển đăng ký sang tài khoản mới.
    db.execute(stmt.on_conflict_do_update(index_elements=["endpoint"], set_={
        "user_id": stmt.excluded.user_id, "p256dh": stmt.excluded.p256dh, "auth": stmt.excluded.auth,
    }))
    db.commit()


@router.delete("/subscriptions", status_code=status.HTTP_204_NO_CONTENT)
def unsubscribe(body: EndpointIn, user: CurrentUser, db: DB):
    db.query(PushSubscription).filter(PushSubscription.user_id == user.id,
                                      PushSubscription.endpoint == body.endpoint).delete()
    db.commit()
