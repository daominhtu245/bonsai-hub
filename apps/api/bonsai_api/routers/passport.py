"""Sổ hồ sơ cây (docs/ideas.md F1, F7): mã QR riêng cho từng cây, trang công khai lịch sử ảnh + các lần tạo dáng,
chuyển chủ khi bán (mã nhận cây), báo mất (trang sổ hiện cảnh báo; tin đăng mới được so "dấu vân thân")."""

from __future__ import annotations

import io
import secrets
import uuid
from datetime import UTC, datetime, timedelta

import segno
from fastapi import APIRouter, HTTPException, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select, update

from .. import storage
from ..db.models import (
    DesignJob, DesignOption, JobStatus, PhotoSource, RenderImage, Species, Style, Tree, TreePhoto, TreeTransfer, User, UserRole,
)
from ..security import DB, CurrentUser
from ..settings import get_settings
from ..services.features import require_feature


router = APIRouter(tags=["passport"])
ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
TRANSFER_TTL = timedelta(days=7)


def _code(n: int = 8) -> str:
    return "".join(secrets.choice(ALPHABET) for _ in range(n))


def _own_tree(db, tree_id: uuid.UUID, user) -> Tree:
    tree = db.get(Tree, tree_id)
    if tree is None or tree.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy cây.")
    return tree


def passport_url(code: str) -> str:
    return f"{get_settings().public_base_url.rstrip('/')}/so-cay/{code}"


def qr_svg(url: str) -> bytes:
    buf = io.BytesIO()
    segno.make(url, error="m").save(buf, kind="svg", scale=8, border=2, xmldecl=False)
    return buf.getvalue()


class PassportOut(BaseModel):
    code: str
    url: str
    public: bool
    stolen: bool
    pending_transfer: str | None = None
    transfer_expires_at: datetime | None = None


def _pending(db, tree: Tree) -> TreeTransfer | None:
    return db.execute(select(TreeTransfer).where(TreeTransfer.tree_id == tree.id, TreeTransfer.accepted_at.is_(None),
                                                 TreeTransfer.expires_at > datetime.now(UTC))
                      .order_by(TreeTransfer.created_at.desc())).scalars().first()


def _out(db, tree: Tree) -> PassportOut:
    t = _pending(db, tree)
    return PassportOut(code=tree.passport_code, url=passport_url(tree.passport_code), public=tree.passport_public,
                       stolen=tree.stolen_at is not None, pending_transfer=t.code if t else None,
                       transfer_expires_at=t.expires_at if t else None)


@router.post("/trees/{tree_id}/passport", dependencies=[require_feature("passport")], response_model=PassportOut)
def open_passport(tree_id: uuid.UUID, db: DB, user: CurrentUser):
    """Tạo (một lần) mã sổ cây; gọi lại trả mã cũ."""
    tree = _own_tree(db, tree_id, user)
    if not tree.passport_code:
        tree.passport_code = _code()
        db.commit()
    return _out(db, tree)


class PassportPatch(BaseModel):
    public: bool | None = None
    stolen: bool | None = None


@router.patch("/trees/{tree_id}/passport", dependencies=[require_feature("passport")], response_model=PassportOut)
def patch_passport(tree_id: uuid.UUID, body: PassportPatch, db: DB, user: CurrentUser):
    tree = _own_tree(db, tree_id, user)
    if not tree.passport_code:
        tree.passport_code = _code()
    if body.public is not None:
        tree.passport_public = body.public
    if body.stolen is not None:
        tree.stolen_at = datetime.now(UTC) if body.stolen else None
    db.commit()
    return _out(db, tree)


@router.get("/public/passport/{code}/qr.svg", dependencies=[require_feature("passport")])
def passport_qr(code: str, db: DB):
    """QR chỉ chứa link trang sổ (công khai); trang sổ tự ẩn nếu chủ chưa công khai."""
    tree = db.execute(select(Tree).where(Tree.passport_code == code.upper())).scalar_one_or_none()
    if tree is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy sổ cây.")
    return Response(qr_svg(passport_url(tree.passport_code)), media_type="image/svg+xml",
                    headers={"Cache-Control": "public, max-age=86400"})


# ---------- chuyển chủ ----------


@router.post("/trees/{tree_id}/transfer", dependencies=[require_feature("passport")], response_model=PassportOut)
def start_transfer(tree_id: uuid.UUID, db: DB, user: CurrentUser):
    tree = _own_tree(db, tree_id, user)
    if tree.stolen_at is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Cây đang báo mất, không chuyển chủ được.")
    if not tree.passport_code:
        tree.passport_code = _code()
    if _pending(db, tree) is None:
        db.add(TreeTransfer(tree_id=tree.id, from_user_id=user.id, code=_code(), expires_at=datetime.now(UTC) + TRANSFER_TTL))
    db.commit()
    return _out(db, tree)


@router.delete("/trees/{tree_id}/transfer", dependencies=[require_feature("passport")], response_model=PassportOut)
def cancel_transfer(tree_id: uuid.UUID, db: DB, user: CurrentUser):
    tree = _own_tree(db, tree_id, user)
    db.execute(update(TreeTransfer).where(TreeTransfer.tree_id == tree.id, TreeTransfer.accepted_at.is_(None))
               .values(expires_at=datetime.now(UTC)))
    db.commit()
    return _out(db, tree)


class AcceptIn(BaseModel):
    code: str = Field(min_length=6, max_length=12)


@router.post("/transfers/accept", dependencies=[require_feature("passport")])
def accept_transfer(body: AcceptIn, db: DB, user: CurrentUser):
    """Chủ mới nhập mã → cây cùng ảnh, lộ trình, nhật ký về tài khoản mới. Lượt đã dùng / sổ lượt không chuyển."""
    t = db.execute(select(TreeTransfer).where(TreeTransfer.code == body.code.strip().upper()).with_for_update()).scalar_one_or_none()
    now = datetime.now(UTC)
    if t is None or t.accepted_at is not None or t.expires_at <= now:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Mã nhận cây không đúng hoặc đã hết hạn.")
    tree = db.get(Tree, t.tree_id)
    if tree is None or tree.user_id != t.from_user_id or tree.stolen_at is not None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Mã nhận cây không còn dùng được.")
    if t.from_user_id == user.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cây này đã là của bạn.")
    tree.user_id = user.id
    tree.passport_public = False  # chủ mới tự quyết công khai
    db.execute(update(DesignJob).where(DesignJob.tree_id == tree.id).values(user_id=user.id))
    t.to_user_id, t.accepted_at = user.id, now
    db.commit()
    return {"tree_id": str(tree.id)}


# ---------- trang công khai ----------


def _public_tree(db, code: str) -> Tree:
    tree = db.execute(select(Tree).where(Tree.passport_code == code.upper())).scalar_one_or_none()
    if tree is None or not (tree.passport_public or tree.stolen_at is not None):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy sổ cây.")
    return tree


@router.get("/public/passport/{code}", dependencies=[require_feature("passport")])
def public_passport(code: str, db: DB):
    tree = _public_tree(db, code)
    owner = db.get(User, tree.user_id)
    species = db.get(Species, tree.species_key) if tree.species_key else None
    stolen = tree.stolen_at is not None
    timeline: list[dict] = []
    if tree.passport_public:  # cây báo mất nhưng không công khai: chỉ hiện cảnh báo + ảnh phôi
        for p in db.execute(select(TreePhoto).where(TreePhoto.tree_id == tree.id, TreePhoto.source == PhotoSource.progress,
                                                    ~TreePhoto.storage_key.startswith("uploads/"))).scalars():
            timeline.append({"kind": "photo", "at": (p.taken_at or p.created_at).isoformat(), "url": storage.presign_get(p.storage_key)})
        for j in db.execute(select(DesignJob).where(DesignJob.tree_id == tree.id, DesignJob.status == JobStatus.done)).scalars():
            opt = db.get(DesignOption, j.chosen_option_id) if j.chosen_option_id else None
            style = db.get(Style, opt.style_key) if opt else None
            img = db.execute(select(RenderImage).where(RenderImage.job_id == j.id, RenderImage.stage_code == "S4",
                                                       RenderImage.selected.is_(True))).scalars().first()
            timeline.append({"kind": "design", "at": (j.finished_at or j.created_at).isoformat(), "style_vi": style.name_vi if style else None,
                             "url": storage.presign_get(img.storage_key) if img else None})
    timeline.sort(key=lambda x: x["at"])
    front = db.execute(select(TreePhoto).where(TreePhoto.tree_id == tree.id, TreePhoto.is_front.is_(True),
                                               ~TreePhoto.storage_key.startswith("uploads/"))).scalars().first()
    transfers = db.execute(select(func.count()).select_from(TreeTransfer).where(
        TreeTransfer.tree_id == tree.id, TreeTransfer.accepted_at.is_not(None))).scalar_one()
    return {
        "code": tree.passport_code, "nickname": tree.nickname, "species_vi": species.name_vi if species else None,
        "since": tree.created_at.date().isoformat(), "photo_url": storage.presign_get(front.storage_key) if front else None,
        "owner": (owner.garden_name if owner and owner.role == UserRole.nursery and owner.garden_name else None),
        "stolen": stolen, "stolen_at": tree.stolen_at.date().isoformat() if stolen else None,
        "transfers": transfers, "timeline": timeline,
    }

