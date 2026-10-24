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


def test_build_multiclass_dataset(tmp_path):
    from label_with_sam import branch_prompt_points  # noqa: F401 (tools import ok)

    (tmp_path / "img").mkdir()
    for i in range(3):
        Image.new("RGB", (100, 200)).save(tmp_path / "img" / f"p{i}.jpg")
        d = tmp_path / "mask" / f"p{i}"
        d.mkdir(parents=True)
        Image.fromarray(_mask().astype(np.uint8) * 255).save(d / "trunk.png")
        b = np.zeros((200, 100), bool)
        b[100:110, 60:95] = True
        Image.fromarray(b.astype(np.uint8) * 255).save(d / "branch_b1.png")
        Image.fromarray(np.roll(b, -40, axis=0).astype(np.uint8) * 255).save(d / "branch_b2.png")
        Image.new("RGB", (100, 200)).save(d / "review.jpg")  # bỏ qua
    # ảnh chỉ có cành, không có thân → bỏ
    Image.new("RGB", (100, 200)).save(tmp_path / "img" / "nobase.jpg")
    (tmp_path / "mask" / "nobase").mkdir()
    Image.fromarray(np.zeros((200, 100), np.uint8)).save(tmp_path / "mask" / "nobase" / "branch_b1.png")
    stats = build_dataset(tmp_path / "img", tmp_path / "mask", tmp_path / "out")
    assert stats["skipped"] == 1 and stats["train"] + stats["val"] == 3
    yaml = (tmp_path / "out" / "dataset.yaml").read_text()
    assert "  0: trunk\n  1: branch\n  2: root\n" in yaml
    label = next((tmp_path / "out" / "labels").rglob("p*.txt")).read_text().splitlines()
    assert [ln.split()[0] for ln in label] == ["1", "1", "0"]  # 2 cành riêng + 1 thân


def test_label_item_writes_one_file_per_instance(tmp_path):
    from types import SimpleNamespace

    from label_with_sam import label_item

    img = tmp_path / "p.jpg"
    Image.new("RGB", (100, 200), (120, 110, 90)).save(img)

    class FakeSAM:
        def __call__(self, image, points, labels, verbose):
            m = np.zeros((200, 100), bool)
            for x, y in points[0]:
                m[max(0, int(y) - 5):int(y) + 5, max(0, int(x) - 5):int(x) + 5] = True
            tensor = SimpleNamespace(cpu=lambda: SimpleNamespace(numpy=lambda: m.astype(float)))
            return [SimpleNamespace(masks=SimpleNamespace(data=[tensor]))]

    item = {"name": "p", "image": str(img), "base_point_px": [50, 190], "apex_point_px": [50, 20], "base_diameter_px": 20,
            "branches": [{"id": "b1", "start_px": [50, 120], "end_px": [90, 110]}], "nebari": "good"}
    names = label_item(FakeSAM(), item, tmp_path / "masks")
    assert names == ["trunk", "branch_b1", "root"]
    assert (tmp_path / "masks" / "p" / "review.jpg").exists()
