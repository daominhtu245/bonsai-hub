"""A5 — Bản vẽ thiết kế từ JSON P1 + P2 (code, không dùng AI).

Một "cảnh" gồm các nét có lớp; xuất ra:
- SVG trong suốt cùng kích thước ảnh, đè lên ảnh gốc ở giao diện (bật/tắt từng lớp qua `data-layer`).
- PNG = ảnh gốc giảm sáng 30% + nét vẽ, làm điều kiện cho model ảnh ở P3 (không có chữ).

Ký hiệu thống nhất với docs/ui-spec.md: cắt = seal nét đứt + ✕; giữ = leaf liền; nuôi mới = brass + mũi tên;
khung tán = ink nét đứt mảnh, tam giác không cân; ngọn = chấm ink + nhãn "Ngọn mới".
"""

from __future__ import annotations

import io
import math
from dataclasses import dataclass, field
from xml.sax.saxutils import escape

from PIL import Image, ImageDraw, ImageEnhance

from .schemas import Analysis, Branch, DesignOption

# Màu từ design/tokens.json (bảng sáng) — test đối chiếu để không lệch token.
COLORS = {"cut": "#B23A2B", "keep": "#5E8C4F", "new-branch": "#B08D57", "canopy": "#1F2421", "apex": "#1F2421"}
HALO = "#FBF8F2"
LAYERS = ("canopy", "keep", "cut", "new-branch", "apex")

_DIR = {
    "left": (-1.0, -0.3),
    "right": (1.0, -0.3),
    "up": (0.0, -1.0),
    "back": (0.55, -0.55),
    "front": (-0.55, -0.55),
}
_LEN = {"thick": 0.2, "medium": 0.15, "thin": 0.1}  # theo chiều cao thân


@dataclass
class Line:
    layer: str
    points: list[tuple[float, float]]
    dashed: bool = False
    width: float = 1.0  # bội số của nét chuẩn
    arrow: bool = False
    closed: bool = False


@dataclass
class Cross:
    layer: str
    center: tuple[float, float]


@dataclass
class Dot:
    layer: str
    center: tuple[float, float]
    label: str | None = None


@dataclass
class Scene:
    width: int
    height: int
    items: list = field(default_factory=list)
    counts: dict = field(default_factory=dict)

    @property
    def stroke(self) -> float:
        return max(2.0, round(min(self.width, self.height) / 180, 1))


def _unit(dx: float, dy: float) -> tuple[float, float]:
    n = math.hypot(dx, dy) or 1.0
    return dx / n, dy / n


def branch_end(b: Branch, trunk_height: float) -> tuple[float, float]:
    if b.end_px is not None:
        return float(b.end_px[0]), float(b.end_px[1])
    ux, uy = _unit(*_DIR[b.direction])
    length = trunk_height * _LEN[b.thickness]
    return b.start_px[0] + ux * length, b.start_px[1] + uy * length


def build_scene(analysis: Analysis, option: DesignOption, image_size: tuple[int, int]) -> Scene:
    if analysis.trunk is None:
        raise ValueError("analysis has no trunk")
    w, h = image_size
    scene = Scene(w, h)
    trunk_h = float(analysis.trunk.height_px)
    branches = {b.id: b for b in analysis.branches}

    # Khung tán: tam giác không cân, cạnh dài hơn về phía cành thứ nhất.
    ax, ay = option.apex.point_px
    sw, sh = option.silhouette.width_px, option.silhouette.height_px
    first_side = "left"
    for k in option.keep_branches:
        if k.role == "first_branch" and k.id in branches and branches[k.id].direction in ("left", "right"):
            first_side = branches[k.id].direction
    long_, short = 0.6 * sw, 0.4 * sw
    base_y = min(ay + sh, float(h))
    lift = sh * 0.12  # góc phía cạnh ngắn cao hơn một chút
    if first_side == "left":
        tri = [(ax - long_, base_y), (ax, ay), (ax + short, base_y - lift)]
    else:
        tri = [(ax - short, base_y - lift), (ax, ay), (ax + long_, base_y)]
    scene.items.append(Line("canopy", tri, dashed=True, width=0.6, closed=True))

    for k in option.keep_branches:
        b = branches.get(k.id)
        if b:
            scene.items.append(Line("keep", [tuple(b.start_px), branch_end(b, trunk_h)], width=1.4))
    for r in option.remove_branches:
        b = branches.get(r.id)
        if b:
            end = branch_end(b, trunk_h)
            scene.items.append(Line("cut", [tuple(b.start_px), end], dashed=True, width=1.4))
            mid = ((b.start_px[0] + end[0]) / 2, (b.start_px[1] + end[1]) / 2)
            scene.items.append(Cross("cut", mid))
    for nb in option.new_branches_needed:
        ux, uy = _unit(*_DIR[nb.direction])
        length = trunk_h * 0.12
        start = (float(nb.at_px[0]), float(nb.at_px[1]))
        scene.items.append(Line("new-branch", [start, (start[0] + ux * length, start[1] + uy * length)], width=1.4, arrow=True))

    # Hạ ngọn: ngọn mới thấp hơn ngọn hiện tại rõ rệt → đoạn thân phía trên bị cắt.
    old_ax, old_ay = analysis.trunk.apex_point_px
    chop = ay - old_ay > trunk_h * 0.03
    if chop:
        scene.items.append(Line("cut", [(float(ax), float(ay)), (float(old_ax), float(old_ay))], dashed=True, width=1.4))
        scene.items.append(Cross("cut", ((ax + old_ax) / 2, (ay + old_ay) / 2)))

    scene.items.append(Dot("apex", (float(ax), float(ay)), label="Ngọn mới"))
    scene.counts = {
        "chop_apex": chop,
        "cut": len([r for r in option.remove_branches if r.id in branches]),
        "keep": len([k for k in option.keep_branches if k.id in branches]),
        "new": len(option.new_branches_needed),
    }
    return scene


# ---------- SVG ----------


def _fmt(v: float) -> str:
    return f"{v:.1f}".rstrip("0").rstrip(".")


def _pts(points) -> str:
    return " ".join(f"{_fmt(x)},{_fmt(y)}" for x, y in points)


def to_svg(scene: Scene, *, title: str = "Bản vẽ thiết kế") -> str:
    s = scene.stroke
    by_layer: dict[str, list[str]] = {layer: [] for layer in LAYERS}
    for it in scene.items:
        color = COLORS[it.layer]
        if isinstance(it, Line):
            dash = f' stroke-dasharray="{_fmt(s * 3)} {_fmt(s * 2)}"' if it.dashed else ""
            marker = ' marker-end="url(#arrow)"' if it.arrow else ""
            tag = "polygon" if it.closed else "polyline"
            by_layer[it.layer].append(
                f'<{tag} points="{_pts(it.points)}" fill="none" stroke="{color}" stroke-width="{_fmt(s * it.width)}"'
                f' stroke-linecap="round" stroke-linejoin="round"{dash}{marker}/>'
            )
        elif isinstance(it, Cross):
            r = s * 3
            x, y = it.center
            by_layer[it.layer].append(
                f'<path d="M{_fmt(x - r)} {_fmt(y - r)}L{_fmt(x + r)} {_fmt(y + r)}M{_fmt(x + r)} {_fmt(y - r)}'
                f'L{_fmt(x - r)} {_fmt(y + r)}" stroke="{HALO}" stroke-width="{_fmt(s * 2.4)}" stroke-linecap="round"/>'
                f'<path d="M{_fmt(x - r)} {_fmt(y - r)}L{_fmt(x + r)} {_fmt(y + r)}M{_fmt(x + r)} {_fmt(y - r)}'
                f'L{_fmt(x - r)} {_fmt(y + r)}" stroke="{color}" stroke-width="{_fmt(s * 1.2)}" stroke-linecap="round"/>'
            )
        elif isinstance(it, Dot):
            x, y = it.center
            parts = [f'<circle cx="{_fmt(x)}" cy="{_fmt(y)}" r="{_fmt(s * 2.5)}" fill="{color}" stroke="{HALO}" stroke-width="{_fmt(s)}"/>']
            if it.label:
                fs = s * 7
                parts.append(
                    f'<text x="{_fmt(x + s * 5)}" y="{_fmt(y - s * 3)}" font-family="Be Vietnam Pro, system-ui, sans-serif"'
                    f' font-size="{_fmt(fs)}" font-weight="600" fill="{color}" stroke="{HALO}" stroke-width="{_fmt(s * 1.5)}"'
                    f' paint-order="stroke">{escape(it.label)}</text>'
                )
            by_layer[it.layer].extend(parts)
    groups = "".join(f'<g data-layer="{layer}">{"".join(body)}</g>' for layer, body in by_layer.items() if body)
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {scene.width} {scene.height}" '
        f'width="{scene.width}" height="{scene.height}" role="img">'
        f"<title>{escape(title)}</title>"
        f'<defs><marker id="arrow" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">'
        f'<path d="M0 0L10 5L0 10z" fill="{COLORS["new-branch"]}"/></marker></defs>'
        f"{groups}</svg>"
    )


# ---------- PNG cho P3 ----------


def _dashed(draw: ImageDraw.ImageDraw, a, b, color, width, dash, gap):
    (x1, y1), (x2, y2) = a, b
    total = math.hypot(x2 - x1, y2 - y1)
    if total == 0:
        return
    ux, uy = (x2 - x1) / total, (y2 - y1) / total
    pos = 0.0
    while pos < total:
        end = min(pos + dash, total)
        draw.line([(x1 + ux * pos, y1 + uy * pos), (x1 + ux * end, y1 + uy * end)], fill=color, width=width)
        pos = end + gap


def to_png(scene: Scene, photo: bytes) -> bytes:
    base = Image.open(io.BytesIO(photo)).convert("RGB")
    if base.size != (scene.width, scene.height):
        base = base.resize((scene.width, scene.height), Image.Resampling.LANCZOS)
    img = ImageEnhance.Brightness(base).enhance(0.7)
    draw = ImageDraw.Draw(img)
    s = scene.stroke
    for it in scene.items:
        color = COLORS[it.layer]
        if isinstance(it, Line):
            width = max(1, round(s * it.width))
            pts = list(it.points) + ([it.points[0]] if it.closed else [])
            for a, b in zip(pts, pts[1:]):
                if it.dashed:
                    _dashed(draw, a, b, color, width, s * 3, s * 2)
                else:
                    draw.line([a, b], fill=color, width=width)
            if it.arrow:
                (x1, y1), (x2, y2) = it.points[-2], it.points[-1]
                ux, uy = _unit(x2 - x1, y2 - y1)
                size = s * 4
                draw.polygon(
                    [(x2 + ux * size * 0.4, y2 + uy * size * 0.4),
                     (x2 - ux * size - uy * size * 0.6, y2 - uy * size + ux * size * 0.6),
                     (x2 - ux * size + uy * size * 0.6, y2 - uy * size - ux * size * 0.6)],
                    fill=color,
                )
        elif isinstance(it, Cross):
            r, (x, y) = s * 3, it.center
            for d in (((x - r, y - r), (x + r, y + r)), ((x + r, y - r), (x - r, y + r))):
                draw.line(d, fill=color, width=max(1, round(s * 1.2)))
        elif isinstance(it, Dot):
            r, (x, y) = s * 2.5, it.center
            draw.ellipse([x - r, y - r, x + r, y + r], fill=color, outline=HALO, width=max(1, round(s)))
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()
