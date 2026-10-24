import io

import pytest
from PIL import Image, ImageDraw

from bonsai_pipeline import art_styles, timelapse


def _photo(color=(70, 110, 60)):
    img = Image.new("RGB", (400, 600), (220, 220, 215))
    d = ImageDraw.Draw(img)
    d.rectangle([180, 300, 220, 560], fill=(90, 60, 40))
    d.ellipse([80, 120, 320, 340], fill=color)
    buf = io.BytesIO()
    img.save(buf, "JPEG")
    return buf.getvalue()


@pytest.mark.parametrize("style", art_styles.STYLES)
def test_stylize_keeps_size_and_is_paper_like(style):
    out = Image.open(io.BytesIO(art_styles.stylize(_photo(), style)))
    assert out.format == "WEBP" and out.size == (400, 600)
    px = out.convert("RGB")
    r, g, b = px.getpixel((10, 10))
    assert min(r, g, b) > 180  # nền sáng thành giấy
    assert sum(px.getpixel((200, 450))) < sum(px.getpixel((10, 10)))  # thân tối hơn nền


def test_stylize_rejects_unknown():
    with pytest.raises(ValueError):
        art_styles.stylize(_photo(), "oil")


def test_timelapse_frames_and_fallback(monkeypatch):
    stages = [(_photo(), "Phôi hôm nay"), (_photo((40, 140, 50)), "Sau 5 năm")]
    frames = list(timelapse.frames(stages))
    hold, fade = int(timelapse.HOLD_S * timelapse.FPS), int(timelapse.FADE_S * timelapse.FPS)
    assert len(frames) == hold + fade + hold * 2 and frames[0].shape == (timelapse.H, timelapse.W, 3)
    monkeypatch.setattr(timelapse, "_ffmpeg", lambda: None)
    data, ctype = timelapse.render(stages)
    assert ctype == "image/webp" and Image.open(io.BytesIO(data)).n_frames > 2


def test_technical_sheet_numbers_match_rows():
    import re

    from bonsai_pipeline.schemas import Analysis, DesignOption
    from bonsai_pipeline.tech_drawing import technical_sheet
    from samples import analysis, option

    svg, rows = technical_sheet(Analysis.model_validate(analysis()), DesignOption.model_validate(option()), (1000, 1500), 60)
    tech = svg.split('data-layer="tech"', 1)[1]
    assert sorted(int(n) for n in re.findall(r">(\d+)</text>", tech)) == [r.no for r in rows]
    assert [r.action for r in rows] == sorted((r.action for r in rows), key=["cut", "wire", "grow"].index)  # cắt trước
    assert all(r.gauge_mm for r in rows if r.action == "wire") and 'marker-end="url(#bend)"' in tech
