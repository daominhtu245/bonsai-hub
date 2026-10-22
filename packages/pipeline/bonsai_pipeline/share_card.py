"""Ảnh chia sẻ (màn 07): ghép "Hôm nay" + "Minh họa sau ~N năm" thành 9:16 hoặc 1:1, có con dấu watermark.

Phong cách hệ thiết kế v2: nền sáng trung tính, chữ Be Vietnam Pro, biểu tượng thương hiệu màu chủ đạo.
Ảnh tương lai luôn mang nhãn "Minh họa" (nguyên tắc trung thực với AI).
"""

from __future__ import annotations

import io
from functools import lru_cache
from importlib import resources
from typing import Literal

from PIL import Image, ImageDraw, ImageFont, ImageOps

Format = Literal["9x16", "1x1"]
SIZES: dict[str, tuple[int, int]] = {"9x16": (1080, 1920), "1x1": (1080, 1080)}

# design/tokens.json v2 (bảng sáng)
BG = "#F6F6F4"
SURFACE = "#FFFFFF"
INK = "#191917"
INK_MUTED = "#62615C"
LINE = "#E6E5E1"
PRIMARY = "#2D5B3C"
PHOTO_BG = "#ECEBE7"


@lru_cache
def _font(name: str, size: int, weight: int | None = None) -> ImageFont.FreeTypeFont:
    path = resources.files("bonsai_pipeline").joinpath(f"assets/fonts/{name}")
    with resources.as_file(path) as p:
        f = ImageFont.truetype(str(p), size)
    if weight is not None:
        f.set_variation_by_axes([weight])
    return f


def title_font(size: int) -> ImageFont.FreeTypeFont:
    return _font("BeVietnamPro-SemiBold.ttf", size)


def body_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    return _font("BeVietnamPro-SemiBold.ttf" if bold else "BeVietnamPro-Regular.ttf", size)


def wrap(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont, width: int, max_lines: int = 3) -> list[str]:
    words, lines, cur = text.split(), [], ""
    for w in words:
        trial = f"{cur} {w}".strip()
        if draw.textlength(trial, font=font) <= width:
            cur = trial
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    if len(lines) > max_lines:
        lines = lines[:max_lines]
        while draw.textlength(lines[-1] + "…", font=font) > width and " " in lines[-1]:
            lines[-1] = lines[-1].rsplit(" ", 1)[0]
        lines[-1] += "…"
    return lines


def draw_brand_mark(img: Image.Image, xy: tuple[int, int], size: int) -> None:
    """Ô vuông màu chủ đạo + mầm cây (giống BrandMark ở web)."""
    d = ImageDraw.Draw(img)
    x, y = xy
    d.rounded_rectangle([x, y, x + size, y + size], radius=max(3, size // 4), fill=PRIMARY)
    s, w = size / 24, max(2, round(size / 13))
    d.line([(x + 12 * s, y + 19 * s), (x + 12 * s, y + 10 * s)], fill=SURFACE, width=w)
    d.ellipse([x + 5 * s, y + 6 * s, x + 12 * s, y + 11 * s], outline=SURFACE, width=w)
    d.ellipse([x + 12 * s, y + 4 * s, x + 19 * s, y + 9 * s], outline=SURFACE, width=w)


def _contain(photo: bytes, box: tuple[int, int]) -> Image.Image:
    """Đặt trọn ảnh vào ô (không cắt mất ngọn/chậu), phần thừa là nền ảnh."""
    img = Image.open(io.BytesIO(photo)).convert("RGB")
    img = ImageOps.contain(img, box, Image.Resampling.LANCZOS)
    out = Image.new("RGB", box, PHOTO_BG)
    out.paste(img, ((box[0] - img.width) // 2, (box[1] - img.height) // 2))
    return out


def _paste_rounded(canvas: Image.Image, img: Image.Image, xy: tuple[int, int], radius: int) -> None:
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, img.width - 1, img.height - 1], radius=radius, fill=255)
    canvas.paste(img, xy, mask)


def _chip(canvas: Image.Image, xy: tuple[int, int], text: str, size: int) -> None:
    d = ImageDraw.Draw(canvas)
    f = body_font(size, bold=True)
    w = d.textlength(text, font=f)
    pad = size // 2
    x, y = xy
    d.rounded_rectangle([x, y, x + w + pad * 2, y + size + pad * 1.4], radius=size // 4, fill=SURFACE)
    d.text((x + pad, y + pad * 0.55), text, font=f, fill=INK)


def compose(
    before: bytes,
    after: bytes,
    *,
    fmt: Format,
    title: str,
    before_label: str,
    after_label: str,
    footer: str,
    quality: int = 88,
) -> bytes:
    W, H = SIZES[fmt]
    canvas = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(canvas)
    margin = 48 if fmt == "9x16" else 40

    tf = title_font(56 if fmt == "9x16" else 46)
    lines = wrap(d, title, tf, W - margin * 2, max_lines=2 if fmt == "1x1" else 3)
    y = margin
    for line in lines:
        d.text((margin, y), line, font=tf, fill=INK)
        y += round(tf.size * 1.28)
    top = y + 16

    footer_h = 120 if fmt == "9x16" else 96
    area_h = H - top - footer_h
    radius = 20
    gap = 16
    if fmt == "9x16":
        box = (W - margin * 2, (area_h - gap) // 2)
        slots = [(margin, top), (margin, top + box[1] + gap)]
    else:
        box = ((W - margin * 2 - gap) // 2, area_h)
        slots = [(margin, top), (margin + box[0] + gap, top)]
    for photo, label, (x, y0) in zip((before, after), (before_label, after_label), slots):
        d.rounded_rectangle([x - 1, y0 - 1, x + box[0], y0 + box[1]], radius=radius, outline=LINE, width=2)
        _paste_rounded(canvas, _contain(photo, box), (x, y0), radius)
        _chip(canvas, (x + 16, y0 + 16), label, 30 if fmt == "9x16" else 26)

    mark = 48 if fmt == "9x16" else 40
    fy = H - footer_h + (footer_h - mark) // 2
    draw_brand_mark(canvas, (margin, fy), mark)
    ff = body_font(28 if fmt == "9x16" else 24)
    text = wrap(d, footer, ff, W - margin * 2 - mark - 20, max_lines=1)[0]
    d.text((margin + mark + 18, fy + (mark - ff.size) // 2 - 2), text, font=ff, fill=INK_MUTED)

    buf = io.BytesIO()
    canvas.save(buf, format="JPEG", quality=quality, optimize=True, progressive=True)
    return buf.getvalue()


def share_title(species_vi: str | None, height_cm: float | None, years: int | None) -> str:
    who = f"Phôi {species_vi.lower()}" if species_vi else "Phôi bonsai"
    if height_cm:
        who += f" {height_cm:g} cm"
    when = f"{years} năm nữa" if years else "Vài năm nữa"
    return f"{who}, {when} sẽ như thế này"


def share_footer(garden_name: str | None, phone: str | None) -> str:
    parts = ["Thiết kế bởi Bonsai AI"]
    if garden_name:
        parts.append(f"Vườn {garden_name}")
    if phone:
        parts.append(phone)
    return " · ".join(parts)
