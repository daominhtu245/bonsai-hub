"""Nghệ nhân, nhà vườn (docs/ideas.md D1, D2, C3): hỏi nghệ nhân bằng lượt, trang công khai /nguoi/{slug}.

Hỏi nghệ nhân: trừ lượt khi gửi; nghệ nhân nhận câu hỏi rồi trả lời (ổn / sửa / làm lại + lời khuyên);
quá 72 giờ chưa trả lời → worker tự hoàn lượt (tasks/consults.py).
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from .. import queue, storage
from ..db.models import (
    ChallengeEntry, Consult, CreditReason, DesignJob, DesignOption, Listing, Style, TreePhoto, User, UserRole,
)
from ..security import DB, CurrentUser, require_artisan
from ..services.credits import InsufficientCredits, apply_credit
from ..services.ops import get_ops
from ..services.provinces import PROVINCES
from ..services.features import require_feature


router = APIRouter(tags=["expert"])
Artisan = Annotated[User, Depends(require_artisan)]
VERDICT_VI = {"ok": "Thiết kế ổn", "fix": "Cần sửa vài chỗ", "rethink": "Nên chọn hướng khác"}


def _display(u: User | None) -> str:
    if u is None:
        return "Ẩn danh"
    return u.garden_name or u.name or "Người dùng"


def notify(user_id: uuid.UUID, event: str, title: str, body: str, path: str) -> None:
    queue.enqueue("bonsai_worker.tasks.notify.user_message", str(user_id), event, title, body, path)


# ---------- D1: hỏi nghệ nhân ----------


class ConsultIn(BaseModel):
    question: str = Field(min_length=10, max_length=2000)
    option_id: uuid.UUID | None = None
    artisan_slug: str | None = None  # hỏi đích danh; bỏ trống = nghệ nhân nào rảnh nhận


def _consult_out(db, c: Consult, *, full: bool) -> dict:
    job = db.get(DesignJob, c.job_id)
    artisan = db.get(User, c.artisan_id) if c.artisan_id else None
    d = {"id": str(c.id), "job_id": str(c.job_id), "question": c.question, "answer": c.answer, "verdict": c.verdict,
         "verdict_vi": VERDICT_VI.get(c.verdict or ""), "status": c.status, "credits": c.credits, "rating": c.rating,
         "artisan": _display(artisan) if artisan else None, "artisan_slug": artisan.public_slug if artisan else None,
         "created_at": c.created_at.isoformat(), "answered_at": c.answered_at.isoformat() if c.answered_at else None}
    if full and job is not None:
        photo = db.get(TreePhoto, job.front_photo_id) if job.front_photo_id else None
        opt = db.get(DesignOption, c.option_id) if c.option_id else None
        style = db.get(Style, opt.style_key) if opt else None
        d |= {"photo_url": storage.presign_get(photo.storage_key) if photo else None,
              "sketch_url": storage.presign_get(opt.sketch_png_key) if opt and opt.sketch_png_key else None,
              "style_vi": style.name_vi if style else None,
              "design_notes": (opt.design or {}).get("why_vi") if opt else None}
    return d


@router.get("/consults/price", dependencies=[require_feature("consults")])
def consult_price(db: DB):
    return {"credits": int(get_ops(db).get("consult_credits") or 0), "answer_within_hours": 72}


@router.post("/jobs/{job_id}/consults", dependencies=[require_feature("consults")], status_code=status.HTTP_201_CREATED)
def ask(job_id: uuid.UUID, body: ConsultIn, db: DB, user: CurrentUser):
    job = db.get(DesignJob, job_id)
    if job is None or job.user_id != user.id or not job.analysis:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy phiên thiết kế.")
    oid = body.option_id or job.chosen_option_id
    opt = db.get(DesignOption, oid) if oid else db.execute(select(DesignOption).where(DesignOption.job_id == job.id)
                                                           .order_by(DesignOption.rank)).scalars().first()
    if opt is None or opt.job_id != job.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Chưa có phương án thiết kế.")
    artisan_id = None
    if body.artisan_slug:
        a = db.execute(select(User).where(User.public_slug == body.artisan_slug, User.role == UserRole.artisan)).scalar_one_or_none()
        if a is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy nghệ nhân.")
        artisan_id = a.id
    credits = int(get_ops(db).get("consult_credits") or 0)
    c = Consult(id=uuid.uuid4(), user_id=user.id, job_id=job.id, option_id=opt.id, artisan_id=artisan_id,
                question=body.question.strip(), credits=credits, status="open")
    db.add(c)
    db.flush()
    try:
        if credits:
            apply_credit(db, user.id, -credits, CreditReason.consult, f"consult:{c.id}")
    except InsufficientCredits as e:
        db.rollback()
        raise HTTPException(status.HTTP_402_PAYMENT_REQUIRED, f"Cần {credits} lượt để hỏi nghệ nhân.") from e
    db.commit()
    if artisan_id:
        notify(artisan_id, "consult_new", "Có câu hỏi mới", "Một người chơi muốn bạn góp ý thiết kế.", f"/admin/hoi-dap/{c.id}")
    return _consult_out(db, c, full=False)


@router.get("/me/consults", dependencies=[require_feature("consults")])
def my_consults(db: DB, user: CurrentUser):
    rows = db.execute(select(Consult).where(Consult.user_id == user.id).order_by(Consult.created_at.desc()).limit(50)).scalars()
    return [_consult_out(db, c, full=False) for c in rows]


def _visible(db, consult_id: uuid.UUID, user: User) -> Consult:
    c = db.get(Consult, consult_id)
    staff = user.role == UserRole.admin or (user.role == UserRole.artisan and c is not None and c.artisan_id in (None, user.id))
    if c is None or not (c.user_id == user.id or staff):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy câu hỏi.")
    return c


@router.get("/consults/{consult_id}")
def get_consult(consult_id: uuid.UUID, db: DB, user: CurrentUser):
    return _consult_out(db, _visible(db, consult_id, user), full=True)


class RateIn(BaseModel):
    rating: int = Field(ge=1, le=5)


@router.post("/consults/{consult_id}/rate", status_code=status.HTTP_204_NO_CONTENT)
def rate_consult(consult_id: uuid.UUID, body: RateIn, db: DB, user: CurrentUser):
    c = db.get(Consult, consult_id)
    if c is None or c.user_id != user.id or c.status != "answered":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy câu trả lời.")
    c.rating = body.rating
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------- phía nghệ nhân ----------


@router.get("/artisan/consults")
def artisan_queue(db: DB, artisan: Artisan, state: Literal["open", "mine", "answered"] = "open"):
    q = select(Consult)
    if state == "open":
        q = q.where(Consult.status == "open", (Consult.artisan_id.is_(None)) | (Consult.artisan_id == artisan.id))
    elif state == "mine":
        q = q.where(Consult.status == "open", Consult.artisan_id == artisan.id)
    else:
        q = q.where(Consult.status == "answered", Consult.artisan_id == artisan.id)
    rows = db.execute(q.order_by(Consult.created_at).limit(100)).scalars()
    return [_consult_out(db, c, full=True) for c in rows]


@router.post("/artisan/consults/{consult_id}/claim")
def claim(consult_id: uuid.UUID, db: DB, artisan: Artisan):
    c = db.execute(select(Consult).where(Consult.id == consult_id).with_for_update()).scalar_one_or_none()
    if c is None or c.status != "open":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Câu hỏi không còn mở.")
    if c.artisan_id not in (None, artisan.id):
        raise HTTPException(status.HTTP_409_CONFLICT, "Nghệ nhân khác đã nhận câu hỏi này.")
    c.artisan_id = artisan.id
    db.commit()
    return _consult_out(db, c, full=True)


class AnswerIn(BaseModel):
    answer: str = Field(min_length=20, max_length=4000)
    verdict: Literal["ok", "fix", "rethink"]


@router.post("/artisan/consults/{consult_id}/answer")
def answer(consult_id: uuid.UUID, body: AnswerIn, db: DB, artisan: Artisan):
    c = db.execute(select(Consult).where(Consult.id == consult_id).with_for_update()).scalar_one_or_none()
    if c is None or c.status != "open":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Câu hỏi không còn mở (có thể đã hoàn lượt).")
    if c.artisan_id not in (None, artisan.id):
        raise HTTPException(status.HTTP_409_CONFLICT, "Nghệ nhân khác đã nhận câu hỏi này.")
    c.artisan_id, c.answer, c.verdict = artisan.id, body.answer.strip(), body.verdict
    c.status, c.answered_at = "answered", datetime.now(UTC)
    db.commit()
    notify(c.user_id, "consult_answered", "Nghệ nhân đã trả lời", f"{_display(artisan)}: {VERDICT_VI[body.verdict]}.", f"/hoi-nghe-nhan/{c.id}")
    return _consult_out(db, c, full=True)


# ---------- D2, C3: trang công khai ----------


def _people_out(db, u: User, *, full: bool) -> dict:
    answered = db.execute(select(func.count(), func.avg(Consult.rating)).where(
        Consult.artisan_id == u.id, Consult.status == "answered")).one()
    d = {"slug": u.public_slug, "name": _display(u), "role": u.role.value, "bio": u.bio, "specialties": u.specialties or [],
         "province_vi": PROVINCES[u.province][0] if u.province in PROVINCES else None,
         "answered": int(answered[0] or 0), "rating": round(float(answered[1]), 1) if answered[1] else None}
    if full:
        listings = db.execute(select(Listing).where(Listing.user_id == u.id, Listing.status == "active")
                              .order_by(Listing.created_at.desc()).limit(20)).scalars()
        d["listings"] = [{"code": x.code, "title": x.title, "price_vnd": x.price_vnd,
                          "photo_url": storage.presign_get(x.photo_key) if x.photo_key else None} for x in listings]
        d["challenge_votes"] = int(db.execute(select(func.coalesce(func.sum(ChallengeEntry.votes), 0)).where(
            ChallengeEntry.user_id == u.id)).scalar_one())
        d["contact_phone"] = u.phone if u.role in (UserRole.nursery, UserRole.artisan) else None
    return d


@router.get("/public/artisans", dependencies=[require_feature("public_profiles", "consults")])
def artisans(db: DB):
    rows = db.execute(select(User).where(User.role == UserRole.artisan, User.public_slug.is_not(None),
                                         User.deleted_at.is_(None))).scalars().all()
    out = [_people_out(db, u, full=False) for u in rows]
    return sorted(out, key=lambda x: (-(x["rating"] or 0), -x["answered"]))


@router.get("/public/people/{slug}", dependencies=[require_feature("public_profiles")])
def person(slug: str, db: DB):
    u = db.execute(select(User).where(User.public_slug == slug.lower(), User.deleted_at.is_(None))).scalar_one_or_none()
    if u is None or u.role not in (UserRole.nursery, UserRole.artisan, UserRole.admin):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy trang.")
    return _people_out(db, u, full=True)
