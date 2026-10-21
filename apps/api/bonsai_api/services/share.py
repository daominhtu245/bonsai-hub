"""Chia sẻ (màn 07): ảnh ghép 9:16 / 1:1 phía server + link công khai /s/{code}."""

from __future__ import annotations

import secrets

from sqlalchemy import select
from sqlalchemy.orm import Session

from bonsai_pipeline.share_card import compose, share_footer, share_title

from .. import storage
from ..db.models import DesignJob, RenderImage, Species, Tree, TreePhoto, User, UserRole

FORMATS = ("9x16", "1x1")
_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"  # bỏ ký tự dễ nhầm


def new_code(n: int = 8) -> str:
    return "".join(secrets.choice(_ALPHABET) for _ in range(n))


def can_brand(user: User) -> bool:
    return user.role in (UserRole.nursery, UserRole.admin) and bool(user.garden_name or user.phone)


def share_key(job: DesignJob, fmt: str, branded: bool) -> str:
    return f"trees/{job.tree_id}/jobs/{job.id}/share_{fmt}{'_brand' if branded else ''}.jpg"


def ensure_share(db: Session, job: DesignJob, owner: User, *, branded: bool) -> dict[str, str]:
    """Tạo (một lần) mã chia sẻ và ảnh ghép; trả key ảnh theo định dạng."""
    if job.share_code is None:
        job.share_code = new_code()
        db.commit()
    branded = branded and can_brand(owner)
    keys = {fmt: share_key(job, fmt, branded) for fmt in FORMATS}
    if all(storage.head(k) for k in keys.values()):
        return keys

    tree = db.get(Tree, job.tree_id)
    species = db.get(Species, tree.species_key) if tree.species_key else None
    front = db.get(TreePhoto, job.front_photo_id)
    final = db.execute(
        select(RenderImage).where(RenderImage.job_id == job.id, RenderImage.stage_code == "S4", RenderImage.selected)
    ).scalar_one()
    years = (job.progress or {}).get("result", {}).get("years")
    before, after = storage.get_bytes(front.storage_key), storage.get_bytes(final.storage_key)
    footer = share_footer(owner.garden_name, owner.phone) if branded else share_footer(None, None)
    for fmt, key in keys.items():
        img = compose(before, after, fmt=fmt, title=share_title(species.name_vi if species else None, tree.real_height_cm, years),
                      before_label="Hôm nay", after_label=f"Minh họa sau ~{years} năm" if years else "Minh họa", footer=footer)
        storage.put_bytes(key, img, "image/jpeg")
    return keys


def public_keys(job: DesignJob) -> dict[str, str]:
    """Ảnh hiển thị ở trang công khai: ưu tiên bản có thương hiệu nếu chủ cây đã tạo."""
    out = {}
    for fmt in FORMATS:
        branded = share_key(job, fmt, True)
        out[fmt] = branded if storage.head(branded) else share_key(job, fmt, False)
    return out
