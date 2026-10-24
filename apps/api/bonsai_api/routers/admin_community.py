"""Quản trị nội dung cộng đồng & dịch vụ (docs/ideas.md C, D, E, F): kiểm duyệt tin đăng, trang công khai, cây báo mất;
theo dõi hỏi nghệ nhân (quá hạn, hoàn lượt tay), chăm hộ; nhật ký trợ lý (câu hỏi, đoán bệnh) để bổ sung bảng tra."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel
from sqlalchemy import func, or_, select

from .. import storage
from ..db.models import (
    AssistantQuestion, CareRequest, Consult, CreditReason, HealthCheck, Listing, Tree, User,
)
from ..security import DB, require_admin
from ..services.audit import audit
from ..services.credits import apply_credit

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_admin)])
Admin = Annotated[User, Depends(require_admin)]


def _who(u: User | None) -> dict | None:
    return {"id": str(u.id), "name": u.garden_name or u.name or u.email or "—", "email": u.email} if u else None


def _users(db, ids) -> dict:
    ids = {i for i in ids if i}
    return {u.id: u for u in db.execute(select(User).where(User.id.in_(ids))).scalars()} if ids else {}


# ---------- tin đăng ----------


@router.get("/listings")
def listings(db: DB, status_: Literal["active", "sold", "hidden"] | None = Query(default=None, alias="status"),
             q: str | None = Query(default=None, max_length=80), limit: int = Query(default=100, le=300)):
    stmt = select(Listing)
    if status_:
        stmt = stmt.where(Listing.status == status_)
    if q:
        stmt = stmt.where(or_(Listing.title.ilike(f"%{q}%"), Listing.code == q.upper()))
    rows = db.execute(stmt.order_by(Listing.created_at.desc()).limit(limit)).scalars().all()
    users = _users(db, [x.user_id for x in rows])
    now = datetime.now(UTC)
    return [{"id": str(x.id), "code": x.code, "title": x.title, "price_vnd": x.price_vnd, "status": x.status, "views": x.views,
             "featured": bool(x.featured_until and x.featured_until > now), "seller": _who(users.get(x.user_id)),
             "photo_url": storage.presign_get(x.photo_key) if x.photo_key else None, "created_at": x.created_at.isoformat()} for x in rows]


class ListingModIn(BaseModel):
    status: Literal["active", "hidden"]
    reason: str | None = None


@router.post("/listings/{listing_id}/moderate")
def moderate_listing(listing_id: uuid.UUID, body: ListingModIn, db: DB, admin: Admin):
    x = db.get(Listing, listing_id)
    if x is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy tin.")
    audit(db, admin, "listing.moderate", "listing", x.id, code=x.code, before=x.status, after=body.status, reason=body.reason)
    x.status = body.status
    if body.status == "hidden":
        x.featured_until = None
    db.commit()
    return {"id": str(x.id), "status": x.status}


# ---------- trang công khai ----------


@router.get("/public-profiles")
def public_profiles(db: DB):
    rows = db.execute(select(User).where(User.public_slug.is_not(None)).order_by(User.created_at.desc())).scalars()
    return [{"id": str(u.id), "slug": u.public_slug, "name": u.garden_name or u.name, "email": u.email, "role": u.role.value,
             "bio": u.bio, "specialties": u.specialties or []} for u in rows]


class HideProfileIn(BaseModel):
    reason: str | None = None


@router.post("/public-profiles/{user_id}/hide")
def hide_profile(user_id: uuid.UUID, body: HideProfileIn, db: DB, admin: Admin):
    u = db.get(User, user_id)
    if u is None or not u.public_slug:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy trang.")
    audit(db, admin, "profile.hide", "user", u.id, slug=u.public_slug, reason=body.reason)
    u.public_slug = None
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------- cây báo mất ----------


@router.get("/stolen-trees")
def stolen_trees(db: DB):
    rows = db.execute(select(Tree).where(Tree.stolen_at.is_not(None)).order_by(Tree.stolen_at.desc())).scalars().all()
    users = _users(db, [t.user_id for t in rows])
    return [{"tree_id": str(t.id), "nickname": t.nickname, "passport_code": t.passport_code, "stolen_at": t.stolen_at.isoformat(),
             "owner": _who(users.get(t.user_id))} for t in rows]


# ---------- hỏi nghệ nhân ----------

OVERDUE = timedelta(hours=72)


@router.get("/consults")
def consults(db: DB, status_: Literal["open", "answered", "refunded"] | None = Query(default=None, alias="status")):
    stmt = select(Consult)
    if status_:
        stmt = stmt.where(Consult.status == status_)
    rows = db.execute(stmt.order_by(Consult.created_at.desc()).limit(200)).scalars().all()
    users = _users(db, [c.user_id for c in rows] + [c.artisan_id for c in rows])
    now = datetime.now(UTC)
    by_artisan = db.execute(select(Consult.artisan_id, func.count(), func.avg(Consult.rating)).where(Consult.status == "answered")
                            .group_by(Consult.artisan_id)).all()
    art_users = _users(db, [a for a, _, _ in by_artisan])
    return {
        "summary": {"open": sum(c.status == "open" for c in rows), "overdue_soon": sum(c.status == "open" and now - c.created_at > OVERDUE - timedelta(hours=12) for c in rows)},
        "artisans": [{"artisan": _who(art_users.get(a)), "answered": n, "rating": round(float(r), 1) if r else None} for a, n, r in by_artisan],
        "items": [{"id": str(c.id), "question": c.question, "status": c.status, "credits": c.credits, "verdict": c.verdict, "rating": c.rating,
                   "asker": _who(users.get(c.user_id)), "artisan": _who(users.get(c.artisan_id)), "hours_open": max(0, int((now - c.created_at).total_seconds() // 3600)),
                   "created_at": c.created_at.isoformat()} for c in rows],
    }


class ConsultActionIn(BaseModel):
    action: Literal["refund", "release"]  # refund: hoàn lượt ngay; release: gỡ nghệ nhân đã nhận để người khác nhận
    reason: str | None = None


@router.post("/consults/{consult_id}/action")
def consult_action(consult_id: uuid.UUID, body: ConsultActionIn, db: DB, admin: Admin):
    c = db.execute(select(Consult).where(Consult.id == consult_id).with_for_update()).scalar_one_or_none()
    if c is None or c.status != "open":
        raise HTTPException(status.HTTP_409_CONFLICT, "Chỉ thao tác được với câu hỏi đang chờ.")
    if body.action == "refund":
        apply_credit(db, c.user_id, c.credits, CreditReason.refund, f"consult:{c.id}")
        c.status = "refunded"
    else:
        c.artisan_id = None
    audit(db, admin, f"consult.{body.action}", "consult", c.id, reason=body.reason)
    db.commit()
    return {"id": str(c.id), "status": c.status}


# ---------- chăm hộ ----------


@router.get("/care-requests")
def care_requests(db: DB):
    rows = db.execute(select(CareRequest).order_by(CareRequest.created_at.desc()).limit(200)).scalars().all()
    users = _users(db, [r.owner_id for r in rows] + [r.nursery_id for r in rows])
    return [{"id": str(r.id), "kind": r.kind, "status": r.status, "owner": _who(users.get(r.owner_id)), "nursery": _who(users.get(r.nursery_id)),
             "start_date": r.start_date.isoformat() if r.start_date else None, "end_date": r.end_date.isoformat() if r.end_date else None,
             "created_at": r.created_at.isoformat()} for r in rows]


# ---------- trợ lý ----------


@router.get("/assistant")
def assistant_log(db: DB, kind: Literal["questions", "health"] = "questions", only_gaps: bool = False):
    """only_gaps: câu tra bảng không trả lời được / đoán bệnh không ra — gợi ý bổ sung bảng loài, bảng sâu bệnh."""
    since = datetime.now(UTC) - timedelta(days=30)
    if kind == "questions":
        rows = db.execute(select(AssistantQuestion).where(AssistantQuestion.created_at >= since)
                          .order_by(AssistantQuestion.created_at.desc()).limit(300)).scalars().all()
        items = [{"id": str(q.id), "question": q.question, "answer": (q.answer or {}).get("answer_vi"), "method": (q.answer or {}).get("method"),
                  "gap": bool((q.answer or {}).get("suggest_expert")), "ai_failed": bool((q.answer or {}).get("ai_failed")),
                  "created_at": q.created_at.isoformat()} for q in rows]
    else:
        rows = db.execute(select(HealthCheck).where(HealthCheck.created_at >= since)
                          .order_by(HealthCheck.created_at.desc()).limit(300)).scalars().all()
        items = [{"id": str(h.id), "symptoms": h.symptoms, "status": h.status, "method": (h.result or {}).get("method"),
                  "findings": [f.get("name_vi") for f in (h.result or {}).get("findings", [])],
                  "gap": not (h.result or {}).get("findings") and not (h.result or {}).get("healthy"),
                  "ai_failed": bool((h.result or {}).get("ai_failed")),
                  "photo_url": storage.presign_get(h.photo_key) if h.photo_key else None, "created_at": h.created_at.isoformat()} for h in rows]
    total, gaps, failed = len(items), sum(i["gap"] for i in items), sum(i["ai_failed"] for i in items)
    if only_gaps:
        items = [i for i in items if i["gap"]]
    return {"summary": {"total_30d": total, "gaps": gaps, "ai_failed": failed}, "items": items}
