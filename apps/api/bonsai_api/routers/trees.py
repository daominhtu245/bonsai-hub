import uuid

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from .. import queue, storage
from ..db.models import Species, Tree, TreePhoto
from ..schemas import PhotoOut, TreeCreate, TreeOut
from ..security import DB, CurrentUser
from .uploads import upload_prefix

router = APIRouter(prefix="/trees", tags=["trees"])


def _out(tree: Tree, with_urls: bool) -> TreeOut:
    out = TreeOut.model_validate(tree)
    if with_urls:
        out.photos = [
            PhotoOut(id=p.id, view_index=p.view_index, is_front=p.is_front, url=storage.presign_get(p.storage_key))
            for p in tree.photos
        ]
    return out


@router.post("", response_model=TreeOut, status_code=status.HTTP_201_CREATED)
def create_tree(body: TreeCreate, user: CurrentUser, db: DB):
    prefix = upload_prefix(user.id)
    if any(not p.key.startswith(prefix) or ".." in p.key for p in body.photos):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Ảnh không thuộc tài khoản của bạn.")
    if len({p.view_index for p in body.photos}) != len(body.photos):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Mỗi mặt cây chỉ một ảnh.")
    if body.species_key and db.get(Species, body.species_key) is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Loài cây không có trong danh sách.")

    fronts = [p for p in body.photos if p.is_front]
    front_index = fronts[0].view_index if fronts else min(p.view_index for p in body.photos)
    tree = Tree(user_id=user.id, nickname=body.nickname, species_key=body.species_key,
                real_height_cm=body.real_height_cm)
    tree.photos = [
        TreePhoto(storage_key=p.key, view_index=p.view_index, is_front=p.view_index == front_index)
        for p in sorted(body.photos, key=lambda p: p.view_index)
    ]
    db.add(tree)
    db.commit()
    db.refresh(tree)
    queue.enqueue("bonsai_worker.tasks.preprocess.normalize_tree_photos", str(tree.id))
    return _out(tree, with_urls=False)


@router.get("", response_model=list[TreeOut])
def list_trees(user: CurrentUser, db: DB):
    trees = db.execute(
        select(Tree).where(Tree.user_id == user.id).options(selectinload(Tree.photos)).order_by(Tree.created_at.desc())
    ).scalars()
    return [_out(t, with_urls=True) for t in trees]


@router.get("/{tree_id}", response_model=TreeOut)
def get_tree(tree_id: uuid.UUID, user: CurrentUser, db: DB):
    tree = db.get(Tree, tree_id, options=[selectinload(Tree.photos)])
    if tree is None or tree.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy cây.")
    return _out(tree, with_urls=True)


@router.delete("/{tree_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_tree(tree_id: uuid.UUID, user: CurrentUser, db: DB):
    """Xóa cây cùng ảnh, phiên thiết kế, ảnh sinh (R2). Sổ lượt và thanh toán giữ lại để đối soát."""
    tree = db.get(Tree, tree_id)
    if tree is None or tree.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy cây.")
    raw_keys = [p.storage_key for p in tree.photos if p.storage_key.startswith("uploads/")]
    db.delete(tree)  # cascade: tree_photos, design_jobs → options, stages, render_images, feedback…
    db.commit()
    storage.delete_prefix(f"trees/{tree_id}/")
    for key in raw_keys:
        storage.delete(key)
