"""Lượt: credit_ledger là nguồn gốc (chỉ ghi thêm); users.credits là cache cập nhật cùng transaction."""

from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from ..db.models import CreditLedger, CreditReason, User


class InsufficientCredits(Exception):
    pass


def apply_credit(db: Session, user_id: uuid.UUID, delta: int, reason: CreditReason, ref_id: str | None) -> bool:
    """Ghi 1 dòng ledger và cập nhật cache. Trả False nếu (user, reason, ref_id) đã ghi trước đó (idempotent).

    Không commit — người gọi quyết định ranh giới transaction.
    """
    # Khóa dòng user: các thao tác lượt của cùng user chạy tuần tự.
    user = db.execute(select(User).where(User.id == user_id).with_for_update()).scalar_one()
    if ref_id is not None and _exists(db, user_id, reason, ref_id):
        return False
    if delta < 0 and user.credits + delta < 0:
        raise InsufficientCredits()
    stmt = (
        insert(CreditLedger)
        .values(user_id=user_id, delta=delta, reason=reason, ref_id=ref_id)
        .on_conflict_do_nothing(
            index_elements=["user_id", "reason", "ref_id"], index_where=CreditLedger.ref_id.isnot(None)
        )
        .returning(CreditLedger.id)
    )
    if db.execute(stmt).scalar_one_or_none() is None:
        return False
    user.credits += delta
    return True


def _exists(db: Session, user_id: uuid.UUID, reason: CreditReason, ref_id: str) -> bool:
    return db.execute(
        select(CreditLedger.id).where(
            CreditLedger.user_id == user_id, CreditLedger.reason == reason, CreditLedger.ref_id == ref_id
        )
    ).first() is not None


def spend_for_render(db: Session, user_id: uuid.UUID, job_id: uuid.UUID) -> bool:
    return apply_credit(db, user_id, -1, CreditReason.render, str(job_id))


def refund_render(db: Session, user_id: uuid.UUID, job_id: uuid.UUID) -> bool:
    """Hoàn lượt khi lỗi sau khi đã trừ. Chỉ hoàn nếu job thực sự đã bị trừ, và chỉ một lần."""
    if not _exists(db, user_id, CreditReason.render, str(job_id)):
        return False
    return apply_credit(db, user_id, 1, CreditReason.refund, str(job_id))


def ledger_balance(db: Session, user_id: uuid.UUID) -> int:
    return db.execute(
        select(func.coalesce(func.sum(CreditLedger.delta), 0)).where(CreditLedger.user_id == user_id)
    ).scalar_one()
