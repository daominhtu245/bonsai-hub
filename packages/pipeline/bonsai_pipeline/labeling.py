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


# ---------- nháp không gọi AI (tách nền + màu) ----------

FOLIAGE_HSV = ((25, 40, 35), (95, 255, 255))  # OpenCV H 0–180: vàng-lục → lục lam; lá non / lá già đều lọt


def find_ground(obj: np.ndarray, top: int, bottom: int) -> int:
    """Hàng mặt chậu / mặt đất: chậu là khối ĐẶC, RỘNG ở đáy (bề ngang gần như đều từng hàng); đi từ đáy lên, gặp hàng
    hẹp hẳn lại (chân thân) thì dừng. Không thấy khối chậu → coi đáy khối cây là mặt đất."""
    rows = np.arange(top, bottom + 1)
    width = obj[top:bottom + 1].sum(1).astype(float)
    span = np.array([(np.ptp(np.where(r)[0]) + 1) if r.any() else 1 for r in obj[top:bottom + 1]], float)
    solid = width / span
    h = bottom - top + 1
    low = slice(int(h * 0.6), h)
    pot_w = np.percentile(width[low], 80) if width[low].size else 0
    ground = bottom
    started = False
    for i in range(h - 1, int(h * 0.35), -1):
        is_pot = width[i] >= 0.55 * pot_w and solid[i] >= 0.8
        if is_pot:
            started, ground = True, int(rows[i])
        elif started and width[i] < 0.45 * pot_w:
            break
    return ground


def local_drafts(image_bytes: bytes, remover=None) -> list[DraftObject]:
    """Mask nháp thân / cành / rễ chỉ bằng máy (không tốn API): tách nền lấy khối cây → bỏ lá theo màu → bỏ chậu / đất ở
    đáy (dải rộng nhất phía dưới) → phần gỗ dày = thân, nhánh mảnh tách ra = cành, phần loe sát mặt đất = rễ.
    Thô — chỉ để người gán nhãn sửa thay vì vẽ từ đầu. Không tách được → [] (worker chuyển sang cách có AI)."""
    import cv2

    from .cutout import get_remover, main_object

    remover = remover or get_remover()
    if remover is None:
        return []
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    rgb = np.asarray(img)
    h, w = rgb.shape[:2]
    obj = main_object(remover.alpha(img))
    if obj.mean() < 0.01:
        return []
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
    lo, hi = FOLIAGE_HSV
    leaf = cv2.inRange(hsv, np.array(lo), np.array(hi)).astype(bool)
    wood = obj & ~leaf
    k3 = np.ones((3, 3), np.uint8)
    wood = cv2.morphologyEx(cv2.morphologyEx(wood.astype(np.uint8), cv2.MORPH_OPEN, k3), cv2.MORPH_CLOSE, k3).astype(bool)
    ys = np.where(obj.any(1))[0]
    top, bottom = int(ys.min()), int(ys.max())
    ground = find_ground(obj, top, bottom)
    above = wood.copy()
    above[ground:] = False
    if above.sum() < 50:
        return []
    n, lab, st, _ = cv2.connectedComponentsWithStats(above.astype(np.uint8), 8)
    base_row = above[max(top, ground - max(3, (bottom - top) // 30)):ground]
    base_labels = [i for i in np.unique(lab[max(top, ground - max(3, (bottom - top) // 30)):ground][base_row]) if i]
    if not base_labels:
        return []
    tree = np.isin(lab, base_labels)
    # thân = phần dày: mở hình thái bằng đĩa ~ 1/4 bề ngang gốc → giữ thân (và cành rất to), bỏ cành mảnh
    base_w = max(4, int(np.median(tree[max(top, ground - (bottom - top) // 10):ground].sum(1)) or 4))
    r = max(2, base_w // 6)
    disk = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1))
    trunk = cv2.morphologyEx(tree.astype(np.uint8), cv2.MORPH_OPEN, disk).astype(bool)
    tn, tlab, tst, _ = cv2.connectedComponentsWithStats(trunk.astype(np.uint8), 8)
    if tn > 1:  # giữ khối dày chạm gốc
        keep = [i for i in range(1, tn) if tst[i][1] + tst[i][3] >= ground - base_w]
        trunk = np.isin(tlab, keep) if keep else trunk
    if trunk.sum() < 0.25 * tree.sum():  # phôi thân mảnh: cả khối gỗ chạm gốc là thân (cành để người gán tách)
        trunk = tree.copy()
    objects = [DraftObject("trunk", "trunk", trunk)]
    rest = tree & ~cv2.dilate(trunk.astype(np.uint8), k3).astype(bool)
    bn, blab, bst, _ = cv2.connectedComponentsWithStats(rest.astype(np.uint8), 8)
    min_area = max(30, int(0.0004 * h * w))
    branches = sorted((i for i in range(1, bn) if bst[i][4] >= min_area), key=lambda i: -bst[i][4])[:12]
    root_band_top = ground - max(4, (bottom - top) // 14)
    for j, i in enumerate(branches, 1):
        m = blab == i
        if bst[i][1] >= root_band_top:  # nằm hẳn trong dải sát đất → rễ, không phải cành
            continue
        objects.append(DraftObject(f"branch_b{j}", "branch", m))
    # rễ: gỗ trong dải sát mặt đất, rộng hơn chân thân
    band = wood.copy()
    band[:root_band_top] = False
    band[ground + max(2, base_w // 6):] = False
    cols = np.where(trunk[max(top, ground - base_w):ground].any(0))[0]
    if cols.size:
        band[:, cols.min():cols.max() + 1] &= False
    # dải quá rộng / quá đặc thường là mặt đất trong chậu, không phải rễ → để người gán vẽ rễ tay
    if min_area <= band.sum() <= 1.5 * base_w * max(4, (bottom - top) // 14):
        objects.append(DraftObject("root", "root", band))
    return objects
