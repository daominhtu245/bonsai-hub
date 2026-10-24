"""Chuyển mask (PNG nhị phân) sang nhãn YOLO-seg (polygon chuẩn hóa) để huấn luyện A1/A2.

Hai dạng thư mục mask (dùng lẫn được):
- masks_dir/<tên ảnh>.png — chỉ thân (dạng cũ);
- masks_dir/<tên ảnh>/trunk.png, branch_*.png, root*.png — 3 lớp, mỗi file một đối tượng (tools/seg/label_with_sam.py).
"""

from __future__ import annotations

import random
from pathlib import Path

import numpy as np
from PIL import Image

from .segmentation import SEG_CLASSES

TRUNK_CLASS_ID = 0
CLASS_IDS = {name: i for i, name in enumerate(SEG_CLASSES)}  # trunk 0, branch 1, root 2


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


def mask_files(masks_dir: Path, stem: str) -> list[tuple[int, Path]]:
    """(class_id, file) của một ảnh; rỗng nếu chưa gán nhãn."""
    folder = masks_dir / stem
    if folder.is_dir():
        out = []
        for f in sorted(folder.glob("*.png")):
            cls = f.stem.split("_")[0]
            if cls in CLASS_IDS:
                out.append((CLASS_IDS[cls], f))
        return out
    single = masks_dir / f"{stem}.png"
    return [(TRUNK_CLASS_ID, single)] if single.exists() else []


def build_dataset(images_dir: Path, masks_dir: Path, out_dir: Path, *, val_ratio: float = 0.15, seed: int = 7) -> dict:
    """images_dir/<name>.(jpg|png|webp) + mask (2 dạng, xem đầu file) → out_dir theo cấu trúc Ultralytics."""
    pairs = []
    for img in sorted(images_dir.iterdir()):
        files = mask_files(masks_dir, img.stem)
        if img.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"} and files:
            pairs.append((img, files))
    random.Random(seed).shuffle(pairs)
    n_val = max(1, round(len(pairs) * val_ratio)) if len(pairs) > 1 else 0
    stats = {"train": 0, "val": 0, "skipped": 0}
    for i, (img, files) in enumerate(pairs):
        split = "val" if i < n_val else "train"
        lines = [
            yolo_label_line(p, cls)
            for cls, f in files
            for p in mask_to_polygons(np.array(Image.open(f).convert("L")) > 127)
        ]
        if not any(line.startswith(f"{TRUNK_CLASS_ID} ") for line in lines):  # ảnh không có thân → bỏ
            stats["skipped"] += 1
            continue
        (out_dir / "images" / split).mkdir(parents=True, exist_ok=True)
        (out_dir / "labels" / split).mkdir(parents=True, exist_ok=True)
        Image.open(img).convert("RGB").save(out_dir / "images" / split / f"{img.stem}.jpg", quality=95)
        (out_dir / "labels" / split / f"{img.stem}.txt").write_text("\n".join(lines) + "\n")
        stats[split] += 1
    (out_dir / "dataset.yaml").write_text(
        f"path: {out_dir.resolve()}\ntrain: images/train\nval: images/val\nnames:\n"
        + "".join(f"  {i}: {name}\n" for i, name in enumerate(SEG_CLASSES))
    )
    return stats
