"""Hàng chờ báo vi phạm, xử lý phản hồi "Chưa đúng", và phần mở rộng hồ sơ người dùng (ghi chú nội bộ, nhắn riêng,
cây / tin / câu hỏi / chăm hộ / bị báo) cho trang quản trị."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select

from .. import storage
from ..db.models import CareRequest, Consult, Feedback, Listing, PushSubscription, Report, Tree, User
from ..security import DB, require_admin
from ..services.audit import audit
from .admin_inbox import REASON_VI, REPORT_KIND
from .expert import notify

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_admin)])
Admin = Annotated[User, Depends(require_admin)]


def _who(u: User | None) -> dict | None:
    return {"id": str(u.id), "name": u.garden_name or u.name or u.email or "—", "email": u.email, "locked": u.deleted_at is not None} if u else None


def _target(db, kind: str, target_id: str) -> tuple[dict | None, User | None]:
    """Xem trước nội dung bị báo + chủ nội dung."""
    try:
        tid = uuid.UUID(target_id)
    except ValueError:
        return None, None
    if kind == "listing":
        x = db.get(Listing, tid)
        if x is None:
            return None, None
        owner = db.get(User, x.user_id)
        return {"title": x.title, "code": x.code, "status": x.status, "price_vnd": x.price_vnd, "description": x.description,
                "photo_url": storage.presign_get(x.photo_key) if x.photo_key else None, "public_url": f"/tin/{x.code}",
                "hidden": x.status == "hidden"}, owner
    u = db.get(User, tid)
    if u is None:
        return None, None
    return {"title": u.garden_name or u.name or "—", "code": u.public_slug, "status": "active" if u.public_slug else "hidden",
            "description": u.bio, "photo_url": None, "public_url": f"/nguoi/{u.public_slug}" if u.public_slug else None,
            "hidden": not u.public_slug}, u


@router.get("/reports")
def reports(db: DB, status_: Literal["open", "actioned", "dismissed", "all"] = Query(default="open", alias="status")):
    stmt = select(Report)
    if status_ != "all":
        stmt = stmt.where(Report.status == status_)
    rows = db.execute(stmt.order_by(Report.created_at.desc()).limit(300)).scalars().all()
    reporters = {u.id: u for u in db.execute(select(User).where(User.id.in_({r.reporter_id for r in rows if r.reporter_id}))).scalars()} if rows else {}
    counts = dict(db.execute(select(Report.target_id, func.count()).group_by(Report.target_id)).all())
    out = []
    for r in rows:
        target, owner = _target(db, r.target_kind, r.target_id)
        out.append({"id": str(r.id), "kind": r.target_kind, "kind_vi": REPORT_KIND.get(r.target_kind, r.target_kind),
                    "reason": r.reason, "reason_vi": REASON_VI.get(r.reason, r.reason), "note": r.note, "status": r.status,
                    "resolution": r.resolution, "resolved_by": r.resolved_by, "resolved_at": r.resolved_at.isoformat() if r.resolved_at else None,
                    "created_at": r.created_at.isoformat(), "reporter": _who(reporters.get(r.reporter_id)), "owner": _who(owner),
                    "target": target, "reports_on_target": counts.get(r.target_id, 1)})
    summary = dict(db.execute(select(Report.status, func.count()).group_by(Report.status)).all())
    return {"summary": {k: summary.get(k, 0) for k in ("open", "actioned", "dismissed")}, "items": out}


class ResolveIn(BaseModel):
    action: Literal["hide", "dismiss", "hide_lock"]  # hide: ẩn nội dung; hide_lock: ẩn + khóa người đăng; dismiss: không vi phạm
    note: str | None = Field(default=None, max_length=300)


@router.post("/reports/{report_id}/resolve")
def resolve_report(report_id: uuid.UUID, body: ResolveIn, db: DB, admin: Admin):
    """Xử lý một lần cho mọi báo cáo đang mở về cùng nội dung."""
    r = db.get(Report, report_id)
    if r is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy báo cáo.")
    target, owner = _target(db, r.target_kind, r.target_id)
    if body.action != "dismiss" and target is not None:
        if r.target_kind == "listing":
            x = db.get(Listing, uuid.UUID(r.target_id))
            x.status, x.featured_until = "hidden", None
        elif owner is not None:
            owner.public_slug = None
        if owner is not None:
            notify(owner.id, "moderation", "Nội dung của bạn đã bị ẩn",
                   f"{REPORT_KIND.get(r.target_kind, '')} “{target['title']}” vi phạm quy định{': ' + body.note if body.note else ''}.", "/tai-khoan")
    if body.action == "hide_lock" and owner is not None and owner.id != admin.id:
        owner.deleted_at = owner.deleted_at or datetime.now(UTC)
        owner.notify_zalo = False
        db.query(PushSubscription).filter(PushSubscription.user_id == owner.id).delete()
        audit(db, admin, "user.lock", "user", owner.id, note=f"báo vi phạm: {body.note or REASON_VI.get(r.reason)}")
    now = datetime.now(UTC)
    same = db.execute(select(Report).where(Report.target_kind == r.target_kind, Report.target_id == r.target_id,
                                           or_(Report.status == "open", Report.id == r.id))).scalars().all()
    for x in same:
        x.status = "dismissed" if body.action == "dismiss" else "actioned"
        x.resolution, x.resolved_by, x.resolved_at = body.note or {"hide": "Đã ẩn", "hide_lock": "Đã ẩn, khóa người đăng", "dismiss": "Không vi phạm"}[body.action], admin.email, now
    audit(db, admin, f"report.{body.action}", r.target_kind, r.target_id, reports=len(same), note=body.note)
    db.commit()
    return {"resolved": len(same)}


# ---------- phản hồi ----------


class FeedbackResolveIn(BaseModel):
    resolved: bool = True
    note: str | None = Field(default=None, max_length=500)


@router.post("/feedback/{feedback_id}/resolve")
def resolve_feedback(feedback_id: uuid.UUID, body: FeedbackResolveIn, db: DB, admin: Admin):
    f = db.get(Feedback, feedback_id)
    if f is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy phản hồi.")
    f.resolved_at = datetime.now(UTC) if body.resolved else None
    if body.note is not None:
        f.admin_note = body.note.strip() or None
    audit(db, admin, "feedback.resolve" if body.resolved else "feedback.reopen", "job", f.job_id, note=body.note)
    db.commit()
    return {"id": str(f.id), "resolved_at": f.resolved_at.isoformat() if f.resolved_at else None, "admin_note": f.admin_note}


# ---------- hồ sơ người dùng: phần mở rộng ----------


def _user(db, user_id: uuid.UUID) -> User:
    u = db.get(User, user_id)
    if u is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy người dùng.")
    return u


@router.get("/users/{user_id}/related")
def related(user_id: uuid.UUID, db: DB):
    """Cây, tin đăng, câu hỏi nghệ nhân, chăm hộ, báo vi phạm (bị báo / đã báo) của một người — xem một chỗ."""
    u = _user(db, user_id)
    trees = db.execute(select(Tree).where(Tree.user_id == u.id).order_by(Tree.created_at.desc()).limit(100)).scalars()
    listings = db.execute(select(Listing).where(Listing.user_id == u.id).order_by(Listing.created_at.desc()).limit(100)).scalars()
    consults = db.execute(select(Consult).where(or_(Consult.user_id == u.id, Consult.artisan_id == u.id))
                          .order_by(Consult.created_at.desc()).limit(100)).scalars()
    care = db.execute(select(CareRequest).where(or_(CareRequest.owner_id == u.id, CareRequest.nursery_id == u.id))
                      .order_by(CareRequest.created_at.desc()).limit(100)).scalars()
    own_listing_ids = [str(i) for i in db.execute(select(Listing.id).where(Listing.user_id == u.id)).scalars()]
    against = db.execute(select(Report).where(or_(Report.target_id.in_(own_listing_ids + [str(u.id)])))
                         .order_by(Report.created_at.desc()).limit(100)).scalars().all()
    by = db.execute(select(func.count()).select_from(Report).where(Report.reporter_id == u.id)).scalar_one()
    return {
        "admin_note": u.admin_note, "public_slug": u.public_slug, "province": u.province,
        "trees": [{"id": str(t.id), "nickname": t.nickname, "species_key": t.species_key, "passport_code": t.passport_code,
                   "stolen": t.stolen_at is not None, "created_at": t.created_at.isoformat()} for t in trees],
        "listings": [{"id": str(x.id), "code": x.code, "title": x.title, "status": x.status, "price_vnd": x.price_vnd, "views": x.views,
                      "created_at": x.created_at.isoformat()} for x in listings],
        "consults": [{"id": str(c.id), "question": c.question, "status": c.status, "role": "asker" if c.user_id == u.id else "artisan",
                      "rating": c.rating, "created_at": c.created_at.isoformat()} for c in consults],
        "care": [{"id": str(r.id), "kind": r.kind, "status": r.status, "role": "owner" if r.owner_id == u.id else "nursery",
                  "created_at": r.created_at.isoformat()} for r in care],
        "reports_against": [{"id": str(r.id), "kind_vi": REPORT_KIND.get(r.target_kind, r.target_kind), "reason_vi": REASON_VI.get(r.reason, r.reason),
                             "status": r.status, "note": r.note, "created_at": r.created_at.isoformat()} for r in against],
        "reports_made": by,
    }


class NoteIn(BaseModel):
    note: str = Field(max_length=2000)


@router.put("/users/{user_id}/note")
def set_note(user_id: uuid.UUID, body: NoteIn, db: DB, admin: Admin):
    u = _user(db, user_id)
    u.admin_note = body.note.strip() or None
    audit(db, admin, "user.note", "user", u.id)
    db.commit()
    return {"admin_note": u.admin_note}


class MessageIn(BaseModel):
    title: str = Field(min_length=2, max_length=60)
    body: str = Field(min_length=2, max_length=180)
    path: str = Field(default="/", max_length=200, pattern=r"^/")


@router.post("/users/{user_id}/message", status_code=status.HTTP_202_ACCEPTED)
def message(user_id: uuid.UUID, body: MessageIn, db: DB, admin: Admin):
    """Thông báo riêng cho một người (điện thoại / trình duyệt, kèm Zalo nếu họ bật)."""
    u = _user(db, user_id)
    if u.deleted_at is not None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Tài khoản đang bị khóa.")
    notify(u.id, "admin_message", body.title, body.body, body.path)
    audit(db, admin, "user.message", "user", u.id, title=body.title)
    db.commit()
    return Response(status_code=status.HTTP_202_ACCEPTED)
