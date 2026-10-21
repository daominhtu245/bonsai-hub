import uuid
from html import escape

from fastapi import APIRouter, HTTPException, Response, status
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from sqlalchemy import select

from .. import storage
from ..db.models import DesignJob, JobStatus, Species, Tree
from ..security import DB, CurrentUser
from ..services.share import can_brand, ensure_share, public_keys
from ..settings import get_settings

router = APIRouter(tags=["share"])
page_router = APIRouter(include_in_schema=False)


class ShareIn(BaseModel):
    branded: bool = False


class ShareOut(BaseModel):
    code: str
    url: str
    images: dict[str, str]
    can_brand: bool


def _public_job(db, code: str) -> DesignJob:
    job = db.execute(select(DesignJob).where(DesignJob.share_code == code)).scalar_one_or_none()
    if job is None or job.status != JobStatus.done:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy trang chia sẻ.")
    return job


@router.post("/jobs/{job_id}/share", response_model=ShareOut)
def create_share(job_id: uuid.UUID, body: ShareIn, user: CurrentUser, db: DB):
    job = db.get(DesignJob, job_id)
    if job is None or job.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy phiên thiết kế.")
    if job.status != JobStatus.done:
        raise HTTPException(status.HTTP_409_CONFLICT, "Ảnh kết quả chưa xong.")
    keys = ensure_share(db, job, user, branded=body.branded)
    base = get_settings().public_base_url.rstrip("/")
    return ShareOut(code=job.share_code, url=f"{base}/s/{job.share_code}",
                    images={fmt: storage.presign_get(k) for fmt, k in keys.items()}, can_brand=can_brand(user))


@router.get("/public/shares/{code}/{fmt}.jpg")
def share_image(code: str, fmt: str, db: DB):
    if fmt not in ("9x16", "1x1"):
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    job = _public_job(db, code)
    key = public_keys(job)[fmt]
    if not storage.head(key):
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    return Response(storage.get_bytes(key), media_type="image/jpeg",
                    headers={"Cache-Control": "public, max-age=86400"})


@page_router.get("/s/{code}", response_class=HTMLResponse)
def share_page(code: str, db: DB):
    """Trang công khai: nhẹ, render phía server để Zalo/Facebook đọc được thẻ OG."""
    job = _public_job(db, code)
    tree = db.get(Tree, job.tree_id)
    species = db.get(Species, tree.species_key) if tree.species_key else None
    base = get_settings().public_base_url.rstrip("/")
    img = f"{base}/api/v1/public/shares/{code}/1x1.jpg"
    tall = f"/api/v1/public/shares/{code}/9x16.jpg"
    title = escape(f"Phôi {species.name_vi.lower() if species else 'bonsai'} — dáng cây sau vài năm")
    desc = "Bản vẽ thiết kế và lộ trình chăm theo từng giai đoạn, tạo bởi Bonsai AI. Ảnh là minh họa định hướng."
    html = f"""<!doctype html><html lang="vi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<meta property="og:title" content="{title}"><meta property="og:description" content="{desc}">
<meta property="og:image" content="{img}"><meta property="og:image:width" content="1080"><meta property="og:image:height" content="1080">
<meta property="og:type" content="website"><meta property="og:url" content="{base}/s/{escape(code)}">
<meta name="twitter:card" content="summary_large_image">
<style>
:root{{--bg:#F4EFE6;--surface:#FBF8F2;--ink:#1F2421;--muted:#5E625C;--primary:#3F5B3A;--on:#FBF8F2;--line:#E3DCCD}}
@media (prefers-color-scheme:dark){{:root{{--bg:#141815;--surface:#1E2420;--ink:#ECE7DD;--muted:#A7A99F;--primary:#8DB07F;--on:#141815;--line:#2F3631}}}}
body{{margin:0;background:var(--bg);color:var(--ink);font:17px/1.5 'Be Vietnam Pro',system-ui,sans-serif}}
main{{max-width:560px;margin:0 auto;padding:16px;display:flex;flex-direction:column;gap:16px}}
img{{width:100%;border-radius:12px;border:1px solid var(--line);display:block}}
a.cta{{display:flex;align-items:center;justify-content:center;min-height:52px;border-radius:10px;background:var(--primary);color:var(--on);font-weight:600;text-decoration:none}}
p{{margin:0;color:var(--muted);font-size:14px}}
</style></head><body><main>
<img src="{tall}" alt="Ảnh phôi hôm nay và minh họa cây sau vài năm tạo dáng">
<a class="cta" href="{base}/">Chụp phôi của bạn — miễn phí</a>
<p>{desc}</p>
</main></body></html>"""
    return HTMLResponse(html, headers={"Cache-Control": "public, max-age=300"})
