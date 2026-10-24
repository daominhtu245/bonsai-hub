"""Dấu vân thân (docs/ideas.md F7): mã ngắn mô tả hình dáng thân để dò ảnh tin đăng mới có thể là cây đã báo mất.

Chỉ là gợi ý (cùng góc chụp mới khớp tốt) — kết quả gửi cho chủ cây / quản trị xem bằng mắt, không tự kết luận.
Mã = dHash 16×16 trên vùng thân (nửa dưới, giữa ảnh hoặc theo khung thân P1) + hướng ngang lật để chịu ảnh lật gương.
"""

from __future__ import annotations

import io

import numpy as np
from PIL import Image, ImageOps

SIZE = 16
MATCH_BITS = 0.25  # ≤ 25% bit khác → có thể trùng (thử 40 ảnh: cùng ảnh chỉnh sáng, cắt, lật ≤ 0,21; khác cây ≥ 0,34)


def _crop(img: Image.Image, trunk_box: tuple[float, float, float, float] | None) -> Image.Image:
    w, h = img.size
    if trunk_box:
        x0, y0, x1, y1 = trunk_box
        pad = 0.15 * max(x1 - x0, y1 - y0)
        return img.crop((max(0, x0 - pad), max(0, y0 - pad), min(w, x1 + pad), min(h, y1 + pad)))
    return img.crop((int(w * 0.2), int(h * 0.4), int(w * 0.8), h))


def _dhash(img: Image.Image) -> int:
    g = np.asarray(ImageOps.autocontrast(ImageOps.grayscale(img)).resize((SIZE + 1, SIZE), Image.Resampling.LANCZOS), np.int16)
    bits = (g[:, 1:] > g[:, :-1]).flatten()
    return int("".join("1" if b else "0" for b in bits), 2)


def fingerprint(photo: bytes, trunk_box: tuple[float, float, float, float] | None = None) -> str:
    """Hex 2×64 ký tự: ảnh thường + ảnh lật gương."""
    img = _crop(Image.open(io.BytesIO(photo)).convert("RGB"), trunk_box)
    n = SIZE * SIZE // 4
    return f"{_dhash(img):0{n}x}{_dhash(ImageOps.mirror(img)):0{n}x}"


def distance(a: str, b: str) -> float:
    """Tỉ lệ bit khác (0 = giống hệt), lấy min giữa thẳng / lật."""
    n = len(a) // 2
    a0 = int(a[:n], 16)
    return min(bin(a0 ^ int(b[:n], 16)).count("1"), bin(a0 ^ int(b[n:], 16)).count("1")) / (n * 4)


def is_match(a: str, b: str) -> bool:
    return distance(a, b) <= MATCH_BITS
