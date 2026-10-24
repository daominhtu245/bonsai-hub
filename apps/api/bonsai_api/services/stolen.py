"""Dò cây báo mất (docs/ideas.md F7): so "dấu vân thân" ảnh tin đăng với ảnh phôi của các cây đang báo mất."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import storage
from ..db.models import Tree, TreePhoto


def stolen_matches(db: Session, photo: bytes, exclude_user=None) -> list[Tree]:
    """Cây đang báo mất có dấu vân thân gần ảnh này. Chỉ để gợi ý cho chủ cây xem lại bằng mắt."""
    from bonsai_pipeline.trunk_print import fingerprint, is_match

    target = fingerprint(photo)
    out = []
    q = select(Tree).where(Tree.stolen_at.is_not(None))
    if exclude_user is not None:
        q = q.where(Tree.user_id != exclude_user)  # người bán chính là chủ cây: bỏ qua
    for tree in db.execute(q).scalars():
        front = db.execute(select(TreePhoto).where(TreePhoto.tree_id == tree.id, TreePhoto.is_front.is_(True),
                                                   ~TreePhoto.storage_key.startswith("uploads/"))).scalars().first()
        if front is None:
            continue
        try:
            if is_match(fingerprint(storage.get_bytes(front.storage_key)), target):
                out.append(tree)
        except Exception:  # noqa: BLE001 — ảnh hỏng / đã xóa: bỏ qua
            continue
    return out
