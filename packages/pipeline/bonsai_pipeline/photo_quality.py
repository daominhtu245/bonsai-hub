"""Kiểm tra chất lượng ảnh trước P1 — chạy trên máy, không tốn API.

Chỉ loại ảnh hỏng rõ ràng (quá nhỏ, quá mờ, quá tối, cháy sáng, gần như một màu); ảnh "tạm được" vẫn cho qua
để P1 / model riêng đánh giá tiếp. Ngưỡng bảo thủ, hiệu chỉnh lại khi có ảnh phôi thật.
"""

from __future__ import annotations

import io
from dataclasses import dataclass, field

import numpy as np
from PIL import Image

MIN_SHORT_EDGE = 320
PROBE_EDGE = 512  # đo trên ảnh thu nhỏ để ngưỡng không phụ thuộc độ phân giải
BLUR_VAR_MIN = 12.0  # phương sai Laplacian
DARK_MEAN_MAX = 25  # độ sáng trung bình 0–255 (ảnh chụp phòng tối ~34 vẫn dùng được)
BRIGHT_MEAN_MIN = 235
CONTRAST_STD_MIN = 12


@dataclass
class PhotoQuality:
    usable: bool
    issues: list[str] = field(default_factory=list)
    metrics: dict = field(default_factory=dict)


def _laplacian_var(gray: np.ndarray) -> float:
    g = gray.astype(np.float32)
    lap = -4 * g[1:-1, 1:-1] + g[:-2, 1:-1] + g[2:, 1:-1] + g[1:-1, :-2] + g[1:-1, 2:]
    return float(lap.var())


def check_photo(data: bytes) -> PhotoQuality:
    img = Image.open(io.BytesIO(data)).convert("L")
    w, h = img.size
    scale = PROBE_EDGE / max(w, h)
    small = np.asarray(img.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.Resampling.BILINEAR))
    m = {
        "short_edge": min(w, h),
        "blur_var": round(_laplacian_var(small), 1),
        "mean": round(float(small.mean()), 1),
        "std": round(float(small.std()), 1),
    }
    issues = []
    if m["short_edge"] < MIN_SHORT_EDGE:
        issues.append("too_small")
    if m["blur_var"] < BLUR_VAR_MIN:
        issues.append("blurry")
    if m["mean"] < DARK_MEAN_MAX:
        issues.append("too_dark")
    if m["mean"] > BRIGHT_MEAN_MIN:
        issues.append("overexposed")
    if m["std"] < CONTRAST_STD_MIN:
        issues.append("low_contrast")
    return PhotoQuality(usable=not issues, issues=issues, metrics=m)
