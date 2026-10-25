"""Người dùng báo vi phạm tin đăng / trang công khai (lừa đảo, cây bị trộm, sai thông tin…). Quản trị xử lý ở /admin/bao-cao."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Literal

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from ..db.models import Listing, Report, User
from ..security import DB, CurrentUser

router = APIRouter(tags=["reports"])
DAILY_MAX = 20


class ReportIn(BaseModel):
    target_kind: Literal["listing", "profile"]
    target: str = Field(min_length=2, max_length=64)  # mã tin (code) hoặc tên trang (slug)
    reason: Literal["scam", "wrong_info", "stolen", "offensive", "spam", "other"]
    note: str | None = Field(default=None, max_length=1000)


@router.post("/reports", status_code=status.HTTP_201_CREATED)
def create_report(body: ReportIn, db: DB, user: CurrentUser):
    if body.target_kind == "listing":
        x = db.execute(select(Listing).where(Listing.code == body.target.upper())).scalar_one_or_none()
        target_id, owner = (str(x.id), x.user_id) if x else (None, None)
    else:
        x = db.execute(select(User).where(User.public_slug == body.target.lower())).scalar_one_or_none()
        target_id, owner = (str(x.id), x.id) if x else (None, None)
    if target_id is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy nội dung cần báo.")
    if owner == user.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Không tự báo nội dung của mình.")
    dup = db.execute(select(Report).where(Report.reporter_id == user.id, Report.target_kind == body.target_kind,
                                          Report.target_id == target_id, Report.status == "open")).scalar_one_or_none()
    if dup:
        return {"id": str(dup.id), "status": dup.status}
    today = db.execute(select(func.count()).select_from(Report).where(
        Report.reporter_id == user.id, Report.created_at > datetime.now(UTC) - timedelta(days=1))).scalar_one()
    if today >= DAILY_MAX:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Bạn đã báo nhiều lần hôm nay, thử lại ngày mai nhé.")
    r = Report(reporter_id=user.id, target_kind=body.target_kind, target_id=target_id, reason=body.reason,
               note=(body.note or "").strip() or None)
    db.add(r)
    db.commit()
    return {"id": str(r.id), "status": r.status}
