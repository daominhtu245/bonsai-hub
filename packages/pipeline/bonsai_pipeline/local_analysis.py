"""A1 không dùng API: dựng `Analysis` (cùng schema P1) từ mask YOLO-seg thân / cành / rễ.

Chỉ dùng khi tin được (`LocalAnalysis.confident`); không thì worker gọi P1 (chế độ "Model riêng, API dự phòng").
Những gì ảnh 2D không cho biết (cành hướng trước/sau, sẹo, gỗ lũa) để trống — rule engine và bộ thiết kế không
dựa vào chúng. Ngưỡng là giả định ban đầu, hiệu chỉnh khi có ảnh phôi thật đã gán nhãn.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np

from .schemas import Analysis, Branch, ImageQuality, Nebari, SpeciesGuess, Trunk
from .segmentation import Parts, measure_mask

MIN_TRUNK_CONF = 0.5
MIN_TRUNK_HEIGHT_RATIO = 0.25  # thân phải chiếm ≥ 25% chiều cao ảnh
MAX_TRUNK_AREA_RATIO = 0.6
MIN_BRANCH_AREA_RATIO = 0.0005
BAR_GAP = 0.04  # cùng rule_engine.BAR_BRANCH_RATIO_GAP

_MOVEMENT_VI = {"straight": "thẳng", "gentle_curve": "uốn nhẹ", "s_curve": "uốn chữ S",
                "strong_twist": "xoắn mạnh", "leaning": "nghiêng", "uncertain": "chưa rõ dáng"}
_TAPER_VI = {"good": "thuôn đều", "weak": "thuôn yếu", "reverse": "thuôn ngược", "uncertain": "chưa rõ độ thuôn"}
_NEBARI_VI = {"good": "rễ xòe đẹp", "average": "rễ xòe vừa", "poor": "rễ yếu", "hidden": "chưa thấy rõ rễ",
              "uncertain": "chưa rõ rễ"}


@dataclass
class LocalAnalysis:
    analysis: Analysis | None
    confident: bool
    reasons: list[str] = field(default_factory=list)  # vì sao chưa tin được → gọi P1
    metrics: dict = field(default_factory=dict)


@dataclass
class TrunkShape:
    top: int
    bottom: int
    rows: np.ndarray  # các hàng có pixel thân
    cx: np.ndarray  # tâm thân theo hàng
    width: np.ndarray  # bề rộng thân theo hàng (đếm pixel)

    @property
    def height(self) -> int:
        return self.bottom - self.top + 1

    def at(self, frac: float, arr: np.ndarray, band: float = 0.03) -> float:
        """Giá trị trung bình quanh độ cao `frac` (0 = gốc, 1 = ngọn)."""
        y = self.bottom - frac * self.height
        sel = np.abs(self.rows - y) <= max(1.0, band * self.height)
        return float(arr[sel].mean()) if sel.any() else float(arr[np.argmin(np.abs(self.rows - y))])

    def center_x(self, y: float) -> float:
        return float(np.interp(y, self.rows, self.cx))


def trunk_shape(mask: np.ndarray) -> TrunkShape:
    counts = mask.sum(axis=1)
    rows = np.nonzero(counts)[0]
    xs = np.arange(mask.shape[1])
    cx = (mask[rows] * xs).sum(axis=1) / counts[rows]
    return TrunkShape(int(rows.min()), int(rows.max()), rows, cx, counts[rows].astype(float))


def taper_of(shape: TrunkShape) -> str:
    w10, w50, w85 = shape.at(0.1, shape.width), shape.at(0.5, shape.width), shape.at(0.85, shape.width)
    if w50 > w10 * 1.08:
        return "reverse"
    if w85 < w10 * 0.6 and w50 <= w10 * 0.95:
        return "good"
    return "weak"


def movement_of(shape: TrunkShape) -> tuple[str, float, dict]:
    """Dáng thân từ độ lệch đường tâm so với đường thẳng gốc → ngọn. Trả (movement, góc nghiêng°, số đo)."""
    h = shape.height
    bx, ax = shape.cx[-1], shape.cx[0]  # rows tăng dần: phần tử cuối là gốc
    lean = math.degrees(math.atan2(ax - bx, h))
    t = (shape.bottom - shape.rows) / max(1, h - 1)
    dev = (shape.cx - (bx + (ax - bx) * t)) / h
    k = max(1, round(len(dev) * 0.05))
    smooth = np.convolve(dev, np.ones(k) / k, mode="same")
    sig = smooth[np.abs(smooth) > 0.02]
    bends = int(np.count_nonzero(np.diff(np.sign(sig)))) if sig.size else 0
    maxdev = float(np.abs(smooth).max()) if smooth.size else 0.0
    if abs(lean) > 25 and maxdev < 0.06:
        mv = "leaning"
    elif maxdev < 0.03:
        mv = "straight"
    elif maxdev > 0.12 and bends >= 2:
        mv = "strong_twist"
    elif bends >= 1 and maxdev >= 0.04:
        mv = "s_curve"
    else:
        mv = "gentle_curve"
    return mv, round(lean, 1), {"max_dev": round(maxdev, 3), "bends": bends}


def branch_from_mask(mask: np.ndarray, shape: TrunkShape, base_d: int) -> dict | None:
    ys, xs = np.nonzero(mask)
    if ys.size == 0:
        return None
    step = max(1, ys.size // 4000)  # lấy mẫu cho nhanh
    ys, xs = ys[::step], xs[::step]
    dist = np.abs(xs - np.interp(ys, shape.rows, shape.cx))
    i = int(np.argmin(dist))
    sx, sy = float(xs[i]), float(ys[i])
    far = (xs - sx) ** 2 + (ys - sy) ** 2
    j = int(np.argmax(far))
    ex, ey = float(xs[j]), float(ys[j])
    dx, dy = ex - sx, ey - sy
    length = max(1.0, math.hypot(dx, dy))
    direction = "up" if -dy > 2 * abs(dx) else ("left" if dx < 0 else "right")
    width_ratio = (mask.sum() / length) / max(1, base_d)
    thickness = "thick" if width_ratio > 0.35 else "medium" if width_ratio > 0.18 else "thin"
    height_ratio = min(1.0, max(0.0, (shape.bottom - sy) / shape.height))
    return {"start_px": [round(sx, 1), round(sy, 1)], "end_px": [round(ex, 1), round(ey, 1)],
            "direction": direction, "thickness": thickness, "height_ratio": round(height_ratio, 3)}


def nebari_of(roots: np.ndarray | None, shape: TrunkShape, base_x: float, base_d: int) -> Nebari:
    if roots is None or not roots.any():
        return Nebari(quality="hidden", spread_side="unknown")
    band = max(2, round(shape.height * 0.1))
    lo, hi = max(0, shape.bottom - band), min(roots.shape[0], shape.bottom + band)
    ys, xs = np.nonzero(roots[lo:hi])
    if xs.size == 0:
        return Nebari(quality="hidden", spread_side="unknown")
    spread = (xs.max() - xs.min() + 1) / max(1, base_d)
    quality = "good" if spread >= 2.0 else "average" if spread >= 1.4 else "poor"
    left, right = int((xs < base_x).sum()), int((xs >= base_x).sum())
    side = "left" if left > right * 1.4 else "right" if right > left * 1.4 else "even"
    return Nebari(quality=quality, spread_side=side)


def analyze_parts(
    parts: Parts,
    image_size: tuple[int, int],
    *,
    species_key: str | None,
    quality_issues: list[str] | None = None,
) -> LocalAnalysis:
    w, h = image_size
    reasons: list[str] = []
    if parts.trunk is None:
        return LocalAnalysis(None, False, ["no_trunk_mask"])
    if not parts.has_branch_class:
        reasons.append("model_has_no_branch_class")
    if parts.trunk_conf < MIN_TRUNK_CONF:
        reasons.append("low_trunk_confidence")
    measure = measure_mask(parts.trunk)
    if measure is None:
        return LocalAnalysis(None, False, reasons + ["trunk_mask_too_small"])
    area_ratio = measure.mask_area_px / (w * h)
    if measure.height_px < MIN_TRUNK_HEIGHT_RATIO * h:
        reasons.append("trunk_too_short_in_frame")
    if area_ratio > MAX_TRUNK_AREA_RATIO:
        reasons.append("trunk_mask_too_large")

    shape = trunk_shape(parts.trunk)
    movement, lean, mv_metrics = movement_of(shape)
    taper = taper_of(shape)

    raw = [b for m in parts.branches if m.sum() >= MIN_BRANCH_AREA_RATIO * w * h
           if (b := branch_from_mask(m & ~parts.trunk, shape, measure.base_diameter_px)) is not None]
    raw.sort(key=lambda b: b["height_ratio"])
    for i, b in enumerate(raw, start=1):
        b["id"], b["issues"] = f"b{i}", []
    for i, a in enumerate(raw):
        for b in raw[i + 1:]:
            if {a["direction"], b["direction"]} == {"left", "right"} and abs(a["height_ratio"] - b["height_ratio"]) < BAR_GAP:
                a["issues"].append("bar_branch")
                b["issues"].append("bar_branch")
    branches = [Branch.model_validate(b) for b in raw]
    nebari = nebari_of(parts.roots, shape, measure.base_point_px[0], measure.base_diameter_px)

    trunk = Trunk(base_point_px=measure.base_point_px, apex_point_px=measure.apex_point_px,
                  height_px=measure.height_px, base_diameter_px=measure.base_diameter_px,
                  taper=taper, movement=movement, lean_angle_deg=lean)
    species = SpeciesGuess(guess=species_key or "other", confidence=1.0 if species_key else 0.0)
    summary = (f"Thân {_MOVEMENT_VI[movement]}, {_TAPER_VI[taper]}, có {len(branches)} cành; "
               f"{_NEBARI_VI[nebari.quality]}.")
    analysis = Analysis(
        image_quality=ImageQuality(usable=True, issues=list(quality_issues or [])),
        species=species, trunk=trunk, nebari=nebari, branches=branches, summary_vi=summary,
    )
    metrics = {"trunk_conf": round(parts.trunk_conf, 3), "trunk_area_ratio": round(area_ratio, 4),
               "branch_masks": len(parts.branches), **mv_metrics}
    return LocalAnalysis(analysis, not reasons, reasons, metrics)
