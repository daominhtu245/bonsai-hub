"""Bật / tắt tính năng (services/features.py): web đọc GET /features; quản trị sửa ở /admin/features."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from ..db.models import (
    AssistantQuestion, CareRequest, ChallengeEntry, Consult, CreditLedger, CreditReason, DesignJob, DesignVote, HealthCheck, Listing,
    Referral, Tree, TreeTransfer, User,
)
from ..security import DB, OptionalUser, require_admin
from ..services import features
from ..services.audit import audit

router = APIRouter(tags=["features"])
Admin = Annotated[User, Depends(require_admin)]


@router.get("/features")
def my_features(db: DB, user: OptionalUser) -> dict[str, bool]:
    return features.effective(db, user)


def usage(db, days: int = 30) -> dict[str, int]:
    """Số lượt dùng gần đây — để quyết định mở / đóng. Tính năng không lưu dấu vết (đọc to, tiện ích tra cứu) thì không có số."""
    since = datetime.now(UTC) - timedelta(days=days)

    def count(model, *where) -> int:
        return db.execute(select(func.count()).select_from(model).where(model.created_at >= since, *where)).scalar_one()

    media = lambda kind: db.execute(select(func.count()).select_from(DesignJob).where(  # noqa: E731
        DesignJob.created_at >= since, DesignJob.progress["media"][kind]["state"].astext == "done")).scalar_one()
    return {
        "timelapse": media("video"), "room_place": media("cutout"),
        "diary_rewards": count(CreditLedger, CreditLedger.reason == CreditReason.reward, CreditLedger.ref_id.like("diary:%")),
        "passport": db.execute(select(func.count()).select_from(Tree).where(Tree.passport_code.is_not(None))).scalar_one()
        + count(TreeTransfer),
        "assistant": count(AssistantQuestion), "health_check": count(HealthCheck),
        "market": count(Listing), "consults": count(Consult), "care": count(CareRequest),
        "challenges": count(ChallengeEntry), "design_votes": count(DesignVote), "referral": count(Referral),
    }


@router.get("/admin/features")
def admin_features(db: DB, admin: Admin):
    cfg = features.load(db)
    used = usage(db)
    return {"testers": cfg["testers"],
            "items": [{"key": f.key, "label_vi": f.label_vi, "group_vi": f.group_vi, "state": cfg["flags"][f.key], "usage_30d": used.get(f.key)}
                      for f in features.FEATURES]}


class FeaturesIn(BaseModel):
    flags: dict[str, features.State] | None = None
    testers: list[str] | None = Field(default=None, max_length=200)


@router.put("/admin/features")
def put_features(body: FeaturesIn, db: DB, admin: Admin):
    before = features.load(db)
    after = features.save(db, body.flags, body.testers, by=admin.email)
    changed = {k: [before["flags"][k], v] for k, v in after["flags"].items() if before["flags"][k] != v}
    if changed or before["testers"] != after["testers"]:
        audit(db, admin, "features.update", "features", None, changed=changed, testers=len(after["testers"]))
    db.commit()
    return admin_features(db, admin)
