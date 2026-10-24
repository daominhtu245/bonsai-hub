"""Mã quà tặng: mỗi người dùng một mã một lần; giới hạn tổng số lần dùng và hạn dùng do admin đặt."""

import re
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..db.models import CreditReason, GiftCode, GiftRedemption, User
from .credits import apply_credit

CODE_RE = re.compile(r"^[A-Z0-9-]{4,32}$")


class GiftCodeError(Exception):
    """Thông điệp hiển thị thẳng cho người dùng (tiếng Việt, ngắn)."""


def normalize(code: str) -> str:
    return re.sub(r"\s+", "", code).upper()


def redeem(db: Session, user: User, raw: str) -> int:
    code = normalize(raw)
    gc = db.execute(select(GiftCode).where(GiftCode.code == code).with_for_update()).scalar_one_or_none()
    if gc is None or not gc.active:
        raise GiftCodeError("Mã không đúng hoặc đã ngừng. Bạn kiểm tra lại nhé.")
    if gc.expires_at and gc.expires_at < datetime.now(UTC):
        raise GiftCodeError("Mã này đã hết hạn.")
    if db.execute(select(GiftRedemption.id).where(GiftRedemption.code == code, GiftRedemption.user_id == user.id)).first():
        raise GiftCodeError("Bạn đã dùng mã này rồi.")
    if gc.max_uses is not None and gc.used >= gc.max_uses:
        raise GiftCodeError("Mã này đã hết lượt dùng.")
    db.add(GiftRedemption(code=code, user_id=user.id))
    try:
        db.flush()
    except IntegrityError as e:  # bấm 2 lần cùng lúc
        db.rollback()
        raise GiftCodeError("Bạn đã dùng mã này rồi.") from e
    apply_credit(db, user.id, gc.credits, CreditReason.gift, f"code:{code}")
    gc.used += 1
    db.commit()
    return gc.credits
