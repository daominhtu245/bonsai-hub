import io

import numpy as np
from PIL import Image

from bonsai_pipeline.cutout import Cutout, main_object, make_cutout, shift_analysis
from bonsai_pipeline.schemas import Analysis

from samples import analysis


class FakeRemover:
    name = "fake"

    def __init__(self, alpha):
        self._alpha = alpha

    def alpha(self, img):
        return self._alpha


def _photo(w=400, h=600):
    buf = io.BytesIO()
    Image.new("RGB", (w, h), (120, 160, 200)).save(buf, "JPEG")
    return buf.getvalue()


def test_main_object_drops_hand_from_edge_and_keeps_nearby_leaf():
    a = np.zeros((600, 400), np.float32)
    a[100:550, 170:230] = 1  # phôi giữa ảnh
    a[90:96, 175:185] = 1  # lá rời sát ngọn
    a[400:470, 0:90] = 1  # bàn tay ló vào từ mép trái
    a[300:380, 120:166] = 1  # khối lớn nằm sát phôi (vd. bàn tay đỡ cây) — không nhặt
    keep = main_object(a)
    assert keep[300, 200] and keep[92, 180]
    assert not keep[430, 40] and not keep[340, 140]


def test_make_cutout_crops_and_sketches():
    a = np.zeros((600, 400), np.float32)
    a[100:550, 150:250] = 1
    cut = make_cutout(_photo(), FakeRemover(a))
    assert cut.ok and cut.metrics["fg"] > 0.01
    x0, y0, x1, y1 = cut.box
    assert x0 < 150 and x1 > 250 and y0 < 100 and y1 <= 600
    img, sk = Image.open(io.BytesIO(cut.image_jpeg)), Image.open(io.BytesIO(cut.sketch_png))
    assert img.size == sk.size == cut.size
    assert img.getpixel((2, 2)) == (255, 255, 255) or sum(img.getpixel((2, 2))) > 740  # nền trắng
    assert Image.open(io.BytesIO(cut.mask_png)).size == (400, 600)
    assert Image.open(io.BytesIO(cut.crop_jpeg)).size == cut.size


def test_bad_mask_falls_back():
    assert make_cutout(_photo(), FakeRemover(np.zeros((600, 400), np.float32))).reason == "mask_too_small"
    assert make_cutout(_photo(), FakeRemover(np.ones((600, 400), np.float32))).reason == "mask_too_large"
    top_only = np.zeros((600, 400), np.float32)
    top_only[20:200, 120:280] = 1  # model chỉ giữ tán lá phía trên, mất thân và gốc
    assert make_cutout(_photo(), FakeRemover(top_only)).reason == "missing_base"

    class Broken(FakeRemover):
        def alpha(self, img):
            raise RuntimeError("onnx")

    assert not make_cutout(_photo(), Broken(None)).ok


def test_shift_analysis_moves_every_point():
    a = Analysis.model_validate(analysis())
    s = shift_analysis(a, 30, 40)
    assert s.trunk.base_point_px == [a.trunk.base_point_px[0] + 30, a.trunk.base_point_px[1] + 40]
    assert s.trunk.apex_point_px[1] == a.trunk.apex_point_px[1] + 40
    assert all(sb.start_px[0] == b.start_px[0] + 30 for sb, b in zip(s.branches, a.branches))
    assert s.trunk.height_px == a.trunk.height_px
    assert shift_analysis(a, 0, 0) is a
    assert Cutout(True, box=(10, 20, 110, 220)).size == (100, 200)
