"""Phân tích bằng mask (local_analysis), bộ thiết kế bằng luật (rule_designer), kiểm tra chất lượng ảnh."""

import io
import itertools
import math

import numpy as np
import pytest
from PIL import Image, ImageDraw, ImageFilter

from bonsai_pipeline.local_analysis import analyze_parts, movement_of, taper_of, trunk_shape
from bonsai_pipeline.photo_quality import check_photo
from bonsai_pipeline.rule_designer import design_by_rules
from bonsai_pipeline.rule_engine import compute_targets, validate_design
from bonsai_pipeline.schemas import Analysis
from bonsai_pipeline.segmentation import Parts

from samples import analysis

W, H = 800, 1000


def trunk_mask(center=lambda t: 0.0, base_half=40, top_half=12, top=200, bottom=900):
    """Thân từ gốc (t=0) tới ngọn (t=1); `center(t)` lệch ngang theo phân số chiều cao."""
    m = np.zeros((H, W), bool)
    for y in range(top, bottom + 1):
        t = (bottom - y) / (bottom - top)
        cx = W // 2 + int(center(t) * (bottom - top))
        half = int(base_half + (top_half - base_half) * t)
        m[y, cx - half:cx + half] = True
    return m


def branch(y, side, length=180, thick=8):
    m = np.zeros((H, W), bool)
    x0, x1 = sorted((W // 2, W // 2 + side * length))
    m[y - thick:y + thick, x0:x1] = True
    return m


@pytest.mark.parametrize("center,expected", [
    (lambda t: 0.0, "straight"),
    (lambda t: 0.06 * math.sin(math.pi * t), "gentle_curve"),
    (lambda t: 0.07 * math.sin(2 * math.pi * t), "s_curve"),
    (lambda t: 0.5 * t, "leaning"),
])
def test_movement(center, expected):
    mv, lean, _ = movement_of(trunk_shape(trunk_mask(center)))
    assert mv == expected
    if expected == "leaning":
        assert lean > 25


def test_taper():
    assert taper_of(trunk_shape(trunk_mask())) == "good"
    assert taper_of(trunk_shape(trunk_mask(base_half=20, top_half=40))) == "reverse"
    assert taper_of(trunk_shape(trunk_mask(base_half=30, top_half=28))) == "weak"


def test_analyze_parts_builds_p1_compatible_analysis():
    roots = np.zeros((H, W), bool)
    roots[880:930, 260:460] = True  # xòe sang trái
    parts = Parts(trunk_mask(), [branch(650, -1), branch(560, 1), branch(645, 1)], roots, trunk_conf=0.9, has_branch_class=True)
    res = analyze_parts(parts, (W, H), species_key="si")
    assert res.confident, res.reasons
    a = res.analysis
    assert [b.id for b in a.branches] == ["b1", "b2", "b3"] and a.branches[0].height_ratio <= a.branches[1].height_ratio
    assert {a.branches[0].direction, a.branches[1].direction} == {"left", "right"}
    assert "bar_branch" in a.branches[0].issues and "bar_branch" in a.branches[1].issues  # cùng độ cao, hai phía
    assert a.nebari.quality == "good" and a.nebari.spread_side == "left"
    assert a.trunk.height_px == 701 and a.species.guess == "si"
    Analysis.model_validate(a.model_dump())  # qua đúng schema P1


@pytest.mark.parametrize("parts,reason", [
    (Parts(None, [], None), "no_trunk_mask"),
    (Parts(trunk_mask(), [], None, trunk_conf=0.9, has_branch_class=False), "model_has_no_branch_class"),
    (Parts(trunk_mask(), [], None, trunk_conf=0.2, has_branch_class=True), "low_trunk_confidence"),
    (Parts(trunk_mask(top=800), [], None, trunk_conf=0.9, has_branch_class=True), "trunk_too_short_in_frame"),
])
def test_not_confident_falls_back(parts, reason):
    res = analyze_parts(parts, (W, H), species_key=None)
    assert not res.confident and reason in res.reasons


def _design(a: dict):
    an = Analysis.model_validate(a)
    targets = compute_targets(an, image_size=(1000, 1500), real_height_cm=60)
    return an, targets, design_by_rules(an, targets)


def test_rule_design_valid_and_follows_rules():
    an, targets, d = _design(analysis())
    assert validate_design(d, an, targets) == []
    assert d.options[0].style_key in ("moyogi", "vn_long")  # thân chữ S
    o = d.options[0]
    removed = {r.id: r.reason_vi for r in o.remove_branches}
    assert "b5" in removed  # eye_poke
    assert ("b1" in removed) != ("b2" in removed)  # cặp cành chống: bỏ đúng một
    assert "b2" in removed  # b1 to hơn → giữ b1
    assert next(k.role for k in o.keep_branches if k.id == "b1") == "first_branch"


def test_single_leader_kept():
    a = analysis()
    a["trunk"] = {**a["trunk"], "base_diameter_px": 170}  # tỉ lệ 5,9 → không hạ ngọn
    a["branches"] += [
        {"id": "b6", "start_px": [505, 400], "direction": "up", "thickness": "thin", "height_ratio": 0.9, "issues": []},
        {"id": "b7", "start_px": [512, 420], "direction": "up", "thickness": "medium", "height_ratio": 0.88, "issues": []},
    ]
    _, _, d = _design(a)
    removed = {r.id: r.reason_vi for r in d.options[0].remove_branches}
    assert "b6" not in removed and removed["b7"].startswith("Cạnh tranh ngọn")


def test_no_branches_suggests_new_first_branch():
    _, _, d = _design(analysis(branches=[]))
    o = d.options[0]
    assert o.keep_branches == [] and o.new_branches_needed and "cành thứ nhất" in o.new_branches_needed[0].note_vi


@pytest.mark.parametrize("movement,lean", list(itertools.product(
    ["straight", "gentle_curve", "s_curve", "strong_twist", "leaning", "uncertain"], [-40, -12, 0, 8, 30])))
def test_rule_design_always_passes_hard_rules(movement, lean):
    a = analysis()
    a["trunk"] = {**a["trunk"], "movement": movement, "lean_angle_deg": lean}
    an, targets, d = _design(a)  # design_by_rules tự kiểm validate_design, lỗi sẽ raise
    assert 2 <= len(d.options) <= 3


def _photo(blur=0, brightness=None) -> bytes:
    img = Image.new("RGB", (800, 1000), (200, 190, 170))
    d = ImageDraw.Draw(img)
    for x in range(0, 800, 20):
        d.line([(x, 0), (x, 1000)], fill=(60, 50, 40), width=3)
    if blur:
        img = img.filter(ImageFilter.GaussianBlur(blur))
    if brightness is not None:
        img = Image.new("RGB", img.size, (brightness,) * 3)
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


def test_photo_quality():
    assert check_photo(_photo()).usable
    assert "blurry" in check_photo(_photo(blur=8)).issues
    assert "too_dark" in check_photo(_photo(brightness=10)).issues
    assert "overexposed" in check_photo(_photo(brightness=250)).issues
    small = io.BytesIO()
    Image.open(io.BytesIO(_photo())).resize((200, 250)).save(small, format="JPEG")
    assert "too_small" in check_photo(small.getvalue()).issues


def test_geometry_drafts_one_object_per_branch():
    from bonsai_pipeline.labeling import geometry_drafts, mask_png, read_mask

    objs = geometry_drafts(Analysis.model_validate(analysis()), (1000, 1500))
    ids = [o.id for o in objs]
    assert ids == ["trunk", "branch_b1", "branch_b2", "branch_b3", "branch_b4", "branch_b5", "root"]
    trunk = objs[0].mask
    assert trunk[1290, 500] and not trunk[100, 100]  # gốc thuộc thân, góc ảnh thì không
    assert all(not (o.mask & trunk).any() for o in objs[1:])  # cành, rễ không chồng lên thân
    back = read_mask(mask_png(trunk), (1000, 1500))
    assert (back == trunk).all()
    with pytest.raises(ValueError):
        read_mask(mask_png(trunk), (100, 100))
