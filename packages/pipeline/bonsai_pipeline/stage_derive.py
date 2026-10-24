"""Dựng ảnh giai đoạn S1–S3 từ ảnh gốc + ảnh kết quả S4, trên máy, không gọi API (docs/quality-plan.md bước 5).

- S1 (cắt tạo khung): ảnh gốc, xóa cành phải cắt và phần cây cũ ngoài thiết kế (vá ảnh bằng OpenCV inpaint).
- S2 (nuôi cành): S1 + khung cành của S4 (thân trên, cành) + lá S4 chỉ trong tầng thu nhỏ quanh tâm (≈ 55%).
- S3 (định tầng, thay chậu): như S2 với tầng ≈ 80% + chậu mới của S4.
Vì lấy từ chính S4 nên các giai đoạn khớp nhau và tán chỉ lớn dần (đơn điệu) — không cần kiểm tra lại.
"""

from __future__ import annotations

import io

import numpy as np
from PIL import Image, ImageFilter

from .fidelity import Regions, _dilate, _ellipse_mask, foliage
from .schemas import Pad

STAGE_SCALE = {"S2": 0.55, "S3": 0.8}


def _webp(arr: np.ndarray) -> bytes:
    buf = io.BytesIO()
    Image.fromarray(arr).save(buf, "WEBP", quality=90)
    return buf.getvalue()


def _blend(base: np.ndarray, top: np.ndarray, mask: np.ndarray, feather: int) -> np.ndarray:
    a = Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(feather))
    a = (np.asarray(a, np.float32) / 255.0)[..., None]
    return (top * a + base * (1 - a)).astype(np.uint8)


def _scaled(pads: list[Pad], s: float) -> list[Pad]:
    return [p.model_copy(update={"rx": p.rx * s, "ry": p.ry * s}) for p in pads]


def pruned(original: np.ndarray, reg: Regions) -> np.ndarray:
    """Ảnh gốc sau khi cắt: vá các cành phải cắt + phần cây cũ ngoài vùng tán thiết kế."""
    import cv2

    remove = reg.corridors | (reg.tree & ~reg.canopy)
    remove &= ~reg.trunk & ~reg.pot  # thân dưới giữ nguyên; chậu cũ chưa đổi ở S1
    if not remove.any():
        return original.copy()
    m = (remove * 255).astype(np.uint8)
    m = cv2.dilate(m, np.ones((5, 5), np.uint8))
    radius = max(3, round(min(original.shape[:2]) * 0.01))
    bgr = cv2.cvtColor(original, cv2.COLOR_RGB2BGR)
    return cv2.cvtColor(cv2.inpaint(bgr, m, radius, cv2.INPAINT_TELEA), cv2.COLOR_BGR2RGB)


def derive_stages(original: bytes, final: bytes, reg: Regions) -> dict[str, bytes]:
    orig = np.asarray(Image.open(io.BytesIO(original)).convert("RGB"))
    s4 = np.asarray(Image.open(io.BytesIO(final)).convert("RGB").resize((orig.shape[1], orig.shape[0]), Image.Resampling.LANCZOS))
    feather = max(2, round(max(orig.shape[:2]) * 0.004))
    s1 = pruned(orig, reg)
    out = {"S1": _webp(s1)}
    leaf4 = _dilate(foliage(s4), 2)
    for code, scale in STAGE_SCALE.items():
        pads = _ellipse_mask(reg.size, _scaled(reg.pads, scale), 1.0)
        # trong vùng tán: lấy khung cành của S4 (chỗ không phải lá) + lá S4 trong tầng thu nhỏ; lá S4 ngoài đó → giữ S1
        take = reg.canopy & (~leaf4 | pads) & ~reg.trunk
        img = _blend(s1, s4, take, feather)
        if code == "S3":  # thay chậu ở giai đoạn 3: lấy chậu của ảnh kết quả
            img = _blend(img, s4, reg.pot & ~reg.canopy, feather)
        out[code] = _webp(img)
    return out
