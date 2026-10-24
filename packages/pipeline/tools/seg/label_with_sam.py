"""Gán nhãn mask thân / cành / rễ bằng SAM, dùng tọa độ P1 làm điểm gợi ý.

    python tools/seg/label_with_sam.py manifest.json out/masks --model sam2.1_b.pt

manifest.json (tạo bằng tools/seg/export_from_db.py, hoặc gõ tay):
  [{"name": "phoi_001", "image": "path/to/img.webp",
    "base_point_px": [x, y], "apex_point_px": [x, y], "base_diameter_px": 120,
    "branches": [{"id": "b1", "start_px": [x, y], "end_px": [x, y]}], "nebari": "good"}]

Đầu ra theo từng ảnh (mỗi đối tượng một file — YOLO-seg cần từng cành là một thể riêng):
  out/masks/<name>/trunk.png, branch_b1.png, branch_b2.png, …, root.png
  out/masks/<name>/review.jpg   ảnh chồng màu để duyệt nhanh (thân xanh lá, cành vàng, rễ đỏ)
LUÔN duyệt bằng mắt trước khi huấn luyện; xóa file mask sai hoặc sửa tay (vd. si/sanh có rễ khí → không tính là thân).
Cần: pip install -e "packages/pipeline[cv]".
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image

COLORS = {"trunk": (46, 160, 67), "branch": (230, 180, 30), "root": (200, 50, 40)}


def line_points(a, b, n: int = 5, lo: float = 0.05, hi: float = 0.9) -> list[list[float]]:
    """Các điểm dương trải đều trên đoạn a → b (thân uốn / cành cong vẫn thường đi qua gần các điểm này)."""
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


def overlay(image: Image.Image, masks: list[tuple[str, np.ndarray]]) -> Image.Image:
    arr = np.asarray(image.convert("RGB")).astype(np.float32)
    for cls, m in masks:
        arr[m] = arr[m] * 0.45 + np.array(COLORS[cls], np.float32) * 0.55
    return Image.fromarray(arr.astype(np.uint8))


def label_item(model, item: dict, out_dir: Path) -> list[str]:
    def sam(points):
        res = model(item["image"], points=[points], labels=[[1] * len(points)], verbose=False)[0]
        return None if res.masks is None else res.masks.data[0].cpu().numpy() > 0.5

    target = out_dir / item["name"]
    target.mkdir(parents=True, exist_ok=True)
    saved: list[tuple[str, np.ndarray]] = []
    names: list[str] = []

    def save(fname: str, cls: str, mask):
        if mask is None or not mask.any():
            return
        Image.fromarray(mask.astype(np.uint8) * 255).save(target / f"{fname}.png")
        saved.append((cls, mask))
        names.append(fname)

    trunk = sam(trunk_prompt_points(item["base_point_px"], item["apex_point_px"]))
    save("trunk", "trunk", trunk)
    for b in item.get("branches", []):
        m = sam(branch_prompt_points(b["start_px"], b.get("end_px")))
        if m is not None and trunk is not None:
            m = m & ~trunk  # phần chồng lên thân thuộc về thân
        save(f"branch_{b['id']}", "branch", m)
    if item.get("nebari") not in (None, "hidden"):
        m = sam(root_prompt_points(item["base_point_px"], item["base_diameter_px"]))
        if m is not None and trunk is not None:
            m = m & ~trunk
        save("root", "root", m)
    overlay(Image.open(item["image"]), saved).save(target / "review.jpg", quality=85)
    return names


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
