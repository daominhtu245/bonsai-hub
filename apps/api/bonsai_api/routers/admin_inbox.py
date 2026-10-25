"""Hộp việc của quản trị: những gì đang chờ người xử lý (báo vi phạm, chuyển khoản treo, câu hỏi nghệ nhân sắp quá hạn,
chăm hộ chưa ai nhận, phản hồi "Chưa đúng", phiên lỗi…) + số đếm cho thanh bên; tìm nhanh mọi thứ từ một ô."""

from __future__ import annotations

import re
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import cast, func, or_, select, String

from ..db.models import (
    AssistantQuestion, CareRequest, Consult, DesignJob, Feedback, JobStatus, Listing, Payment, PaymentStatus, Report, Tree, User,
)
from ..security import DB, require_admin

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_admin)])

PAYMENT_STALE = timedelta(minutes=15)  # chuyển khoản chờ quá lâu → có thể webhook trượt, cần đối soát tay
CONSULT_SOON = timedelta(hours=60)  # tự hoàn lượt ở 72 giờ
CARE_WAIT = timedelta(hours=48)


def _name(u: User | None) -> str:
    return (u.garden_name or u.name or u.email or "—") if u else "—"


def _users(db, ids) -> dict:
    ids = {i for i in ids if i}
    return {u.id: u for u in db.execute(select(User).where(User.id.in_(ids))).scalars()} if ids else {}


def _ago(at: datetime, now: datetime) -> str:
    s = int((now - at).total_seconds())
    return f"{s // 60} phút" if s < 3600 else f"{s // 3600} giờ" if s < 86400 else f"{s // 86400} ngày"


@router.get("/inbox")
def inbox(db: DB):
    """Mỗi mục: số việc, mức (danger | warn | info), đường dẫn xử lý và tối đa 4 dòng xem trước."""
    now = datetime.now(UTC)
    items: list[dict] = []

    def add(key, title, tone, to, rows, count=None, preview=None):
        items.append({"key": key, "title": title, "tone": tone, "to": to, "count": len(rows) if count is None else count,
                      "preview": (preview or [])[:4]})

    reports = db.execute(select(Report).where(Report.status == "open").order_by(Report.created_at)).scalars().all()
    add("reports", "Báo vi phạm chờ xử lý", "danger", "/admin/bao-cao", reports,
        preview=[{"label": f"{REPORT_KIND.get(r.target_kind, r.target_kind)} · {REASON_VI.get(r.reason, r.reason)}", "sub": f"{_ago(r.created_at, now)} trước",
                  "to": "/admin/bao-cao"} for r in reports])

    pays = db.execute(select(Payment).where(Payment.status == PaymentStatus.pending, Payment.created_at < now - PAYMENT_STALE)
                      .order_by(Payment.created_at)).scalars().all()
    pu = _users(db, [p.user_id for p in pays])
    add("payments", "Chuyển khoản chờ đối soát", "warn", "/admin/thanh-toan?status=pending", pays,
        preview=[{"label": f"{p.transfer_code} · {p.amount_vnd:,} đ".replace(",", "."), "sub": f"{_name(pu.get(p.user_id))} · {_ago(p.created_at, now)}",
                  "to": "/admin/thanh-toan?status=pending"} for p in pays])

    consults = db.execute(select(Consult).where(Consult.status == "open", Consult.created_at < now - timedelta(hours=24))
                          .order_by(Consult.created_at)).scalars().all()
    add("consults", "Câu hỏi nghệ nhân chưa trả lời > 24 giờ", "danger" if any(now - c.created_at > CONSULT_SOON for c in consults) else "warn",
        "/admin/cong-dong?tab=consults", consults,
        preview=[{"label": c.question[:70], "sub": f"{_ago(c.created_at, now)} · {'chưa ai nhận' if not c.artisan_id else 'đã có người nhận'}",
                  "to": f"/admin/hoi-dap/{c.id}"} for c in consults])

    care = db.execute(select(CareRequest).where(CareRequest.status == "requested", CareRequest.created_at < now - CARE_WAIT)
                      .order_by(CareRequest.created_at)).scalars().all()
    cu = _users(db, [r.nursery_id for r in care])
    add("care", "Chăm hộ chưa được nhà vườn nhận > 48 giờ", "warn", "/admin/cong-dong?tab=care", care,
        preview=[{"label": _name(cu.get(r.nursery_id)), "sub": f"chờ {_ago(r.created_at, now)}", "to": "/admin/cong-dong?tab=care"} for r in care])

    bad = db.execute(select(Feedback, User).join(User, User.id == Feedback.user_id)
                     .where(Feedback.rating == -1, Feedback.resolved_at.is_(None)).order_by(Feedback.created_at.desc())).all()
    add("feedback", "Phản hồi “Chưa đúng” chưa xem", "warn", "/admin/phan-hoi", bad,
        preview=[{"label": f.comment or ", ".join(f.reason_tags or []) or "Không ghi chú", "sub": _name(u), "to": f"/admin/phien/{f.job_id}"} for f, u in bad])

    failed = db.execute(select(DesignJob).where(DesignJob.status == JobStatus.failed, DesignJob.created_at > now - timedelta(hours=24))
                        .order_by(DesignJob.created_at.desc())).scalars().all()
    add("jobs_failed", "Phiên lỗi 24 giờ qua", "warn", "/admin/phien?status=failed&days=1", failed,
        preview=[{"label": j.error_code or "lỗi", "sub": f"{str(j.id)[:8]} · {_ago(j.created_at, now)} trước", "to": f"/admin/phien/{j.id}"} for j in failed])

    gaps = db.execute(select(func.count()).select_from(AssistantQuestion).where(
        AssistantQuestion.created_at > now - timedelta(days=7), AssistantQuestion.answer["suggest_expert"].as_boolean().is_(True))).scalar_one()
    add("assistant", "Câu hỏi trợ lý chưa trả lời được (7 ngày)", "info", "/admin/tro-ly", [], count=gaps)

    listings = db.execute(select(Listing).where(Listing.created_at > now - timedelta(hours=24), Listing.status == "active")
                          .order_by(Listing.created_at.desc())).scalars().all()
    add("listings", "Tin đăng mới 24 giờ", "info", "/admin/cong-dong?tab=listings", listings,
        preview=[{"label": x.title, "sub": f"{x.code} · {x.price_vnd:,} đ".replace(",", ".") if x.price_vnd else x.code, "to": "/admin/cong-dong?tab=listings&q=" + x.code}
                 for x in listings])

    stolen = db.execute(select(func.count()).select_from(Tree).where(Tree.stolen_at > now - timedelta(days=7))).scalar_one()
    add("stolen", "Cây báo mất 7 ngày", "info", "/admin/cong-dong?tab=stolen", [], count=stolen)

    items = [i for i in items if i["count"]]
    rank = {"danger": 0, "warn": 1, "info": 2}
    items.sort(key=lambda i: rank[i["tone"]])
    badges: dict[str, int] = {}
    for i in items:
        if i["tone"] != "info":
            path = i["to"].split("?")[0]
            badges[path] = badges.get(path, 0) + i["count"]
    return {"items": items, "urgent": sum(i["count"] for i in items if i["tone"] != "info"), "badges": badges}


REPORT_KIND = {"listing": "Tin đăng", "profile": "Trang công khai"}
REASON_VI = {"scam": "Lừa đảo", "wrong_info": "Sai thông tin", "stolen": "Cây bị trộm", "offensive": "Phản cảm", "spam": "Spam", "other": "Khác"}

UUID_RE = re.compile(r"^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$", re.I)


@router.get("/search")
def search(db: DB, q: str = Query(min_length=2, max_length=80)):
    """Tìm nhanh từ thanh trên: người dùng (email, tên, SĐT, tên vườn), phiên (mã), tin đăng (mã, tiêu đề), chuyển khoản (nội dung CK)."""
    v = q.strip()
    like = f"%{v}%"
    out: list[dict] = []
    users = db.execute(select(User).where(or_(User.email.ilike(like), User.name.ilike(like), User.phone.ilike(like),
                                              User.garden_name.ilike(like), cast(User.id, String).ilike(f"{v}%")))
                       .order_by(User.created_at.desc()).limit(5)).scalars()
    out += [{"kind": "user", "label": u.name or u.email or "—", "sub": " · ".join(x for x in (u.email, u.phone, u.garden_name) if x),
             "to": f"/admin/nguoi-dung/{u.id}"} for u in users]
    if UUID_RE.match(v) or re.fullmatch(r"[0-9a-f]{6,}", v, re.I):
        jobs = db.execute(select(DesignJob).where(cast(DesignJob.id, String).ilike(f"{v.lower()}%")).limit(5)).scalars()
        out += [{"kind": "job", "label": f"Phiên {str(j.id)[:8]}", "sub": j.status.value, "to": f"/admin/phien/{j.id}"} for j in jobs]
    listings = db.execute(select(Listing).where(or_(Listing.code == v.upper(), Listing.title.ilike(like))).limit(5)).scalars()
    out += [{"kind": "listing", "label": x.title, "sub": f"{x.code} · {x.status}", "to": f"/admin/cong-dong?tab=listings&q={x.code}"} for x in listings]
    compact = re.sub(r"\s+", "", v).upper()
    pays = db.execute(select(Payment).where(Payment.transfer_code.ilike(f"%{compact}%")).order_by(Payment.created_at.desc()).limit(5)).scalars()
    out += [{"kind": "payment", "label": p.transfer_code, "sub": f"{p.amount_vnd:,} đ · {p.status.value}".replace(",", "."),
             "to": f"/admin/thanh-toan?q={p.transfer_code}"} for p in pays]
    return out

