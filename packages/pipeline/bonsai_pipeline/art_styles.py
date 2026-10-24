"""Chế độ phác họa (docs/ideas.md A1, A2): biến ảnh giai đoạn thành tranh bút chì / thủy mặc, trên máy, không tốn API.

Chỉ dùng Pillow + numpy (chạy được cả ở api). Ảnh không giả làm ảnh chụp → người xem không kỳ vọng sai.
"""

from __future__ import annotations

import io

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageOps

STYLES = ("pencil", "ink")
MAX_EDGE = 1280


def _load(data: bytes) -> Image.Image:
    img = Image.open(io.BytesIO(data)).convert("RGB")
    img.thumbnail((MAX_EDGE, MAX_EDGE), Image.Resampling.LANCZOS)
    return img


def _webp(img: Image.Image) -> bytes:
    buf = io.BytesIO()
    img.save(buf, "WEBP", quality=88)
    return buf.getvalue()


def _paper(size: tuple[int, int], tone: tuple[int, int, int], seed: int = 7) -> np.ndarray:
    """Nền giấy: màu tông nhẹ + vân hạt mịn."""
    rng = np.random.default_rng(seed)
    noise = rng.normal(0, 6, (size[1], size[0], 1))
    base = np.array(tone, np.float32)[None, None, :] + noise
    return np.clip(base, 0, 255)


def pencil(data: bytes) -> bytes:
    """Bút chì: color dodge (xám ÷ (255 − xám đảo mờ)) → nét chì; thêm vân giấy."""
    img = _load(data)
    gray = np.asarray(ImageOps.grayscale(img), np.float32)
    inv_blur = np.asarray(Image.fromarray((255 - gray).astype(np.uint8)).filter(ImageFilter.GaussianBlur(max(2, img.width // 160))), np.float32)
    dodge = np.clip(gray * 255.0 / np.maximum(1.0, 255.0 - inv_blur), 0, 255)
    dodge = 255 - (255 - dodge) * 1.25  # đậm nét hơn chút
    paper = _paper(img.size, (246, 243, 236))
    out = paper * (np.clip(dodge, 0, 255)[..., None] / 255.0)
    return _webp(Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)))


def ink(data: bytes) -> bytes:
    """Thủy mặc: mảng mực loang (làm mịn + lượng tử độ đậm) + nét viền mực, nền giấy dó, triện đỏ."""
    img = _load(data)
    gray = ImageOps.autocontrast(ImageOps.grayscale(img), cutoff=2).filter(ImageFilter.MedianFilter(5))
    g = np.asarray(gray, np.float32) / 255.0
    # chỉ mảng tối mới thành mực; trung tính / sáng (nền) để giấy trắng → nền rối nhạt đi
    dark = np.clip(((1 - g) - 0.38) / 0.62, 0, 1) ** 1.2
    wash = np.round(dark * 4) / 4  # 5 sắc độ mực
    wash = np.asarray(Image.fromarray((wash * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(max(2, img.width // 200))), np.float32) / 255.0
    edges = np.asarray(gray.filter(ImageFilter.FIND_EDGES), np.float32) / 255.0
    edges = np.asarray(Image.fromarray((np.clip((edges - 0.12) * 3, 0, 1) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8)), np.float32) / 255.0
    darkness = np.clip(wash * 0.85 + edges * 0.9 * (0.3 + dark), 0, 1)
    paper = _paper(img.size, (238, 229, 210), seed=11)
    ink_color = np.array([28, 26, 24], np.float32)[None, None, :]
    out = paper * (1 - darkness[..., None]) + ink_color * darkness[..., None]
    pic = Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))
    # triện đỏ góc dưới phải
    d = ImageDraw.Draw(pic)
    s = max(18, img.width // 22)
    x, y = img.width - s - s // 2, img.height - s - s // 2
    d.rectangle([x, y, x + s, y + s], fill=(176, 36, 32))
    d.rectangle([x + s // 6, y + s // 6, x + s - s // 6, y + s - s // 6], outline=(240, 220, 200), width=max(1, s // 14))
    return _webp(pic)


def stylize(data: bytes, style: str) -> bytes:
    if style == "pencil":
        return pencil(data)
    if style == "ink":
        return ink(data)
    raise ValueError(f"unknown style {style}")
