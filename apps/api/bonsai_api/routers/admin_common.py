"""Phần dùng chung cho các trang quản trị: phân trang, khoảng thời gian."""

from datetime import UTC, datetime, timedelta
from typing import Generic, TypeVar

from pydantic import BaseModel
from sqlalchemy import func, select

T = TypeVar("T")
MAX_LIMIT = 200


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    limit: int
    offset: int


def paginate(db, query, limit: int, offset: int):
    """Trả (rows, total, limit, offset) cho một select đã lọc (chưa limit)."""
    limit = max(1, min(limit, MAX_LIMIT))
    offset = max(0, offset)
    total = db.execute(select(func.count()).select_from(query.order_by(None).subquery())).scalar_one()
    rows = db.execute(query.limit(limit).offset(offset)).all()
    return rows, total, limit, offset


def since(days: int) -> datetime:
    return datetime.now(UTC) - timedelta(days=max(1, min(days, 365)))
