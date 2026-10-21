"""Ảnh chia sẻ (màn 07): ghép "Hôm nay" + "Minh họa sau ~N năm" thành 9:16 hoặc 1:1, có con dấu watermark.

Bố cục theo design/mockups/Share.dc.html: nền mực, tiêu đề Lora, hai ảnh, chân trang con dấu đỏ son + chữ.
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

# design/tokens.json (bảng sáng, nền tối dùng ink)
INK = "#1F2421"
PAPER = "#FBF8F2"
PAPER_DIM = "#ECE7DD"
SEAL = "#B23A2B"
PHOTO_BG = "#E8E1D3"


@lru_cache
def _font(name: str, size: int, weight: int | None = None) -> ImageFont.FreeTypeFont:
    path = resources.files("bonsai_pipeline").joinpath(f"assets/fonts/{name}")
    with resources.as_file(path) as p:
        f = ImageFont.truetype(str(p), size)
    if weight is not None:
        f.set_variation_by_axes([weight])
    return f


def title_font(size: int) -> ImageFont.FreeTypeFont:
    return _font("Lora-Variable.ttf", size, 600)


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


def draw_seal(img: Image.Image, xy: tuple[int, int], size: int) -> None:
    """Con dấu đỏ son với hình cây (như logo trong mockup)."""
    d = ImageDraw.Draw(img)
    x, y = xy
    d.rounded_rectangle([x, y, x + size, y + size], radius=max(2, size // 6), fill=SEAL)
    s, w = size / 24, max(2, round(size / 16))
    # thân + tán + chậu (đơn giản hóa từ icon SVG)
    d.line([(x + 12 * s, y + 20 * s), (x + 12 * s, y + 13 * s), (x + 10 * s, y + 10 * s)], fill=PAPER, width=w)
    d.ellipse([x + 5 * s, y + 6.5 * s, x + 19 * s, y + 11 * s], outline=PAPER, width=w)
    d.line([(x + 7 * s, y + 20 * s), (x + 17 * s, y + 20 * s)], fill=PAPER, width=w)


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
    d.rounded_rectangle([x, y, x + w + pad * 2, y + size + pad * 1.4], radius=size // 3, fill=PAPER)
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
    canvas = Image.new("RGB", (W, H), INK)
    d = ImageDraw.Draw(canvas)
    margin = 48 if fmt == "9x16" else 40
    gap = 8

    tf = title_font(64 if fmt == "9x16" else 52)
    lines = wrap(d, title, tf, W - margin * 2, max_lines=2 if fmt == "1x1" else 3)
    y = margin
    for line in lines:
        d.text((margin, y), line, font=tf, fill=PAPER_DIM)
        y += round(tf.size * 1.3)
    top = y + 16

    footer_h = 120 if fmt == "9x16" else 96
    area_h = H - top - footer_h
    radius = 18
    if fmt == "9x16":
        box = (W - 32 * 2, (area_h - gap) // 2)
        slots = [(32, top), (32, top + box[1] + gap)]
    else:
        box = ((W - margin * 2 - gap) // 2, area_h)
        slots = [(margin, top), (margin + box[0] + gap, top)]
    for photo, label, (x, y0) in zip((before, after), (before_label, after_label), slots):
        _paste_rounded(canvas, _contain(photo, box), (x, y0), radius)
        _chip(canvas, (x + 16, y0 + 16), label, 30 if fmt == "9x16" else 26)

    seal = 52 if fmt == "9x16" else 44
    fy = H - footer_h + (footer_h - seal) // 2
    draw_seal(canvas, (margin, fy), seal)
    ff = body_font(30 if fmt == "9x16" else 26)
    text = wrap(d, footer, ff, W - margin * 2 - seal - 20, max_lines=1)[0]
    d.text((margin + seal + 20, fy + (seal - ff.size) // 2 - 2), text, font=ff, fill=PAPER_DIM)

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
