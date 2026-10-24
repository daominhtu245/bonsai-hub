"""Ghép ảnh xem trước thiết kế người dùng từ thư viện chi tiết cây (assets/studio): ảnh phôi + chậu + tầng lá + rêu/đá.

Dùng làm ảnh chia sẻ "nhờ góp ý" (không tốn AI). Cùng thư viện và cùng cách đặt với màn Tự thiết kế ở web.
"""

from __future__ import annotations

import io
import json
from functools import lru_cache
from importlib import resources

from PIL import Image, ImageDraw

from .schemas import Analysis
from .user_design import UserDesignIn

ASSETS = "assets/studio"


@lru_cache
def manifest() -> dict[str, dict]:
    text = resources.files("bonsai_pipeline").joinpath(f"{ASSETS}/manifest.json").read_text(encoding="utf-8")
    return {m["key"]: m for m in json.loads(text)}


@lru_cache(maxsize=64)
def sprite(key: str) -> Image.Image:
    data = resources.files("bonsai_pipeline").joinpath(f"{ASSETS}/{manifest()[key]['file']}").read_bytes()
    return Image.open(io.BytesIO(data)).convert("RGBA")


def _place(canvas: Image.Image, key: str, cx: float, cy: float, width: float, *, rotation: float = 0, flip: bool = False,
           anchor_y: float = 0.5) -> None:
    if key not in manifest() or width < 4:
        return
    im = sprite(key)
    h = max(1, round(width * im.height / im.width))
    im = im.resize((max(1, round(width)), h), Image.Resampling.LANCZOS)
    if flip:
        im = im.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    top = cy - h * anchor_y
    if rotation:
        im = im.rotate(-rotation, resample=Image.Resampling.BICUBIC, expand=True)  # PIL quay ngược chiều kim đồng hồ
        top = cy - im.height * anchor_y
    canvas.alpha_composite(im, (round(cx - im.width / 2), round(top)))


def compose(photo: bytes, analysis: Analysis, d: UserDesignIn, *, mark_cuts: bool = True) -> bytes:
    base = Image.open(io.BytesIO(photo)).convert("RGBA")
    t = analysis.trunk
    if t is None:
        raise ValueError("analysis has no trunk")
    bx, by = t.base_point_px
    layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    if d.pot_kind:
        meta = manifest().get(d.pot_kind, {})
        _place(layer, d.pot_kind, d.pot_x if d.pot_x is not None else bx, by, d.pot_width or t.base_diameter_px * 3,
               anchor_y=meta.get("soil_y", 0.2))
    for a in d.accents:
        _place(layer, a.kind, a.center_px[0], a.center_px[1], a.width, flip=a.flip)
    out = Image.alpha_composite(base, layer)
    if mark_cuts:
        draw = ImageDraw.Draw(out)
        r = max(6, round(min(base.size) * 0.012))
        for b in analysis.branches:
            if b.id in d.removed:
                x, y = b.start_px
                draw.line([(x - r, y - r), (x + r, y + r)], fill=(194, 59, 43, 255), width=max(2, r // 3))
                draw.line([(x + r, y - r), (x - r, y + r)], fill=(194, 59, 43, 255), width=max(2, r // 3))
    pads = Image.new("RGBA", base.size, (0, 0, 0, 0))
    for p in d.pads:
        if p.kind:
            _place(pads, p.kind, p.center_px[0], p.center_px[1], p.rx * 2, rotation=p.rotation, flip=p.flip)
    out = Image.alpha_composite(out, pads).convert("RGB")
    buf = io.BytesIO()
    out.save(buf, format="JPEG", quality=88)
    return buf.getvalue()
