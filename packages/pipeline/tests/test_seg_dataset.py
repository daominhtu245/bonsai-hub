import sys
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

pytest.importorskip("cv2")

from bonsai_pipeline.seg_dataset import build_dataset, mask_to_polygons, yolo_label_line

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools" / "seg"))
from label_with_sam import trunk_prompt_points  # noqa: E402


def _mask():
    m = np.zeros((200, 100), dtype=bool)
    m[40:190, 40:60] = True
    m[5:8, 5:8] = True  # mảnh vụn
    return m


def test_polygons_normalized_and_noise_dropped():
    polys = mask_to_polygons(_mask())
    assert len(polys) == 1
    p = polys[0]
    assert p.min() >= 0 and p.max() <= 1
    assert yolo_label_line(p).startswith("0 ")


def test_build_dataset(tmp_path):
    (tmp_path / "img").mkdir()
    (tmp_path / "mask").mkdir()
    for i in range(4):
        Image.new("RGB", (100, 200)).save(tmp_path / "img" / f"p{i}.webp")
        Image.fromarray(_mask().astype(np.uint8) * 255).save(tmp_path / "mask" / f"p{i}.png")
    stats = build_dataset(tmp_path / "img", tmp_path / "mask", tmp_path / "out")
    assert stats == {"train": 3, "val": 1, "skipped": 0}
    assert "names:\n  0: trunk" in (tmp_path / "out" / "dataset.yaml").read_text()
    assert len(list((tmp_path / "out" / "labels" / "train").glob("*.txt"))) == 3


def test_prompt_points_follow_trunk():
    pts = trunk_prompt_points([500, 1300], [520, 300], n=3)
    assert pts[0][1] > pts[-1][1] and all(500 <= x <= 520 for x, _ in pts)
