"""A0 — tiền xử lý ảnh tải lên: xoay theo EXIF, xóa EXIF/GPS, chuẩn hóa cạnh dài 1536 px, xuất WebP."""

from __future__ import annotations

import io
from dataclasses import dataclass

from PIL import Image, ImageOps, UnidentifiedImageError

try:  # ảnh HEIC từ iPhone
    from pillow_heif import register_heif_opener

    register_heif_opener()
except ImportError:  # pragma: no cover
    pass

LONG_EDGE = 1536
ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP", "MPO", "HEIF"}


class InvalidImageError(ValueError):
    """Ảnh sai định dạng hoặc hỏng — báo ngay cho người dùng."""


@dataclass(frozen=True)
class PreparedImage:
    data: bytes
    width: int
    height: int
    media_type: str = "image/webp"


def prepare_upload(raw: bytes, *, long_edge: int = LONG_EDGE, quality: int = 90) -> PreparedImage:
    try:
        img = Image.open(io.BytesIO(raw))
        img.load()
    except (UnidentifiedImageError, OSError) as e:
        raise InvalidImageError("không đọc được ảnh") from e
    if img.format not in ALLOWED_FORMATS:
        raise InvalidImageError(f"định dạng không hỗ trợ: {img.format}")

    img = ImageOps.exif_transpose(img)
    img = img.convert("RGB")
    w, h = img.size
    scale = long_edge / max(w, h)
    if scale < 1:
        img = img.resize((round(w * scale), round(h * scale)), Image.Resampling.LANCZOS)

    # Tạo ảnh mới từ pixel để chắc chắn không mang theo metadata (EXIF, GPS, XMP, ICC).
    clean = Image.new("RGB", img.size)
    clean.paste(img)
    buf = io.BytesIO()
    clean.save(buf, format="WEBP", quality=quality, method=6)
    return PreparedImage(data=buf.getvalue(), width=clean.width, height=clean.height)
