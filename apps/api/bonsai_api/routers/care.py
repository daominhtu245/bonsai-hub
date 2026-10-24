"""Chăm hộ / nuôi hộ (docs/ideas.md C5, C6): chủ cây gửi yêu cầu cho một nhà vườn (trang /nguoi/{slug}); nhà vườn
nhận rồi gửi ảnh cập nhật — ảnh vào luôn nhật ký cây của chủ. Tiền công hai bên tự thỏa thuận (app không giữ tiền)."""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime
from typing import Literal

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import func, or_, select

from bonsai_pipeline.preprocess import InvalidImageError, prepare_upload

from .. import storage
from ..db.models import CareRequest, CareUpdate, DesignJob, PhotoSource, Tree, TreePhoto, User, UserRole
from ..security import DB, CurrentUser
from .expert import _display, notify
from .uploads import upload_prefix

router = APIRouter(tags=["care"])
KIND_VI = {"care": "Chăm hộ", "grow": "Nuôi hộ"}
STATUS_VI = {"requested": "Chờ nhà vườn nhận", "active": "Đang chăm", "done": "Đã xong", "declined": "Nhà vườn từ chối"}
MAX_UPDATES = 200


class CareIn(BaseModel):
    kind: Literal["care", "grow"]
    nursery_slug: str
    tree_id: uuid.UUID
    job_id: uuid.UUID | None = None  # lộ trình để nhà vườn chăm theo
    start_date: date | None = None
    end_date: date | None = None
    note: str | None = Field(default=None, max_length=1000)

    @model_validator(mode="after")
    def _dates(self) -> CareIn:
        if self.start_date and self.end_date and self.end_date < self.start_date:
            raise ValueError("Ngày kết thúc phải sau ngày bắt đầu.")
        return self


def _out(db, r: CareRequest, *, viewer: User, updates: bool = False) -> dict:
    tree = db.get(Tree, r.tree_id)
    owner, nursery = db.get(User, r.owner_id), db.get(User, r.nursery_id)
    d = {"id": str(r.id), "kind": r.kind, "kind_vi": KIND_VI[r.kind], "status": r.status, "status_vi": STATUS_VI.get(r.status, r.status),
         "tree_id": str(r.tree_id), "tree_name": (tree.nickname if tree else None) or "Cây", "job_id": str(r.job_id) if r.job_id else None,
         "start_date": r.start_date.isoformat() if r.start_date else None, "end_date": r.end_date.isoformat() if r.end_date else None,
         "note": r.note, "owner": _display(owner), "nursery": _display(nursery), "nursery_slug": nursery.public_slug if nursery else None,
         "role": "owner" if viewer.id == r.owner_id else "nursery",
         "contact_phone": (nursery.phone if viewer.id == r.owner_id else owner.phone) if r.status in ("active", "done") and owner and nursery else None,
         "created_at": r.created_at.isoformat()}
    if updates:
        rows = db.execute(select(CareUpdate).where(CareUpdate.request_id == r.id).order_by(CareUpdate.created_at.desc())).scalars()
        d["updates"] = [{"id": u.id, "note": u.note, "at": u.created_at.isoformat(),
                         "photo_url": storage.presign_get(u.photo_key) if u.photo_key else None} for u in rows]
    return d


@router.post("/care-requests", status_code=status.HTTP_201_CREATED)
def create(body: CareIn, db: DB, user: CurrentUser):
    tree = db.get(Tree, body.tree_id)
    if tree is None or tree.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy cây.")
    nursery = db.execute(select(User).where(User.public_slug == body.nursery_slug.lower(), User.role == UserRole.nursery,
                                            User.deleted_at.is_(None))).scalar_one_or_none()
    if nursery is None or nursery.id == user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy nhà vườn.")
    if body.job_id:
        job = db.get(DesignJob, body.job_id)
        if job is None or job.tree_id != tree.id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy lộ trình.")
    busy = db.execute(select(CareRequest.id).where(CareRequest.tree_id == tree.id, CareRequest.status.in_(["requested", "active"]))).first()
    if busy:
        raise HTTPException(status.HTTP_409_CONFLICT, "Cây này đang có yêu cầu chăm hộ / nuôi hộ.")
    r = CareRequest(kind=body.kind, owner_id=user.id, nursery_id=nursery.id, tree_id=tree.id, job_id=body.job_id,
                    start_date=body.start_date, end_date=body.end_date, note=(body.note or "").strip() or None)
    db.add(r)
    db.commit()
    notify(nursery.id, "care_new", f"Yêu cầu {KIND_VI[r.kind].lower()} mới", f"{_display(user)} muốn gửi cây cho vườn bạn.", f"/cham-ho/{r.id}")
    return _out(db, r, viewer=user)


@router.get("/care-requests")
def mine(db: DB, user: CurrentUser):
    rows = db.execute(select(CareRequest).where(or_(CareRequest.owner_id == user.id, CareRequest.nursery_id == user.id))
                      .order_by(CareRequest.created_at.desc()).limit(100)).scalars()
    return [_out(db, r, viewer=user) for r in rows]


def _party(db, request_id: uuid.UUID, user: User) -> CareRequest:
    r = db.get(CareRequest, request_id)
    if r is None or user.id not in (r.owner_id, r.nursery_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy yêu cầu.")
    return r


@router.get("/care-requests/{request_id}")
def detail(request_id: uuid.UUID, db: DB, user: CurrentUser):
    return _out(db, _party(db, request_id, user), viewer=user, updates=True)


class ActionIn(BaseModel):
    action: Literal["accept", "decline", "done", "cancel"]


@router.post("/care-requests/{request_id}/action")
def act(request_id: uuid.UUID, body: ActionIn, db: DB, user: CurrentUser):
    r = _party(db, request_id, user)
    nursery_side = user.id == r.nursery_id
    allowed = {("accept", "requested", True): "active", ("decline", "requested", True): "declined",
               ("done", "active", True): "done", ("done", "active", False): "done", ("cancel", "requested", False): "declined"}
    nxt = allowed.get((body.action, r.status, nursery_side))
    if nxt is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Không đổi được trạng thái này.")
    r.status = nxt
    db.commit()
    other = r.owner_id if nursery_side else r.nursery_id
    notify(other, f"care_{body.action}", f"{KIND_VI[r.kind]}: {STATUS_VI[nxt].lower()}", f"{_display(user)} đã cập nhật yêu cầu.", f"/cham-ho/{r.id}")
    return _out(db, r, viewer=user)


class UpdateIn(BaseModel):
    note: str | None = Field(default=None, max_length=1000)
    photo_key: str | None = None


@router.post("/care-requests/{request_id}/updates", status_code=status.HTTP_201_CREATED)
def post_update(request_id: uuid.UUID, body: UpdateIn, db: DB, user: CurrentUser):
    """Nhà vườn gửi ảnh / ghi chú. Ảnh được làm sạch (xóa GPS) rồi thêm vào nhật ký cây của chủ (không tính thưởng mốc)."""
    r = _party(db, request_id, user)
    if user.id != r.nursery_id or r.status != "active":
        raise HTTPException(status.HTTP_409_CONFLICT, "Chỉ nhà vườn gửi ảnh khi đang chăm.")
    if not body.photo_key and not (body.note or "").strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cần ảnh hoặc ghi chú.")
    n = db.execute(select(func.count()).select_from(CareUpdate).where(CareUpdate.request_id == r.id)).scalar_one()
    if n >= MAX_UPDATES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Đã đủ số lần cập nhật.")
    key = None
    if body.photo_key:
        if not body.photo_key.startswith(upload_prefix(user.id)):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Ảnh không hợp lệ.")
        try:
            img = prepare_upload(storage.get_bytes(body.photo_key))
        except InvalidImageError as e:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Ảnh không đọc được.") from e
        key = f"trees/{r.tree_id}/care/{r.id}/{n + 1}.webp"
        storage.put_bytes(key, img.data, img.media_type)
        try:
            storage.delete(body.photo_key)
        except Exception:  # noqa: BLE001
            pass
        db.add(TreePhoto(tree_id=r.tree_id, storage_key=key, width=img.width, height=img.height, view_index=1000 + n,
                         is_front=False, source=PhotoSource.progress, taken_at=datetime.now(UTC)))
    u = CareUpdate(request_id=r.id, author_id=user.id, photo_key=key, note=(body.note or "").strip() or None)
    db.add(u)
    db.commit()
    notify(r.owner_id, "care_update", f"Ảnh mới từ {_display(user)}", (u.note or "Cây của bạn có ảnh cập nhật.")[:120], f"/cham-ho/{r.id}")
    return {"id": u.id, "photo_url": storage.presign_get(key) if key else None, "note": u.note, "at": u.created_at.isoformat()}
