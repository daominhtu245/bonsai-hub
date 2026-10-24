"""Gán nhãn nháp thân / cành / rễ bằng SAM từ dòng lệnh (cách khác: /admin → Gán nhãn, chạy trong worker).

    python tools/seg/label_with_sam.py manifest.json out/masks --model sam2.1_b.pt

manifest.json (tạo bằng tools/seg/export_from_db.py, hoặc gõ tay):
  [{"name": "phoi_001", "image": "path/to/img.webp",
    "base_point_px": [x, y], "apex_point_px": [x, y], "base_diameter_px": 120,
    "branches": [{"id": "b1", "start_px": [x, y], "end_px": [x, y]}], "nebari": "good"}]

Đầu ra theo từng ảnh (mỗi đối tượng một file — YOLO-seg cần từng cành là một thể riêng):
  out/masks/<name>/trunk.png, branch_b1.png, …, root.png
  out/masks/<name>/review.jpg   ảnh chồng màu để duyệt nhanh (thân xanh lá, cành vàng, rễ đỏ)
LUÔN duyệt bằng mắt trước khi huấn luyện; xóa file mask sai hoặc sửa tay.
Cần: pip install -e "packages/pipeline[cv]".
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image

from bonsai_pipeline.labeling import (  # noqa: F401 (tái xuất cho test / script cũ)
    branch_prompt_points, mask_png, root_prompt_points, sam_drafts, trunk_prompt_points,
)
from bonsai_pipeline.schemas import Analysis

COLORS = {"trunk": (46, 160, 67), "branch": (230, 180, 30), "root": (200, 50, 40)}


def overlay(image: Image.Image, masks: list[tuple[str, np.ndarray]]) -> Image.Image:
    arr = np.asarray(image.convert("RGB")).astype(np.float32)
    for cls, m in masks:
        arr[m] = arr[m] * 0.45 + np.array(COLORS[cls], np.float32) * 0.55
    return Image.fromarray(arr.astype(np.uint8))


def manifest_analysis(item: dict) -> Analysis:
    """Dựng Analysis tối thiểu từ một dòng manifest (chỉ các trường SAM cần)."""
    return Analysis.model_validate({
        "image_quality": {"usable": True},
        "species": {"guess": "other", "confidence": 0},
        "trunk": {"base_point_px": item["base_point_px"], "apex_point_px": item["apex_point_px"],
                  "height_px": max(1, round(abs(item["base_point_px"][1] - item["apex_point_px"][1]))),
                  "base_diameter_px": item["base_diameter_px"], "taper": "uncertain", "movement": "uncertain"},
        "nebari": {"quality": item.get("nebari") or "hidden", "spread_side": "unknown"},
        "branches": [{"id": b["id"], "start_px": b["start_px"], "end_px": b.get("end_px"), "direction": "left",
                      "thickness": "medium", "height_ratio": 0.5} for b in item.get("branches", [])],
    })


def label_item(model, item: dict, out_dir: Path) -> list[str]:
    image = Image.open(item["image"]).convert("RGB")
    objs = sam_drafts(model, image, manifest_analysis(item))
    target = out_dir / item["name"]
    target.mkdir(parents=True, exist_ok=True)
    for o in objs:
        (target / f"{o.id}.png").write_bytes(mask_png(o.mask))
    overlay(image, [(o.cls, o.mask) for o in objs]).save(target / "review.jpg", quality=85)
    return [o.id for o in objs]


def main() -> None:
    from ultralytics import SAM

    ap = argparse.ArgumentParser()
    ap.add_argument("manifest", type=Path)
    ap.add_argument("out_dir", type=Path)
    ap.add_argument("--model", default="sam2.1_b.pt")
    args = ap.parse_args()
    args.out_dir.mkdir(parents=True, exist_ok=True)
    model = SAM(args.model)
    for item in json.loads(args.manifest.read_text()):
        names = label_item(model, item, args.out_dir)
        print(f"{'ok' if names else 'skip'} {item['name']}: {', '.join(names) or 'no mask'}")


if __name__ == "__main__":
    main()
