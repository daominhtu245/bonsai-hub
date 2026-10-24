"""Giới thiệu bạn (docs/ideas.md B1): người được mời nhập mã; khi họ phân tích phôi đầu tiên xong, cả hai được tặng lượt.
Chống lạm dụng: mỗi người chỉ được mời một lần, không tự mời mình, thưởng đúng một lần (ref_id duy nhất trong sổ lượt)."""

from __future__ import annotations

import secrets
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db.models import CreditReason, DesignJob, JobStatus, Referral, User
from .credits import apply_credit
from .ops import get_ops

ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
CLAIM_WINDOW = timedelta(days=30)  # chỉ nhập mã trong 30 ngày đầu sau khi tạo tài khoản


class ReferralError(ValueError):
    pass


def ensure_code(db: Session, user: User) -> str:
    if user.referral_code:
        return user.referral_code
    while True:
        code = "".join(secrets.choice(ALPHABET) for _ in range(6))
        if db.execute(select(User.id).where(User.referral_code == code)).first() is None:
            user.referral_code = code
            db.commit()
            return code


def claim(db: Session, user: User, code: str) -> User:
    code = code.strip().upper()
    if user.referred_by is not None:
        raise ReferralError("Bạn đã nhập mã giới thiệu rồi.")
    if datetime.now(UTC) - user.created_at > CLAIM_WINDOW:
        raise ReferralError("Chỉ nhập mã giới thiệu trong 30 ngày đầu.")
    referrer = db.execute(select(User).where(User.referral_code == code, User.deleted_at.is_(None))).scalar_one_or_none()
    if referrer is None:
        raise ReferralError("Mã giới thiệu không đúng.")
    if referrer.id == user.id:
        raise ReferralError("Không tự giới thiệu chính mình được.")
    user.referred_by = referrer.id
    db.add(Referral(referrer_id=referrer.id, referee_id=user.id))
    db.commit()
    return referrer


def reward_if_due(db: Session, user_id: uuid.UUID) -> bool:
    """Gọi khi một phiên phân tích xong: phiên thành công đầu tiên của người được mời → tặng cả hai. Không commit."""
    ref = db.execute(select(Referral).where(Referral.referee_id == user_id, Referral.rewarded_at.is_(None))).scalar_one_or_none()
    if ref is None:
        return False
    done = db.execute(select(func.count()).select_from(DesignJob).where(
        DesignJob.user_id == user_id, DesignJob.status.in_([JobStatus.awaiting_choice, JobStatus.done]))).scalar_one()
    if done < 1:
        return False
    credits = int(get_ops(db).get("referral_credits", 1))
    if credits > 0:
        apply_credit(db, ref.referee_id, credits, CreditReason.referral, f"referral:{ref.id}:in")
        apply_credit(db, ref.referrer_id, credits, CreditReason.referral, f"referral:{ref.id}:out")
    ref.rewarded_at = datetime.now(UTC)
    return True


def stats(db: Session, user: User) -> dict:
    rows = db.execute(select(Referral).where(Referral.referrer_id == user.id)).scalars().all()
    return {"invited": len(rows), "rewarded": sum(r.rewarded_at is not None for r in rows),
            "credits_each": int(get_ops(db).get("referral_credits", 1))}
