import uuid

from fastapi import APIRouter, HTTPException, status

from .. import storage
from ..schemas import PresignIn, PresignOut
from ..security import CurrentUser
from ..settings import get_settings

router = APIRouter(prefix="/uploads", tags=["uploads"])

_EXT = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif"}


def upload_prefix(user_id: uuid.UUID) -> str:
    # Ảnh thô (còn EXIF/GPS) nằm ở đây tới khi A0 chuẩn hóa; bucket có lifecycle xóa sau 1 ngày.
    return f"uploads/{user_id}/"


@router.post("/presign", response_model=PresignOut)
def presign(body: PresignIn, user: CurrentUser):
    s = get_settings()
    if body.size_bytes > s.max_upload_bytes:
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, "Ảnh quá lớn (tối đa 20 MB).")
    key = f"{upload_prefix(user.id)}{uuid.uuid4().hex}.{_EXT[body.content_type]}"
    return PresignOut(
        key=key,
        url=storage.presign_put(key, body.content_type),
        headers={"Content-Type": body.content_type},
        expires_in=s.presign_ttl_seconds,
    )
