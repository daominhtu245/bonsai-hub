"""Nhóm người nhận thông báo hàng loạt (admin → Gửi thông báo). Dùng chung cho api (đếm) và worker (gửi)."""

from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from ..db.models import DesignJob, Payment, PaymentStatus, PushSubscription, User, UserRole

SEGMENT_VI = {"all": "Tất cả", "nursery": "Nhà vườn", "paying": "Đã từng mua lượt", "never_paid": "Chưa mua lượt",
              "inactive_30d": "Không dùng 30 ngày", "no_credits": "Hết lượt"}


def segment_users(segment: str):
    """select(User.id) theo nhóm; chỉ tài khoản đang dùng và có thiết bị bật nhận thông báo."""
    q = select(User.id).where(User.deleted_at.is_(None), User.id.in_(select(PushSubscription.user_id)))
    paid = select(Payment.user_id).where(Payment.status == PaymentStatus.paid)
    if segment == "nursery":
        q = q.where(User.role == UserRole.nursery)
    elif segment == "paying":
        q = q.where(User.id.in_(paid))
    elif segment == "never_paid":
        q = q.where(User.id.not_in(paid))
    elif segment == "inactive_30d":
        recent = select(DesignJob.user_id).where(DesignJob.created_at >= datetime.now(UTC) - timedelta(days=30))
        q = q.where(User.id.not_in(recent))
    elif segment == "no_credits":
        q = q.where(User.credits == 0)
    elif segment != "all":
        raise ValueError(f"unknown segment {segment}")
    return q
