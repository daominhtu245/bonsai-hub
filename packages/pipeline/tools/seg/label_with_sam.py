"""Gán nhãn mask thân bằng SAM, dùng điểm gốc/ngọn từ P1 làm điểm gợi ý.

    python tools/seg/label_with_sam.py manifest.json out/masks --model sam2.1_b.pt

manifest.json: [{"name": "phoi_001", "image": "path/to/img.webp",
                 "base_point_px": [x, y], "apex_point_px": [x, y], "base_diameter_px": 120}]
(tạo bằng tools/seg/export_from_db.py từ các phiên A đã chạy, hoặc gõ tay).
Luôn duyệt lại mask bằng mắt trước khi huấn luyện; sửa tay mask sai (vd. si/sanh có rễ khí).
Cần: pip install -e "packages/pipeline[cv]".
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image


def trunk_prompt_points(base, apex, n: int = 5) -> list[list[float]]:
    """Các điểm dương trải đều trên đường gốc → ngọn (thân uốn vẫn thường đi qua gần các điểm này)."""
    (bx, by), (ax, ay) = base, apex
    return [[bx + (ax - bx) * t, by + (ay - by) * t] for t in np.linspace(0.05, 0.9, n)]


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
        pts = trunk_prompt_points(item["base_point_px"], item["apex_point_px"])
        res = model(item["image"], points=[pts], labels=[[1] * len(pts)], verbose=False)[0]
        if res.masks is None:
            print(f"skip {item['name']}: no mask")
            continue
        mask = res.masks.data[0].cpu().numpy() > 0.5
        Image.fromarray(mask.astype(np.uint8) * 255).save(args.out_dir / f"{item['name']}.png")
        print(f"ok {item['name']}: {int(mask.sum())} px")


if __name__ == "__main__":
    main()
