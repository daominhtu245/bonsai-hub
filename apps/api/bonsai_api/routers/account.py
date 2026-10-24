"""Tài khoản người dùng (đơn giản): nhập mã quà tặng, lịch sử lượt, thông báo chung, nhật ký ảnh cây."""

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from .. import queue, storage
from ..db.models import CreditLedger, PhotoSource, Tree, TreePhoto
from ..security import DB, CurrentUser
from ..services.community import diary_reward
from ..services.features import enabled as feature_enabled
from ..services.gift_codes import GiftCodeError, redeem
from ..services.ops import get_ops
from .uploads import upload_prefix

router = APIRouter(tags=["account"])

REASON_VI = {"purchase": "Mua lượt", "render": "Tạo ảnh tương lai", "refund": "Hoàn lượt (lỗi hệ thống)",
             "gift": "Được tặng", "adjust": "Điều chỉnh", "referral": "Giới thiệu bạn", "reward": "Thưởng",
             "consult": "Hỏi nghệ nhân"}


class RedeemIn(BaseModel):
    code: str = Field(min_length=4, max_length=40)


class RedeemOut(BaseModel):
    credits_added: int
    credits: int


@router.post("/me/gift-code", response_model=RedeemOut)
def redeem_code(body: RedeemIn, user: CurrentUser, db: DB):
    try:
        added = redeem(db, user, body.code)
    except GiftCodeError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e)) from e
    db.refresh(user)
    return RedeemOut(credits_added=added, credits=user.credits)


class CreditRow(BaseModel):
    at: datetime
    delta: int
    label: str
    job_id: str | None


@router.get("/me/credits", response_model=list[CreditRow])
def credit_history(user: CurrentUser, db: DB):
    rows = db.execute(select(CreditLedger).where(CreditLedger.user_id == user.id)
                      .order_by(CreditLedger.id.desc()).limit(100)).scalars()
    out = []
    for e in rows:
        ref = e.ref_id or ""
        label = REASON_VI.get(e.reason.value, e.reason.value)
        if ref == "trial":
            label = "Quà chào mừng"
        elif ref.startswith("consult:"):
            label = "Hoàn lượt hỏi nghệ nhân" if e.reason.value == "refund" else "Hỏi nghệ nhân"
        elif ref.startswith("diary:"):
            label = f"Thưởng nhật ký mốc {ref.rsplit(':', 1)[1]} tháng"
        elif ref.startswith("code:"):
            label = f"Mã quà tặng {ref[5:]}"
        job = ref.split("#")[0] if e.reason.value in ("render", "refund") else None
        out.append(CreditRow(at=e.created_at, delta=e.delta, label=label, job_id=job))
    return out


class Announcement(BaseModel):
    text: str
    tone: str


@router.get("/announcement", response_model=Announcement | None)
def announcement(db: DB):
    """Thông báo chung do admin bật (trang chủ). Không cần đăng nhập."""
    a = get_ops(db)["announcement"]
    return Announcement(text=a["text"], tone=a.get("tone", "info")) if a.get("active") and a.get("text") else None


# ---------- nhật ký ảnh cây (ảnh tiến độ theo thời gian) ----------

class ProgressIn(BaseModel):
    key: str


class ProgressPhoto(BaseModel):
    id: uuid.UUID
    url: str | None
    taken_at: datetime
    ready: bool
    reward: int = 0  # lượt được tặng vì chụp đúng mốc 1 / 3 / 6 tháng


def _own_tree(db, tree_id: uuid.UUID, user) -> Tree:
    tree = db.get(Tree, tree_id)
    if tree is None or tree.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy cây.")
    return tree


MAX_PROGRESS = 120


@router.post("/trees/{tree_id}/progress", response_model=ProgressPhoto, status_code=status.HTTP_201_CREATED)
def add_progress(tree_id: uuid.UUID, body: ProgressIn, user: CurrentUser, db: DB):
    tree = _own_tree(db, tree_id, user)
    if not body.key.startswith(upload_prefix(user.id)):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Ảnh không hợp lệ.")
    n = db.execute(select(func.count()).select_from(TreePhoto).where(
        TreePhoto.tree_id == tree.id, TreePhoto.source == PhotoSource.progress)).scalar_one()
    if n >= MAX_PROGRESS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Nhật ký cây đã đầy ảnh. Bạn xóa bớt ảnh cũ nhé.")
    photo = TreePhoto(tree_id=tree.id, storage_key=body.key, view_index=100 + n, is_front=False,
                      source=PhotoSource.progress, taken_at=datetime.now(UTC))
    db.add(photo)
    reward = diary_reward(db, tree, photo.taken_at) if feature_enabled(db, "diary_rewards", user) else 0
    db.commit()
    queue.enqueue("bonsai_worker.tasks.preprocess.normalize_tree_photos", str(tree.id))  # xóa EXIF/GPS, 1536 px
    return ProgressPhoto(id=photo.id, url=None, taken_at=photo.taken_at, ready=False, reward=reward)


@router.get("/trees/{tree_id}/progress", response_model=list[ProgressPhoto])
def list_progress(tree_id: uuid.UUID, user: CurrentUser, db: DB):
    tree = _own_tree(db, tree_id, user)
    rows = db.execute(select(TreePhoto).where(TreePhoto.tree_id == tree.id, TreePhoto.source == PhotoSource.progress)
                      .order_by(TreePhoto.taken_at.desc())).scalars()
    return [ProgressPhoto(id=p.id, taken_at=p.taken_at or p.created_at, ready=not p.storage_key.startswith("uploads/"),
                          url=None if p.storage_key.startswith("uploads/") else storage.presign_get(p.storage_key)) for p in rows]


@router.delete("/trees/{tree_id}/progress/{photo_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_progress(tree_id: uuid.UUID, photo_id: uuid.UUID, user: CurrentUser, db: DB):
    tree = _own_tree(db, tree_id, user)
    photo = db.get(TreePhoto, photo_id)
    if photo is None or photo.tree_id != tree.id or photo.source != PhotoSource.progress:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy ảnh.")
    try:
        storage.delete(photo.storage_key)
    except Exception:  # ảnh thô đã tự xóa theo lifecycle
        pass
    db.delete(photo)
    db.commit()
