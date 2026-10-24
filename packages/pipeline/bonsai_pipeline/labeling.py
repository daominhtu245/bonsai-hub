"""Mask nháp để gán nhãn YOLO-seg 3 lớp (thân / từng cành / rễ) từ một `Analysis` (P1).

- Có SAM (ultralytics + `SAM_WEIGHTS`): SAM tách theo điểm gợi ý từ tọa độ P1 — mask bám sát ảnh.
- Không có: dựng hình học (thân = dải thuôn gốc → ngọn, cành = nét dày, rễ = vệt xòe ở gốc) — thô,
  người duyệt sửa bằng cọ/tẩy ở /admin → Gán nhãn.
Dùng chung cho worker (tasks/labeling.py) và công cụ dòng lệnh tools/seg/label_with_sam.py.
"""

from __future__ import annotations

import io
import logging
import os
from dataclasses import dataclass
from functools import lru_cache

import numpy as np
from PIL import Image, ImageDraw

from .schemas import Analysis

log = logging.getLogger(__name__)

THICK_RATIO = {"thick": 0.35, "medium": 0.22, "thin": 0.12}  # bề dày cành so với đường kính gốc


@dataclass
class DraftObject:
    id: str  # "trunk" | "branch_b1" | "root"
    cls: str  # trunk | branch | root
    mask: np.ndarray  # bool HxW


def line_points(a, b, n: int = 5, lo: float = 0.05, hi: float = 0.9) -> list[list[float]]:
    """Các điểm trải đều trên đoạn a → b (thân uốn / cành cong vẫn thường đi qua gần các điểm này)."""
    (ax, ay), (bx, by) = a, b
    return [[ax + (bx - ax) * t, ay + (by - ay) * t] for t in np.linspace(lo, hi, n)]


def trunk_prompt_points(base, apex, n: int = 5) -> list[list[float]]:
    return line_points(base, apex, n)


def branch_prompt_points(start, end) -> list[list[float]]:
    """Bỏ đoạn sát thân (dễ dính vào mask thân); không có điểm cuối thì chỉ dùng điểm gốc cành."""
    return line_points(start, end, n=3, lo=0.25, hi=0.85) if end else [list(start)]


def root_prompt_points(base, base_d: float) -> list[list[float]]:
    """Hai bên gốc, sát mặt đất — nơi rễ nổi xòe ra."""
    bx, by = base
    return [[bx - 0.7 * base_d, by - 0.05 * base_d], [bx + 0.7 * base_d, by - 0.05 * base_d]]


def _branch_end(b, trunk_h: float) -> tuple[float, float]:
    if b.end_px:
        return tuple(b.end_px)
    dx, dy = {"left": (-1, -0.2), "right": (1, -0.2), "up": (0, -1), "back": (0.3, -0.5), "front": (-0.3, -0.5)}[b.direction]
    length = trunk_h * 0.25
    return b.start_px[0] + dx * length, b.start_px[1] + dy * length


def geometry_drafts(analysis: Analysis, size: tuple[int, int]) -> list[DraftObject]:
    t = analysis.trunk
    if t is None:
        return []
    w, h = size
    (bx, by), (ax, ay) = t.base_point_px, t.apex_point_px
    d = float(t.base_diameter_px)

    trunk = Image.new("L", size, 0)
    dx, dy = ax - bx, ay - by
    norm = max(1.0, (dx * dx + dy * dy) ** 0.5)
    nx, ny = -dy / norm, dx / norm  # pháp tuyến
    top_half, base_half = d * 0.18, d * 0.5
    ImageDraw.Draw(trunk).polygon([
        (bx + nx * base_half, by + ny * base_half), (ax + nx * top_half, ay + ny * top_half),
        (ax - nx * top_half, ay - ny * top_half), (bx - nx * base_half, by - ny * base_half),
    ], fill=255)
    trunk_mask = np.asarray(trunk) > 0
    out = [DraftObject("trunk", "trunk", trunk_mask)]

    trunk_h = float(t.height_px)
    for b in analysis.branches:
        m = Image.new("L", size, 0)
        width = max(3, round(d * THICK_RATIO.get(b.thickness, 0.2)))
        ImageDraw.Draw(m).line([tuple(b.start_px), _branch_end(b, trunk_h)], fill=255, width=width, joint="curve")
        mask = (np.asarray(m) > 0) & ~trunk_mask
        if mask.any():
            out.append(DraftObject(f"branch_{b.id}", "branch", mask))

    if analysis.nebari and analysis.nebari.quality not in ("hidden", "uncertain"):
        spread = {"good": 1.2, "average": 0.9, "poor": 0.7}.get(analysis.nebari.quality, 0.9) * d
        shift = {"left": -0.3, "right": 0.3}.get(analysis.nebari.spread_side, 0) * d
        m = Image.new("L", size, 0)
        ImageDraw.Draw(m).ellipse([bx + shift - spread, by - d * 0.25, bx + shift + spread, by + d * 0.1], fill=255)
        mask = (np.asarray(m) > 0) & ~trunk_mask
        if mask.any():
            out.append(DraftObject("root", "root", mask))
    return out


def sam_drafts(model, image: Image.Image, analysis: Analysis) -> list[DraftObject]:
    """SAM (ultralytics) theo điểm gợi ý; đối tượng SAM không tách được thì bỏ (người duyệt thêm tay)."""
    t = analysis.trunk
    if t is None:
        return []

    def sam(points):
        res = model(image, points=[points], labels=[[1] * len(points)], verbose=False)[0]
        return None if res.masks is None else res.masks.data[0].cpu().numpy() > 0.5

    out: list[DraftObject] = []
    trunk = sam(trunk_prompt_points(t.base_point_px, t.apex_point_px))
    if trunk is not None and trunk.any():
        out.append(DraftObject("trunk", "trunk", trunk))
    for b in analysis.branches:
        m = sam(branch_prompt_points(b.start_px, b.end_px))
        if m is not None and trunk is not None:
            m = m & ~trunk  # phần chồng lên thân thuộc về thân
        if m is not None and m.any():
            out.append(DraftObject(f"branch_{b.id}", "branch", m))
    if analysis.nebari and analysis.nebari.quality not in ("hidden", "uncertain"):
        m = sam(root_prompt_points(t.base_point_px, t.base_diameter_px))
        if m is not None and trunk is not None:
            m = m & ~trunk
        if m is not None and m.any():
            out.append(DraftObject("root", "root", m))
    return out


@lru_cache
def get_sam():
    """SAM nếu worker có ultralytics và `SAM_WEIGHTS` (vd. /models/sam2.1_b.pt); không thì None → mask hình học."""
    weights = os.environ.get("SAM_WEIGHTS")
    if not weights:
        return None
    try:
        from ultralytics import SAM

        return SAM(weights)
    except Exception:  # thiếu thư viện / file
        log.warning("SAM_WEIGHTS set but SAM could not be loaded; using geometry drafts")
        return None


def make_drafts(image_bytes: bytes, analysis: Analysis, size: tuple[int, int]) -> tuple[list[DraftObject], str]:
    model = get_sam()
    if model is not None:
        try:
            objs = sam_drafts(model, Image.open(io.BytesIO(image_bytes)).convert("RGB"), analysis)
            if objs:
                return objs, "sam"
        except Exception:
            log.exception("SAM drafting failed; using geometry drafts")
    return geometry_drafts(analysis, size), "geometry"


def mask_png(mask: np.ndarray) -> bytes:
    buf = io.BytesIO()
    Image.fromarray(mask.astype(np.uint8) * 255, mode="L").save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def read_mask(data: bytes, size: tuple[int, int]) -> np.ndarray:
    """PNG bất kỳ (trắng/đen, hoặc có alpha) → mask bool đúng kích thước ảnh."""
    img = Image.open(io.BytesIO(data))
    if img.mode in ("RGBA", "LA"):
        alpha = np.asarray(img.getchannel("A"))
        lum = np.asarray(img.convert("L"))
        arr = (alpha > 127) & (lum > 127)
    else:
        arr = np.asarray(img.convert("L")) > 127
    if arr.shape != (size[1], size[0]):
        raise ValueError(f"mask size {arr.shape[::-1]} != image size {size}")
    return arr
