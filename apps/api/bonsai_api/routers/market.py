"""Chợ phôi / cây (docs/ideas.md C1–C4, C7, C9). Không giữ tiền: người mua liên hệ người bán qua Zalo / điện thoại."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import or_, select, update

from bonsai_pipeline.preprocess import InvalidImageError, prepare_upload

from .. import queue, storage
from ..db.models import DesignJob, DesignOption, Listing, PartnerPot, Species, Tree, TreePhoto, User
from ..security import DB, CurrentUser, require_admin
from ..services import market
from ..services.audit import audit
from ..services.ops import get_ops
from ..services.provinces import PROVINCES
from ..settings import get_settings
from .passport import qr_svg
from .uploads import upload_prefix

router = APIRouter(tags=["market"])
Admin = Annotated[User, Depends(require_admin)]
Kind = Literal["phoi", "cay", "nuoi_ho"]


def listing_url(code: str) -> str:
    return f"{get_settings().public_base_url.rstrip('/')}/tin/{code}"


class ListingIn(BaseModel):
    title: str = Field(min_length=3, max_length=160)
    description: str | None = Field(default=None, max_length=3000)
    species_key: str | None = None
    kind: Kind = "phoi"
    price_vnd: int | None = Field(default=None, ge=0, le=10_000_000_000)
    height_cm: float | None = Field(default=None, gt=0, le=1000)
    trunk_cm: float | None = Field(default=None, gt=0, le=300)
    province: str | None = None
    contact_phone: str | None = Field(default=None, max_length=32)
    tree_id: uuid.UUID | None = None
    job_id: uuid.UUID | None = None
    photo_key: str | None = None  # ảnh tải mới (uploads/…); bỏ trống thì dùng ảnh phôi của cây


class ListingPatch(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=160)
    description: str | None = Field(default=None, max_length=3000)
    price_vnd: int | None = Field(default=None, ge=0, le=10_000_000_000)
    status: Literal["active", "sold", "hidden"] | None = None
    featured: bool | None = None
    contact_phone: str | None = Field(default=None, max_length=32)


def _check_refs(db, user: User, body: ListingIn) -> None:
    if body.species_key and db.get(Species, body.species_key) is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Loài không hợp lệ.")
    if body.province and body.province not in PROVINCES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Tỉnh, thành không hợp lệ.")
    if body.tree_id:
        tree = db.get(Tree, body.tree_id)
        if tree is None or tree.user_id != user.id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy cây.")
        if tree.stolen_at is not None:
            raise HTTPException(status.HTTP_409_CONFLICT, "Cây đang báo mất.")
    if body.job_id:
        job = db.get(DesignJob, body.job_id)
        if job is None or job.user_id != user.id or (body.tree_id and job.tree_id != body.tree_id):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy phiên thiết kế.")


def _photo(db, user: User, body: ListingIn, listing_id: uuid.UUID) -> str | None:
    if body.photo_key:
        if not body.photo_key.startswith(upload_prefix(user.id)):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Ảnh không hợp lệ.")
        try:
            img = prepare_upload(storage.get_bytes(body.photo_key))  # xóa EXIF / GPS, cạnh dài 1536
        except InvalidImageError as e:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Ảnh không đọc được.") from e
        key = f"listings/{listing_id}/photo.webp"
        storage.put_bytes(key, img.data, img.media_type)
        try:
            storage.delete(body.photo_key)
        except Exception:  # noqa: BLE001 — ảnh thô tự xóa theo lifecycle
            pass
        return key
    tree_id = body.tree_id or (db.get(DesignJob, body.job_id).tree_id if body.job_id else None)
    if tree_id:
        front = db.execute(select(TreePhoto).where(TreePhoto.tree_id == tree_id, TreePhoto.is_front.is_(True),
                                                   ~TreePhoto.storage_key.startswith("uploads/"))).scalars().first()
        return front.storage_key if front else None
    return None


def _out(db, x: Listing, *, public: bool = False) -> dict:
    owner = db.get(User, x.user_id)
    species = db.get(Species, x.species_key) if x.species_key else None
    d = {
        "id": str(x.id), "code": x.code, "url": listing_url(x.code), "title": x.title, "description": x.description,
        "species_key": x.species_key, "species_vi": species.name_vi if species else None, "kind": x.kind,
        "price_vnd": x.price_vnd, "height_cm": x.height_cm, "trunk_cm": x.trunk_cm, "province": x.province,
        "province_vi": PROVINCES[x.province][0] if x.province in PROVINCES else None,
        "contact_phone": x.contact_phone or (owner.phone if owner else None), "status": x.status,
        "featured": bool(x.featured_until and x.featured_until > datetime.now(UTC)),
        "photo_url": storage.presign_get(x.photo_key) if x.photo_key else None, "views": x.views,
        "seller": (owner.garden_name or (owner.name or "Người bán").split()[-1]) if owner else "Người bán",
        "seller_slug": owner.public_slug if owner else None,
        "created_at": x.created_at.isoformat(),
    }
    if public:
        d["previews"] = market.previews(db, x)
    else:
        d["job_id"], d["tree_id"] = (str(x.job_id) if x.job_id else None), (str(x.tree_id) if x.tree_id else None)
    return d


# ---------- tin của tôi ----------


@router.get("/me/listings")
def my_listings(db: DB, user: CurrentUser):
    rows = db.execute(select(Listing).where(Listing.user_id == user.id).order_by(Listing.created_at.desc())).scalars()
    ops = get_ops(db)
    return {"plan_until": user.nursery_until.isoformat() if market.plan_active(user) else None,
            "free_active": int(ops.get("nursery_listing_free") or 0), "featured_max": int(ops.get("nursery_featured_max") or 0),
            "items": [_out(db, x) for x in rows]}


@router.post("/listings", status_code=status.HTTP_201_CREATED)
def create_listing(body: ListingIn, db: DB, user: CurrentUser):
    _check_refs(db, user, body)
    if not market.can_activate(db, user):
        raise HTTPException(status.HTTP_402_PAYMENT_REQUIRED, "Bạn đã đăng đủ số tin miễn phí. Ẩn bớt tin hoặc mua gói Nhà vườn tháng.")
    x = Listing(user_id=user.id, code=market.new_code(), **body.model_dump(exclude={"photo_key"}))
    x.id = uuid.uuid4()
    x.photo_key = _photo(db, user, body, x.id)
    db.add(x)
    db.commit()
    if x.photo_key:
        queue.enqueue("bonsai_worker.tasks.market.listing_created", str(x.id))  # dò cây báo mất (F7)
    return _out(db, x)


def _mine(db, listing_id: uuid.UUID, user: User) -> Listing:
    x = db.get(Listing, listing_id)
    if x is None or x.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy tin đăng.")
    return x


@router.patch("/listings/{listing_id}")
def patch_listing(listing_id: uuid.UUID, body: ListingPatch, db: DB, user: CurrentUser):
    x = _mine(db, listing_id, user)
    data = body.model_dump(exclude_unset=True)
    if data.get("status") == "active" and x.status != "active" and not market.can_activate(db, user):
        raise HTTPException(status.HTTP_402_PAYMENT_REQUIRED, "Bạn đã đăng đủ số tin miễn phí. Ẩn bớt tin hoặc mua gói Nhà vườn tháng.")
    featured = data.pop("featured", None)
    if featured is True:
        if not market.plan_active(user):
            raise HTTPException(status.HTTP_402_PAYMENT_REQUIRED, "Tin nổi bật dành cho gói Nhà vườn tháng.")
        if not (x.featured_until and x.featured_until > datetime.now(UTC)) and \
                market.featured_count(db, user) >= int(get_ops(db).get("nursery_featured_max") or 0):
            raise HTTPException(status.HTTP_409_CONFLICT, "Đã đủ số tin nổi bật. Bỏ nổi bật một tin khác trước.")
        x.featured_until = user.nursery_until
    elif featured is False:
        x.featured_until = None
    for k, v in data.items():
        setattr(x, k, v)
    db.commit()
    return _out(db, x)


@router.delete("/listings/{listing_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_listing(listing_id: uuid.UUID, db: DB, user: CurrentUser):
    x = _mine(db, listing_id, user)
    if x.photo_key and x.photo_key.startswith("listings/"):
        try:
            storage.delete(x.photo_key)
        except Exception:  # noqa: BLE001
            pass
    db.delete(x)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------- công khai: chợ, trang tin, thẻ QR, chỉ số giá ----------


@router.get("/public/listings")
def browse(db: DB, species: str | None = None, province: str | None = None, kind: Kind | None = None,
           q: str | None = Query(default=None, max_length=80), offset: int = Query(default=0, ge=0), limit: int = Query(default=20, ge=1, le=50)):
    now = datetime.now(UTC)
    stmt = select(Listing).where(Listing.status == "active")
    if species:
        stmt = stmt.where(Listing.species_key == species)
    if province:
        stmt = stmt.where(Listing.province == province)
    if kind:
        stmt = stmt.where(Listing.kind == kind)
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(Listing.title.ilike(like), Listing.description.ilike(like)))
    stmt = stmt.order_by((Listing.featured_until > now).desc().nulls_last(), Listing.created_at.desc()).offset(offset).limit(limit)
    return [_out(db, x) for x in db.execute(stmt).scalars()]


def _public(db, code: str) -> Listing:
    x = db.execute(select(Listing).where(Listing.code == code.upper())).scalar_one_or_none()
    if x is None or x.status == "hidden":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy tin đăng.")
    return x


@router.get("/public/listings/{code}")
def public_listing(code: str, db: DB):
    x = _public(db, code)
    db.execute(update(Listing).where(Listing.id == x.id).values(views=Listing.views + 1))
    db.commit()
    db.refresh(x)
    return _out(db, x, public=True)


@router.get("/public/listings/{code}/qr.svg")
def listing_qr(code: str, db: DB):
    x = _public(db, code)
    return Response(qr_svg(listing_url(x.code)), media_type="image/svg+xml", headers={"Cache-Control": "public, max-age=86400"})


@router.get("/public/price-index")
def public_price_index(db: DB, species: str | None = None):
    names = {s.key: s.name_vi for s in db.execute(select(Species)).scalars()}
    return [{**r, "species_vi": names.get(r["species_key"], r["species_key"])} for r in market.price_index(db, species)]


# ---------- C7: chậu đối tác ----------


@router.get("/jobs/{job_id}/pots")
def pots_for_job(job_id: uuid.UUID, db: DB, user: CurrentUser):
    job = db.get(DesignJob, job_id)
    if job is None or job.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy phiên thiết kế.")
    oid = job.chosen_option_id
    opt = db.get(DesignOption, oid) if oid else db.execute(select(DesignOption).where(DesignOption.job_id == job.id)
                                                           .order_by(DesignOption.rank)).scalars().first()
    pot = (opt.design or {}).get("pot") if opt else None
    if not pot:
        return []
    tree = db.get(Tree, job.tree_id)
    return [_pot_out(p) for p in market.suggest_pots(db, pot.get("shape", "oval"), pot.get("color"), tree.real_height_cm if tree else None)]


def _pot_out(p: PartnerPot) -> dict:
    return {"id": p.id, "name": p.name, "maker": p.maker, "shape": p.shape, "color": p.color, "length_cm": p.length_cm,
            "price_vnd": p.price_vnd, "url": p.url, "image_url": p.image_url, "active": p.active}


class PotIn(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    maker: str | None = Field(default=None, max_length=120)
    shape: Literal["rectangle", "oval", "round", "cascade_deep"]
    color: str | None = Field(default=None, max_length=32)
    length_cm: float | None = Field(default=None, gt=0, le=300)
    price_vnd: int | None = Field(default=None, ge=0)
    url: str | None = Field(default=None, max_length=500, pattern=r"^https://")
    image_url: str | None = Field(default=None, max_length=500, pattern=r"^https://")
    active: bool = True


@router.get("/admin/partner-pots")
def admin_pots(db: DB, admin: Admin):
    return [_pot_out(p) for p in db.execute(select(PartnerPot).order_by(PartnerPot.id.desc())).scalars()]


@router.post("/admin/partner-pots", status_code=status.HTTP_201_CREATED)
def admin_create_pot(body: PotIn, db: DB, admin: Admin):
    p = PartnerPot(**body.model_dump())
    db.add(p)
    db.flush()
    audit(db, admin, "partner_pot.create", "partner_pot", p.id, name=p.name)
    db.commit()
    return _pot_out(p)


@router.put("/admin/partner-pots/{pot_id}")
def admin_update_pot(pot_id: int, body: PotIn, db: DB, admin: Admin):
    p = db.get(PartnerPot, pot_id)
    if p is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy chậu.")
    for k, v in body.model_dump().items():
        setattr(p, k, v)
    audit(db, admin, "partner_pot.update", "partner_pot", p.id, name=p.name)
    db.commit()
    return _pot_out(p)


@router.delete("/admin/partner-pots/{pot_id}", status_code=status.HTTP_204_NO_CONTENT)
def admin_delete_pot(pot_id: int, db: DB, admin: Admin):
    p = db.get(PartnerPot, pot_id)
    if p is not None:
        audit(db, admin, "partner_pot.delete", "partner_pot", p.id, name=p.name)
        db.delete(p)
        db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
