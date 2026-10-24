"""Chợ phôi / cây (docs/ideas.md C1–C4, C7, C9): tin đăng kèm dáng tương lai, gói nhà vườn tháng, chậu đối tác,
chỉ số giá. Chỉ kết nối người mua – người bán (liên hệ Zalo / điện thoại), **không** giữ tiền (C4)."""

from __future__ import annotations

import secrets
import statistics
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import storage
from ..db.models import DesignJob, DesignOption, JobStatus, Listing, PartnerPot, RenderImage, Style, User
from .ops import get_ops

ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
KINDS = {"phoi": "Phôi", "cay": "Cây thành phẩm", "nuoi_ho": "Bán kèm nuôi hộ"}
STATUSES = ("active", "sold", "hidden")
MIN_SAMPLES = 5  # chỉ số giá: ít hơn thì không công bố (tránh lộ giá một người bán)


def plan_active(user: User | None) -> bool:
    return bool(user and user.nursery_until and user.nursery_until > datetime.now(UTC))


def new_code() -> str:
    return "".join(secrets.choice(ALPHABET) for _ in range(8))


def active_count(db: Session, user: User) -> int:
    return db.execute(select(func.count()).select_from(Listing).where(Listing.user_id == user.id, Listing.status == "active")).scalar_one()


def can_activate(db: Session, user: User) -> bool:
    """Chưa có gói tháng: tối đa `nursery_listing_free` tin đang hiện."""
    return plan_active(user) or active_count(db, user) < int(get_ops(db).get("nursery_listing_free") or 0)


def featured_count(db: Session, user: User) -> int:
    return db.execute(select(func.count()).select_from(Listing).where(
        Listing.user_id == user.id, Listing.featured_until > datetime.now(UTC))).scalar_one()


def previews(db: Session, listing: Listing) -> list[dict]:
    """2–3 dáng tương lai cho tin đăng: ảnh S4 nếu đã tạo + bản vẽ các phương án AI (miễn phí từ phiên A)."""
    if listing.job_id is None:
        return []
    job = db.get(DesignJob, listing.job_id)
    if job is None:
        return []
    out = []
    if job.status == JobStatus.done:
        img = db.execute(select(RenderImage).where(RenderImage.job_id == job.id, RenderImage.stage_code == "S4",
                                                   RenderImage.selected.is_(True)).order_by(RenderImage.attempt.desc())).scalars().first()
        opt = db.get(DesignOption, job.chosen_option_id) if job.chosen_option_id else None
        if img:
            style = db.get(Style, opt.style_key) if opt else None
            out.append({"kind": "render", "style_vi": style.name_vi if style else None, "url": storage.presign_get(img.storage_key)})
    for o in db.execute(select(DesignOption).where(DesignOption.job_id == job.id, DesignOption.sketch_png_key.is_not(None))
                        .order_by(DesignOption.rank)).scalars():
        if (o.design or {}).get("source", "ai") != "ai" or len(out) >= 3:
            continue
        style = db.get(Style, o.style_key)
        out.append({"kind": "sketch", "style_vi": style.name_vi if style else o.style_key, "url": storage.presign_get(o.sketch_png_key)})
    return out


def price_index(db: Session, species_key: str | None = None) -> list[dict]:
    """Giá theo cm gốc, theo loài (và theo vùng nếu đủ mẫu), từ tin đang bán / đã bán."""
    from .provinces import region_of

    q = select(Listing.species_key, Listing.province, Listing.price_vnd, Listing.trunk_cm).where(
        Listing.price_vnd.is_not(None), Listing.trunk_cm > 0, Listing.species_key.is_not(None), Listing.status.in_(["active", "sold"]))
    if species_key:
        q = q.where(Listing.species_key == species_key)
    groups: dict[tuple[str, str | None], list[float]] = {}
    for sp, prov, price, trunk in db.execute(q).all():
        per_cm = float(price) / float(trunk)
        groups.setdefault((sp, None), []).append(per_cm)
        if prov:
            groups.setdefault((sp, region_of(prov)), []).append(per_cm)
    out = []
    for (sp, region), vals in sorted(groups.items(), key=lambda kv: (kv[0][0], kv[0][1] or "")):
        if len(vals) < MIN_SAMPLES:
            continue
        q1, med, q3 = statistics.quantiles(vals, n=4) if len(vals) >= 2 else (vals[0], vals[0], vals[0])
        out.append({"species_key": sp, "region": region, "samples": len(vals), "per_cm_median": round(med, -3),
                    "per_cm_low": round(q1, -3), "per_cm_high": round(q3, -3)})
    return out


# ---------- C7: chậu đối tác ----------

POT_SHAPE_OK = {  # dáng chậu thiết kế → chậu đối tác hợp
    "rectangle": {"rectangle"}, "oval": {"oval", "round"}, "round": {"round", "oval"}, "cascade_deep": {"cascade_deep"},
}


def suggest_pots(db: Session, shape: str, color: str | None, tree_height_cm: float | None, limit: int = 4) -> list[PartnerPot]:
    """Cùng dáng, ưu tiên cùng màu và dài ≈ 2/3 chiều cao cây (rule_set.proportions.pot_length_to_tree_height)."""
    from bonsai_pipeline.dictionaries import rule_set

    lo, hi = (rule_set().get("proportions") or {}).get("pot_length_to_tree_height", [0.6, 0.75])
    target = (lo + hi) / 2 * tree_height_cm if tree_height_cm else None
    pots = db.execute(select(PartnerPot).where(PartnerPot.active.is_(True), PartnerPot.shape.in_(POT_SHAPE_OK.get(shape, {shape})))).scalars().all()

    def score(p: PartnerPot) -> float:
        s = 0.0 if p.shape == shape else 0.5
        s += 0.0 if (color and p.color == color) else 0.3
        if target and p.length_cm:
            s += abs(p.length_cm - target) / target
        return s

    return sorted(pots, key=score)[:limit]
