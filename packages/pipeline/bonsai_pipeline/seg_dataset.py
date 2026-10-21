"""Chuyển mask thân (PNG nhị phân) sang nhãn YOLO-seg (polygon chuẩn hóa) để huấn luyện A2."""

from __future__ import annotations

import random
from pathlib import Path

import numpy as np
from PIL import Image

TRUNK_CLASS_ID = 0


def mask_to_polygons(mask: np.ndarray, *, min_area_ratio: float = 0.001, epsilon_ratio: float = 0.002) -> list[np.ndarray]:
    """Trả các polygon (N×2, tọa độ 0–1) của vùng thân; bỏ mảnh vụn nhỏ."""
    import cv2  # extra "cv"

    h, w = mask.shape
    contours, _ = cv2.findContours(mask.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    polys = []
    for c in contours:
        if cv2.contourArea(c) < min_area_ratio * h * w:
            continue
        approx = cv2.approxPolyDP(c, epsilon_ratio * cv2.arcLength(c, True), True).reshape(-1, 2)
        if len(approx) >= 3:
            polys.append(approx.astype(np.float64) / [w, h])
    return polys


def yolo_label_line(poly: np.ndarray, class_id: int = TRUNK_CLASS_ID) -> str:
    return f"{class_id} " + " ".join(f"{x:.6f} {y:.6f}" for x, y in poly)


def build_dataset(images_dir: Path, masks_dir: Path, out_dir: Path, *, val_ratio: float = 0.15, seed: int = 7) -> dict:
    """images_dir/<name>.(jpg|png|webp) + masks_dir/<name>.png → out_dir theo cấu trúc Ultralytics."""
    pairs = []
    for img in sorted(images_dir.iterdir()):
        mask = masks_dir / f"{img.stem}.png"
        if img.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"} and mask.exists():
            pairs.append((img, mask))
    random.Random(seed).shuffle(pairs)
    n_val = max(1, round(len(pairs) * val_ratio)) if len(pairs) > 1 else 0
    stats = {"train": 0, "val": 0, "skipped": 0}
    for i, (img, mask_path) in enumerate(pairs):
        split = "val" if i < n_val else "train"
        polys = mask_to_polygons(np.array(Image.open(mask_path).convert("L")) > 127)
        if not polys:
            stats["skipped"] += 1
            continue
        (out_dir / "images" / split).mkdir(parents=True, exist_ok=True)
        (out_dir / "labels" / split).mkdir(parents=True, exist_ok=True)
        Image.open(img).convert("RGB").save(out_dir / "images" / split / f"{img.stem}.jpg", quality=95)
        (out_dir / "labels" / split / f"{img.stem}.txt").write_text("\n".join(yolo_label_line(p) for p in polys) + "\n")
        stats[split] += 1
    (out_dir / "dataset.yaml").write_text(
        f"path: {out_dir.resolve()}\ntrain: images/train\nval: images/val\nnames:\n  0: trunk\n"
    )
    return stats
