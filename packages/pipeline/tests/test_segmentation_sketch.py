import io
import json
import re
from pathlib import Path

import numpy as np
from PIL import Image

from bonsai_pipeline.schemas import Analysis, DesignOption
from bonsai_pipeline.segmentation import mask_iou, measure_mask, segment_trunk
from bonsai_pipeline.sketch import COLORS, build_scene, to_png, to_svg

from samples import analysis, option

TOKENS = Path(__file__).resolve().parents[3] / "design" / "tokens.json"


def _trunk_mask(h=300, w=200):
    m = np.zeros((h, w), dtype=bool)
    for y in range(50, 280):  # thân thuôn: gốc rộng 40, ngọn rộng 10
        half = int(5 + 15 * (y - 50) / 230)
        m[y, 100 - half : 100 + half] = True
    return m


def test_measure_mask():
    m = measure_mask(_trunk_mask())
    assert m.source == "yolo" and not m.cv_fallback
    assert m.height_px == 230 and m.base_point_px[1] == 279 and m.apex_point_px[1] == 50
    assert 34 <= m.base_diameter_px <= 40


def test_empty_mask_is_none():
    assert measure_mask(np.zeros((100, 100), dtype=bool)) is None


def test_iou():
    a = _trunk_mask()
    assert mask_iou(a, a) == 1.0
    shifted = np.roll(a, 30, axis=1)
    assert mask_iou(a, shifted) < 0.5
    assert mask_iou(a, a, up_to_ratio=0.6, base_y=279) == 1.0


class _FakeSeg:
    def __init__(self, mask):
        self.mask = mask

    def segment(self, image):
        return self.mask


def _photo(w=1000, h=1500):
    buf = io.BytesIO()
    Image.new("RGB", (w, h), (200, 190, 170)).save(buf, format="WEBP")
    return buf.getvalue()


def test_segment_uses_mask_or_falls_back():
    a = Analysis.model_validate(analysis())
    res = segment_trunk(_photo(200, 300), a, segmenter=_FakeSeg(_trunk_mask()))
    assert res.measure.source == "yolo" and res.mask_png() is not None
    res = segment_trunk(_photo(200, 300), a, segmenter=_FakeSeg(None))
    assert res.measure.cv_fallback and res.measure.height_px == 1000 and res.mask is None


def test_sketch_colors_match_tokens():
    light = json.loads(TOKENS.read_text())["color"]["light"]
    mapping = json.loads(TOKENS.read_text())["color"]["sketch"]
    assert COLORS["cut"] == light[mapping["cut"]]
    assert COLORS["keep"] == light[mapping["keep"]]
    assert COLORS["new-branch"] == light[mapping["new-branch"]]
    assert COLORS["canopy"] == light[mapping["canopy-outline"]]


def test_sketch_svg_and_png():
    a = Analysis.model_validate(analysis())
    scene = build_scene(a, DesignOption.model_validate(option()), (1000, 1500))
    assert scene.counts == {"chop_apex": True, "cut": 2, "keep": 3, "new": 1}
    svg = to_svg(scene)
    assert svg.startswith("<svg") and 'viewBox="0 0 1000 1500"' in svg
    for layer in ("canopy", "keep", "cut", "new-branch", "apex"):
        assert f'data-layer="{layer}"' in svg
    assert "Ngọn mới" in svg and 'marker-end="url(#arrow)"' in svg
    assert len(re.findall(r'<polyline[^>]*stroke="#C23B2B"', svg)) == 3  # 2 cành + đoạn ngọn bị hạ
    png = Image.open(io.BytesIO(to_png(scene, _photo())))
    assert png.size == (1000, 1500)
    # nền giảm sáng 30%: 200 → 140
    assert png.getpixel((5, 5))[0] in range(136, 145)
    # có nét màu đỏ son quanh dấu ✕ của b2
    region = np.asarray(png.crop((560, 920, 660, 1010)))
    reds = np.argwhere((region[..., 0] > 150) & (region[..., 1] < 90))
    assert len(reds)


def test_branch_without_end_is_extrapolated():
    a = Analysis.model_validate(analysis())
    scene = build_scene(a, DesignOption.model_validate(option()), (1000, 1500))
    keep_lines = [it for it in scene.items if getattr(it, "layer", "") == "keep"]
    b3 = keep_lines[1].points
    assert b3[1][0] > b3[0][0] and b3[1][1] < b3[0][1]  # hướng phải, lên


def test_no_chop_when_apex_kept():
    a = Analysis.model_validate(analysis())
    o = option(apex={"point_px": [520, 305], "lean": "forward"})
    assert build_scene(a, DesignOption.model_validate(o), (1000, 1500)).counts["chop_apex"] is False
