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
BRANCH_CLASS_NAMES = {"branch", "canh"}
ROOT_CLASS_NAMES = {"root", "roots", "nebari", "re"}
SEG_CLASSES = ("trunk", "branch", "root")  # thứ tự lớp khi huấn luyện (tools/seg, seg_dataset.py)
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


@dataclass
class Parts:
    """Kết quả tách ảnh phôi: thân (mask lớn nhất), từng cành (mỗi cành 1 mask), rễ (gộp). Mask bool HxW."""

    trunk: np.ndarray | None
    branches: list[np.ndarray]
    roots: np.ndarray | None
    trunk_conf: float = 0.0
    has_branch_class: bool = False  # model cũ chỉ có lớp thân → không suy ra được cành


class YoloTrunkSegmenter:
    def __init__(self, weights: str):
        from ultralytics import YOLO  # phụ thuộc tùy chọn (extra "cv")

        self.model = YOLO(weights)

    def segment_parts(self, image: Image.Image) -> Parts:
        res = self.model.predict(image, verbose=False, retina_masks=True)[0]
        names = {int(k): str(v).lower() for k, v in res.names.items()}
        parts = Parts(None, [], None, has_branch_class=bool(set(names.values()) & BRANCH_CLASS_NAMES))
        if res.masks is None or res.boxes is None:
            return parts
        best_area = 0
        for i, (cls, conf) in enumerate(zip(res.boxes.cls.tolist(), res.boxes.conf.tolist())):
            name = names.get(int(cls), "")
            m = res.masks.data[i].cpu().numpy() > 0.5
            if name in TRUNK_CLASS_NAMES and m.sum() > best_area:
                parts.trunk, parts.trunk_conf, best_area = m, float(conf), int(m.sum())
            elif name in BRANCH_CLASS_NAMES:
                parts.branches.append(m)
            elif name in ROOT_CLASS_NAMES:
                parts.roots = m if parts.roots is None else (parts.roots | m)
        return parts

    def segment(self, image: Image.Image) -> np.ndarray | None:
        return self.segment_parts(image).trunk


@lru_cache
def get_segmenter() -> YoloTrunkSegmenter | None:
    weights = os.environ.get("TRUNK_SEG_WEIGHTS")
    if not weights or not os.path.exists(weights):
        return None
    try:
        return YoloTrunkSegmenter(weights)
    except ImportError:
        log.warning("TRUNK_SEG_WEIGHTS set but ultralytics is not installed; using P1 measurements")
        return None


def segment_trunk(image_bytes: bytes, analysis: Analysis, segmenter: YoloTrunkSegmenter | None = None) -> SegmentationResult:
    seg = segmenter if segmenter is not None else get_segmenter()
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
