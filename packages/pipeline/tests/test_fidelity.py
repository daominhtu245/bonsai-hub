import io

import numpy as np
from PIL import Image, ImageDraw

from bonsai_pipeline.fidelity import fidelity_checks, layout_collage, layout_pads, lock_regions, regions
from bonsai_pipeline.schemas import Analysis, DesignOption

from samples import analysis, option

SKY, BARK, LEAF = (180, 200, 220), (110, 80, 55), (60, 140, 50)
SHOOT = (640, 40, 990, 470)  # tán cũ ngoài thiết kế (thuộc cây gốc)


def _scene() -> tuple[Analysis, DesignOption, Image.Image, np.ndarray]:
    a = analysis()
    a["branches"].append({"id": "b6", "start_px": [480, 1150], "end_px": [250, 1180], "direction": "left",
                          "thickness": "medium", "height_ratio": 0.15, "issues": []})
    o = option()
    o["remove_branches"].append({"id": "b6", "reason_vi": "Cành thấp quá"})
    img = Image.new("RGB", (1000, 1500), SKY)
    d = ImageDraw.Draw(img)
    for x in range(0, 1000, 40):  # nền có chi tiết (như ảnh thật) để căn chỉnh có cái bám
        d.line([(x, 0), (x + 30, 1500)], fill=(150, 168, 190), width=6)
    d.rectangle([440, 500, 560, 1300], fill=BARK)  # thân
    d.line([(480, 1150), (250, 1180)], fill=BARK, width=24)  # cành b6 (phải cắt)
    d.rectangle(SHOOT, fill=LEAF)
    cut = Image.new("L", img.size, 0)
    dc = ImageDraw.Draw(cut)
    dc.rectangle([440, 500, 560, 1300], fill=255)
    dc.line([(480, 1150), (250, 1180)], fill=255, width=24)
    dc.rectangle(SHOOT, fill=255)
    return Analysis.model_validate(a), DesignOption.model_validate(o), img, np.asarray(cut) > 0


def _bytes(img: Image.Image) -> bytes:
    buf = io.BytesIO()
    img.save(buf, "WEBP", quality=95)
    return buf.getvalue()


def _paint_pads(img: Image.Image, reg) -> Image.Image:
    out = img.copy()
    d = ImageDraw.Draw(out)
    for p in reg.pads:
        cx, cy = p.center_px
        d.ellipse([cx - p.rx, cy - p.ry, cx + p.rx, cy + p.ry], fill=LEAF)
    return out


def test_layout_pads_follow_silhouette_bottom_up():
    a, o, _, _ = _scene()
    pads = layout_pads(o, a, "si")
    assert len(pads) == 4 and pads[-1].kind == "ficus_apex" and pads[0].kind == "ficus_wide"
    ys = [p.center_px[1] for p in pads]
    assert ys == sorted(ys, reverse=True)  # dưới lên trên
    assert pads[0].rx > pads[-2].rx  # tầng trên nhỏ dần
    assert pads[0].center_px[1] <= 1300 - 1000 * 0.3 + 1  # tầng thấp nhất cách gốc ≥ 30% chiều cao


def test_regions_lock_trunk_and_background():
    a, o, _, cut = _scene()
    reg = regions(a, o, (1000, 1500), species_key="si", cutout=cut)
    ed = reg.editable()
    assert reg.trunk_source == "cutout" and reg.trunk[1200, 500]
    assert not ed[1200, 500] and not ed[30, 30]  # thân dưới + nền: khóa
    p = reg.pads[1]
    assert ed[int(p.center_px[1]), int(p.center_px[0])]  # tầng lá: được vẽ
    assert ed[1170, 330]  # hành lang cành b6 phải cắt: được vẽ (để xóa)
    assert reg.pot[1450, 500]


def test_lock_restores_trunk_and_background_even_if_model_repaints_everything():
    a, o, img, cut = _scene()
    reg = regions(a, o, (1000, 1500), species_key="si", cutout=cut)
    repainted = Image.new("RGB", img.size, (20, 160, 40))  # model "vẽ lại" toàn bộ
    out, info = lock_regions(_bytes(img), _bytes(repainted), reg.editable())
    o_img = np.asarray(Image.open(io.BytesIO(out)).convert("RGB")).astype(int)
    assert np.abs(o_img[1200, 500] - BARK).max() < 12  # thân giữ nguyên
    assert np.abs(o_img[30, 30] - SKY).max() < 12  # nền giữ nguyên
    p = reg.pads[1]
    assert np.abs(o_img[int(p.center_px[1]), int(p.center_px[0])] - (20, 160, 40)).max() < 12  # tầng lá theo ảnh sinh
    assert info["locked_change"] > 0.2 and 0 < info["editable_ratio"] < 1


def test_checks_pass_for_faithful_render():
    a, o, img, cut = _scene()
    reg = regions(a, o, (1000, 1500), species_key="si", cutout=cut)
    good = _paint_pads(img, reg)
    d = ImageDraw.Draw(good)
    d.line([(480, 1150), (250, 1180)], fill=SKY, width=30)  # đã cắt b6
    d.rectangle(SHOOT, fill=SKY)  # đã dọn chồi thừa
    d.rectangle([440, 500, 560, 1300], fill=BARK)
    res = fidelity_checks(_bytes(img), _bytes(good), a, o, reg)
    assert res["fails"] == [], res
    assert min(res["pad_cover"]) > 0.3  # phần thân lộ qua tầng lá vẫn tính là trống


def test_checks_catch_missing_pads_leftover_branch_and_outside_foliage():
    a, o, img, cut = _scene()
    reg = regions(a, o, (1000, 1500), species_key="si", cutout=cut)
    res = fidelity_checks(_bytes(img), _bytes(img), a, o, reg)  # model trả lại gần như ảnh gốc
    assert "pads_missing" in res["fails"] and "removed_branch_present" in res["fails"]
    assert res["removed_still_present"] == ["b6"]
    leftover = _paint_pads(img, reg)  # model vẽ đủ tầng nhưng giữ nguyên tán cũ ngoài thiết kế (SHOOT)
    res = fidelity_checks(_bytes(img), _bytes(leftover), a, o, reg)
    assert "foliage_outside_design" in res["fails"] and "pads_missing" not in res["fails"]


def test_collage_places_pads_and_pot():
    a, o, img, cut = _scene()
    pads = layout_pads(o, a, "si")
    col = np.asarray(Image.open(io.BytesIO(layout_collage(_bytes(img), a, o, pads))).convert("RGB")).astype(int)
    p = pads[0]
    assert np.abs(col[int(p.center_px[1]), int(p.center_px[0])] - SKY).sum() > 60  # có tầng lá ghép vào
    assert np.abs(col[30, 30] - SKY).max() < 12  # nền giữ nguyên


def test_alignment_undoes_model_shift_and_skips_when_already_aligned():
    a, o, img, cut = _scene()
    reg = regions(a, o, (1000, 1500), species_key="si", cutout=cut)
    shifted = Image.new("RGB", img.size, SKY)
    shifted.paste(img, (18, 0))  # model xê dịch ảnh 18 px
    _, info = lock_regions(_bytes(img), _bytes(shifted), reg.editable())
    assert info["aligned"] and info["diff_after"] < info["diff_before"] * 0.5  # cảnh ít chi tiết: chỉ xét độ khớp
    _, info = lock_regions(_bytes(img), _bytes(img), reg.editable())
    assert not info["aligned"]


def test_foliage_ignores_sand_bark_and_soil():
    from bonsai_pipeline.fidelity import foliage

    px = np.array([[[60, 140, 50], [90, 150, 60], [205, 190, 160], [150, 120, 85], [110, 80, 55], [120, 95, 70]]], np.uint8)
    assert foliage(px).tolist() == [[True, True, False, False, False, False]]  # lá, lá non | cát, vỏ, thân, đất
