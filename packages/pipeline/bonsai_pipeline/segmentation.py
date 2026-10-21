"""A2 — Segment thân cây.

- Có trọng số YOLO-seg (biến `TRUNK_SEG_WEIGHTS`) và cài `ultralytics` → dùng mask thật.
- Không có hoặc mask rỗng → dùng số đo P1, gắn cờ `cv_fallback` (docs/architecture.md §3).

Mask được dùng lại ở P4 (IoU thân) và kiểm tra đơn điệu S1→S3.
"""

from __future__ import annotations

import io
import logging
import os
from dataclasses import asdict, dataclass
from functools import lru_cache

import numpy as np
from PIL import Image

from .schemas import Analysis

log = logging.getLogger(__name__)

TRUNK_CLASS_NAMES = {"trunk", "than"}
MIN_MASK_AREA_RATIO = 0.002  # mask nhỏ hơn 0,2% ảnh coi như rỗng


@dataclass
class TrunkMeasure:
    source: str  # "yolo" | "p1"
    cv_fallback: bool
    base_point_px: list[float]
    apex_point_px: list[float]
    height_px: int
    base_diameter_px: int
    mask_area_px: int = 0

    def as_dict(self) -> dict:
        return asdict(self)


@dataclass
class SegmentationResult:
    measure: TrunkMeasure
    mask: np.ndarray | None  # bool HxW

    def mask_png(self) -> bytes | None:
        if self.mask is None:
            return None
        buf = io.BytesIO()
        Image.fromarray(self.mask.astype(np.uint8) * 255, mode="L").save(buf, format="PNG", optimize=True)
        return buf.getvalue()


def measure_mask(mask: np.ndarray) -> TrunkMeasure | None:
    """Đo thân từ mask: điểm gốc (đáy), ngọn (đỉnh), chiều cao, đường kính gốc (đo ở 5% chiều cao trên gốc)."""
    ys, xs = np.nonzero(mask)
    if ys.size == 0 or ys.size < MIN_MASK_AREA_RATIO * mask.size:
        return None
    bottom, top = int(ys.max()), int(ys.min())
    height = bottom - top + 1
    base_cols = xs[ys == bottom]
    top_cols = xs[ys == top]
    probe_y = max(top, bottom - max(1, round(height * 0.05)))
    row = np.nonzero(mask[probe_y])[0]
    base_d = int(row.max() - row.min() + 1) if row.size else int(base_cols.max() - base_cols.min() + 1)
    return TrunkMeasure(
        source="yolo",
        cv_fallback=False,
        base_point_px=[float(base_cols.mean()), float(bottom)],
        apex_point_px=[float(top_cols.mean()), float(top)],
        height_px=int(height),
        base_diameter_px=base_d,
        mask_area_px=int(ys.size),
    )


def from_analysis(analysis: Analysis) -> TrunkMeasure:
    t = analysis.trunk
    if t is None:
        raise ValueError("analysis has no trunk")
    return TrunkMeasure("p1", True, list(t.base_point_px), list(t.apex_point_px), t.height_px, t.base_diameter_px)


def mask_iou(a: np.ndarray, b: np.ndarray, *, up_to_ratio: float | None = None, base_y: int | None = None) -> float:
    """IoU hai mask. `up_to_ratio` + `base_y`: chỉ so vùng từ gốc lên tỉ lệ chiều cao đó (P4: 60%)."""
    if a.shape != b.shape:
        b = np.array(Image.fromarray(b.astype(np.uint8) * 255).resize(a.shape[::-1], Image.Resampling.NEAREST)) > 0
    if up_to_ratio is not None and base_y is not None:
        ys = np.nonzero(a)[0]
        if ys.size:
            cut = int(base_y - (base_y - ys.min()) * up_to_ratio)
            a, b = a.copy(), b.copy()
            a[:cut], b[:cut] = False, False
    inter = np.logical_and(a, b).sum()
    union = np.logical_or(a, b).sum()
    return float(inter / union) if union else 0.0


class YoloTrunkSegmenter:
    def __init__(self, weights: str):
        from ultralytics import YOLO  # phụ thuộc tùy chọn (extra "cv")

        self.model = YOLO(weights)

    def segment(self, image: Image.Image) -> np.ndarray | None:
        res = self.model.predict(image, verbose=False, retina_masks=True)[0]
        if res.masks is None or res.boxes is None:
            return None
        names = res.names
        best, best_area = None, 0
        for i, cls in enumerate(res.boxes.cls.tolist()):
            if names.get(int(cls), "").lower() not in TRUNK_CLASS_NAMES:
                continue
            m = res.masks.data[i].cpu().numpy() > 0.5
            if m.sum() > best_area:
                best, best_area = m, int(m.sum())
        return best


@lru_cache
def _segmenter() -> YoloTrunkSegmenter | None:
    weights = os.environ.get("TRUNK_SEG_WEIGHTS")
    if not weights or not os.path.exists(weights):
        return None
    try:
        return YoloTrunkSegmenter(weights)
    except ImportError:
        log.warning("TRUNK_SEG_WEIGHTS set but ultralytics is not installed; using P1 measurements")
        return None


def segment_trunk(image_bytes: bytes, analysis: Analysis, segmenter: YoloTrunkSegmenter | None = None) -> SegmentationResult:
    seg = segmenter if segmenter is not None else _segmenter()
    if seg is not None:
        try:
            image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
            mask = seg.segment(image)
            if mask is not None:
                measure = measure_mask(mask)
                if measure is not None:
                    return SegmentationResult(measure, mask)
        except Exception:  # CV lỗi không được làm hỏng phiên A
            log.exception("trunk segmentation failed; falling back to P1 measurements")
    return SegmentationResult(from_analysis(analysis), None)
