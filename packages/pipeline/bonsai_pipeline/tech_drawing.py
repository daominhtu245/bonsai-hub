"""Bản vẽ kỹ thuật in đem ra vườn (docs/ideas.md A4): đánh số cành, vị trí quấn dây, mũi tên hướng uốn + bảng việc.

Dựa trên cảnh của bản vẽ thiết kế (sketch.build_scene), thêm lớp "tech"; SVG trong suốt đè lên ảnh phôi. Không dùng AI.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from .care_tools import wire_plan
from .schemas import Analysis, DesignOption
from .sketch import _DIR as sketch_dirs, COLORS, HALO, _fmt, branch_end, build_scene, to_svg

ROLE_VI = {"first_branch": "cành thứ nhất", "second_branch": "cành thứ hai", "third_branch": "cành thứ ba",
           "back_branch": "cành hậu", "apex": "ngọn", "other": "cành giữ"}
BEND_DEG = 20  # uốn hạ cành ~20° (cành ngang hơi rủ — dáng cây già)


def sketch_dir(direction: str) -> tuple[float, float]:
    return sketch_dirs[direction]


@dataclass
class Row:
    no: int
    action: str  # cut | wire | grow
    title_vi: str
    detail_vi: str
    gauge_mm: float | None = None
    length_cm: float | None = None


def _num(x: float, y: float, n: int, color: str, s: float) -> str:
    r = s * 5
    return (f'<circle cx="{_fmt(x)}" cy="{_fmt(y)}" r="{_fmt(r)}" fill="{HALO}" stroke="{color}" stroke-width="{_fmt(s)}"/>'
            f'<text x="{_fmt(x)}" y="{_fmt(y + r * 0.38)}" text-anchor="middle" font-family="Be Vietnam Pro, system-ui, sans-serif"'
            f' font-size="{_fmt(r * 1.15)}" font-weight="700" fill="{color}">{n}</text>')


def _beyond(start: tuple[float, float], end: tuple[float, float], s: float) -> tuple[float, float]:
    """Chỗ đặt số: ngoài đầu cành một khoảng, để không đè nét vẽ."""
    dx, dy = end[0] - start[0], end[1] - start[1]
    n = math.hypot(dx, dy) or 1
    return end[0] + dx / n * s * 8, end[1] + dy / n * s * 8


def _wire_marks(a: tuple[float, float], b: tuple[float, float], s: float) -> str:
    """Vạch chéo dọc cành = chỗ quấn dây (góc 45° như dây quấn thật)."""
    dx, dy = b[0] - a[0], b[1] - a[1]
    length = math.hypot(dx, dy) or 1
    ux, uy = dx / length, dy / length
    nx, ny = -uy, ux
    out = []
    steps = max(3, int(length / (s * 6)))
    for i in range(1, steps):
        t = i / steps
        cx, cy = a[0] + dx * t, a[1] + dy * t
        h = s * 2.6
        p1 = (cx - nx * h - ux * h * 0.6, cy - ny * h - uy * h * 0.6)
        p2 = (cx + nx * h + ux * h * 0.6, cy + ny * h + uy * h * 0.6)
        out.append(f'M{_fmt(p1[0])} {_fmt(p1[1])}L{_fmt(p2[0])} {_fmt(p2[1])}')
    return f'<path d="{"".join(out)}" stroke="{COLORS["new-branch"]}" stroke-width="{_fmt(s * 0.8)}" stroke-linecap="round"/>'


def _bend_arrow(start: tuple[float, float], end: tuple[float, float], s: float) -> str:
    """Cung mũi tên quanh gốc cành, từ đầu cành hiện tại hạ xuống BEND_DEG."""
    dx, dy = end[0] - start[0], end[1] - start[1]
    r = math.hypot(dx, dy)
    if r < s * 4:
        return ""
    a0 = math.atan2(dy, dx)
    down = 1 if dx >= 0 else -1  # cành bên phải hạ = quay thuận chiều kim đồng hồ (y hướng xuống)
    a1 = a0 + down * math.radians(BEND_DEG)
    rr = r * 0.7
    p0 = (start[0] + rr * math.cos(a0), start[1] + rr * math.sin(a0))
    p1 = (start[0] + rr * math.cos(a1), start[1] + rr * math.sin(a1))
    sweep = 1 if down > 0 else 0
    return (f'<path d="M{_fmt(p0[0])} {_fmt(p0[1])}A{_fmt(rr)} {_fmt(rr)} 0 0 {sweep} {_fmt(p1[0])} {_fmt(p1[1])}" fill="none"'
            f' stroke="{COLORS["canopy"]}" stroke-width="{_fmt(s * 0.9)}" marker-end="url(#bend)"/>')


def technical_sheet(analysis: Analysis, option: DesignOption, image_size: tuple[int, int],
                    real_height_cm: float | None = None) -> tuple[str, list[Row]]:
    """Trả (SVG, bảng việc). Số trên bản vẽ = số dòng trong bảng: cắt trước, rồi quấn dây, rồi nuôi cành mới."""
    scene = build_scene(analysis, option, image_size)
    s = scene.stroke
    trunk_h = float(analysis.trunk.height_px)  # build_scene đã kiểm tra có thân
    branches = {b.id: b for b in analysis.branches}
    wires = {ln.branch: ln for ln in wire_plan(analysis, option, real_height_cm).lines}
    rows: list[Row] = []
    marks: list[str] = []

    if scene.counts.get("chop_apex"):
        rows.append(Row(len(rows) + 1, "cut", "Hạ ngọn", "Cắt đoạn thân phía trên điểm ngọn mới, chừa 1–2 cm để khô rồi tỉa sát."))
        ax, ay = option.apex.point_px
        ox, oy = analysis.trunk.apex_point_px
        marks.append(_num((ax + ox) / 2 + s * 9, (ay + oy) / 2, rows[-1].no, COLORS["cut"], s))
    for r in option.remove_branches:
        b = branches.get(r.id)
        if b is None:
            continue
        end = branch_end(b, trunk_h)
        rows.append(Row(len(rows) + 1, "cut", "Cắt bỏ", r.reason_vi))
        marks.append(_num(*_beyond(tuple(b.start_px), end, s), rows[-1].no, COLORS["cut"], s))
    for k in option.keep_branches:
        b = branches.get(k.id)
        if b is None:
            continue
        start, end = (float(b.start_px[0]), float(b.start_px[1])), branch_end(b, trunk_h)
        ln = wires.get(k.id)
        bend = k.role not in ("apex", "back_branch") and b.direction in ("left", "right")
        detail = f"Giữ làm {ROLE_VI[k.role]}." + (f" Quấn dây rồi uốn hạ ~{BEND_DEG}°." if bend else " Quấn dây chỉnh hướng nhẹ.")
        rows.append(Row(len(rows) + 1, "wire", "Quấn dây", detail, ln.gauge_mm if ln else None, ln.length_cm if ln else None))
        marks.append(_wire_marks(start, end, s))
        if bend:
            marks.append(_bend_arrow(start, end, s))
        marks.append(_num(*_beyond(start, end, s), rows[-1].no, COLORS["keep"], s))
    for i, nb in enumerate(option.new_branches_needed, start=1):
        ln = wires.get(f"new{i}")
        rows.append(Row(len(rows) + 1, "grow", "Nuôi cành mới", nb.note_vi, ln.gauge_mm if ln else None, ln.length_cm if ln else None))
        tip = sketch_dir(nb.direction)
        at = (float(nb.at_px[0]), float(nb.at_px[1]))
        marks.append(_num(*_beyond((at[0] + tip[0], at[1] + tip[1]), at, s), rows[-1].no, COLORS["new-branch"], s))  # phía sau gốc mũi tên

    base = to_svg(scene, title="Bản vẽ kỹ thuật")
    defs = (f'<marker id="bend" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">'
            f'<path d="M0 0L10 5L0 10z" fill="{COLORS["canopy"]}"/></marker>')
    svg = base.replace("</defs>", defs + "</defs>", 1).replace("</svg>", f'<g data-layer="tech">{"".join(marks)}</g></svg>')
    return svg, rows

