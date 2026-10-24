"""A4 không dùng API: thiết kế 2–3 phương án bằng luật bonsai cổ điển (thay P2).

Đầu vào: Analysis (P1 hoặc model riêng) + Targets (rule engine). Đầu ra: DesignResult cùng schema P2, qua được
`validate_design`. Luật (chấm điểm thế, chọn cành) là bản nháp — nghệ nhân duyệt và chỉnh hệ số; so sánh với P2
trên ảnh phôi thật trước khi dùng cho người dùng (Cổng 1).
"""

from __future__ import annotations

from .dictionaries import STYLES
from .rule_engine import FIRST_BRANCH_TOLERANCE, BAR_BRANCH_RATIO_GAP, Targets, validate_design
from .schemas import (
    Analysis, Apex, Branch, DesignOption, DesignResult, KeepBranch, NewBranch, Pot, RemoveBranch, Silhouette,
)

MAX_OPTIONS = 3
_THICK = {"thin": 1, "medium": 2, "thick": 3}
STYLE_NAME_VI = {s["key"]: s["name_vi"] for s in STYLES}
_SIDE_VI = {"left": "trái", "right": "phải"}
_OPPOSITE = {"left": "right", "right": "left"}

# Tỉ lệ khung tán so với chiều cao mục tiêu (rộng, cao), số tầng tán, dáng chậu.
_SHAPE = {
    "chokkan": (0.8, 0.85, 5, "rectangle"), "vn_truc_quan_tu": (0.85, 0.85, 5, "rectangle"),
    "moyogi": (1.0, 0.8, 5, "oval"), "vn_long": (1.0, 0.8, 5, "rectangle"),
    "shakan": (1.1, 0.75, 4, "rectangle"), "kengai": (0.9, 1.0, 4, "cascade_deep"),
    "han_kengai": (1.0, 0.8, 4, "round"), "bunjingi": (0.5, 0.4, 2, "round"),
    "fukinagashi": (1.3, 0.7, 4, "oval"), "sokan": (1.0, 0.8, 5, "oval"), "sekijoju": (0.9, 0.8, 4, "oval"),
}
_WHY = {
    "chokkan": "Thân {mv}, gần như thẳng đứng — hợp dáng trực, nhấn vào độ thuôn và các tầng cành cân đối.",
    "vn_truc_quan_tu": "Thân {mv}, đứng thẳng — hợp dáng trực quân tử: tầng tán rõ lớp, dáng cây đường hoàng.",
    "moyogi": "Thân {mv} — giữ đường uốn tự nhiên, đặt cành ở mặt ngoài các khúc cong.",
    "vn_long": "Thân {mv} — tận dụng các khúc uốn sẵn có để làm dáng long uốn lượn.",
    "shakan": "Thân {mv}, nghiêng {lean:.0f}° — hợp dáng xiêu, cành phía đối diện để cân dáng.",
    "kengai": "Thân {mv} — có thể đổ thân xuống thấp hơn miệng chậu, cần chậu sâu.",
    "han_kengai": "Thân {mv} — đổ ngang khoảng miệng chậu, dáng bán huyền.",
    "bunjingi": "Thân cao, thanh so với gốc — hợp dáng văn nhân: ít cành, tán nhỏ ở phần trên.",
    "fukinagashi": "Thân {mv} — dồn cành về một phía như bị gió thổi, tạo dáng phong xuy.",
    "sokan": "Phôi có thân phụ từ cùng gốc — hợp dáng song thụ.",
    "sekijoju": "Phôi có đá ở gốc — hợp dáng bám đá.",
}
_MOVEMENT_VI = {"straight": "thẳng", "gentle_curve": "uốn nhẹ", "s_curve": "uốn chữ S", "strong_twist": "xoắn mạnh",
                "leaning": "nghiêng", "uncertain": "chưa rõ dáng"}


def style_scores(analysis: Analysis, targets: Targets) -> dict[str, float]:
    t = analysis.trunk
    assert t is not None
    mv, lean = t.movement, abs(t.lean_angle_deg)
    sides = [b.direction for b in analysis.branches if b.direction in ("left", "right")]
    one_sided = bool(sides) and max(sides.count("left"), sides.count("right")) >= 0.8 * len(sides) and len(sides) >= 2
    tall = targets.height_to_base_ratio > 9
    base = {
        "chokkan": 0.85 if mv == "straight" and lean < 5 else 0.6,
        "vn_truc_quan_tu": 0.8 if mv == "straight" else 0.55,
        "moyogi": {"gentle_curve": 0.88, "s_curve": 0.85, "leaning": 0.7}.get(mv, 0.65),
        "vn_long": 0.9 if mv in ("s_curve", "strong_twist") else 0.5,
        "shakan": 0.85 if mv == "leaning" or lean > 15 else 0.55,
        "kengai": 0.75 if lean > 35 else 0.45,
        "han_kengai": 0.7 if lean > 25 else 0.45,
        "bunjingi": 0.8 if tall else 0.4,
        "fukinagashi": 0.75 if one_sided and lean > 10 else 0.5,
        "sokan": 0.8,
        "sekijoju": 0.8,
    }
    return {k: base.get(k, 0.5) for k in targets.allowed_styles}


def _first_branch_window(analysis: Analysis, targets: Targets) -> tuple[float, float]:
    lo, hi = targets.first_branch_height_ratio
    return lo - FIRST_BRANCH_TOLERANCE / 2, hi + FIRST_BRANCH_TOLERANCE / 2


def _ratio(analysis: Analysis, targets: Targets, b: Branch) -> float:
    return (analysis.trunk.base_point_px[1] - b.start_px[1]) / targets.target_height_px


def _point(targets: Targets, x: float, y: float) -> list[float]:
    return [round(min(max(x, 0), targets.image_width), 1), round(min(max(y, 0), targets.image_height), 1)]


def _edge_point(analysis: Analysis, targets: Targets, y: float, side: str) -> list[float]:
    """Điểm trên mép thân (phía `side`) ở độ cao y — nơi cành mới mọc ra; thân thuôn dần lên ngọn."""
    t = analysis.trunk
    frac = (t.base_point_px[1] - y) / max(1.0, t.base_point_px[1] - t.apex_point_px[1])
    half = t.base_diameter_px / 2 * (1 - 0.5 * min(max(frac, 0.0), 1.0))
    return _point(targets, _trunk_x(analysis, y) + (half if side == "right" else -half), y)


def _trunk_x(analysis: Analysis, y: float) -> float:
    (bx, by), (ax, ay) = analysis.trunk.base_point_px, analysis.trunk.apex_point_px
    t = 0.0 if by == ay else (by - y) / (by - ay)
    return bx + (ax - bx) * t


def design_option(analysis: Analysis, targets: Targets, style: str, suitability: float) -> DesignOption:
    t = analysis.trunk
    assert t is not None
    apex_y = targets.candidate_apex_px[1]
    lean_side = "right" if t.lean_angle_deg > 0 else "left"
    wind_side = lean_side if abs(t.lean_angle_deg) > 3 else (
        "left" if sum(b.direction == "left" for b in analysis.branches) >= sum(b.direction == "right" for b in analysis.branches) else "right")
    fb_lo, fb_hi = _first_branch_window(analysis, targets)

    # Cặp cành chống (trái–phải cùng độ cao): giữ cành to hơn; bằng nhau thì giữ cành phía thân nghiêng.
    bar_losers: set[str] = set()
    lr = [b for b in analysis.branches if b.direction in ("left", "right")]
    for i, a in enumerate(lr):
        for b in lr[i + 1:]:
            if a.direction != b.direction and abs(a.height_ratio - b.height_ratio) < BAR_BRANCH_RATIO_GAP:
                ka = (_THICK[a.thickness], a.direction == lean_side)
                kb = (_THICK[b.thickness], b.direction == lean_side)
                bar_losers.add(b.id if ka >= kb else a.id)
    # Chỉ một ngọn: giữ cành mọc thẳng lên cao nhất, bỏ các cành cạnh tranh ngọn.
    ups = [b for b in analysis.branches if b.direction == "up"]
    leader = max(ups, key=lambda b: (b.height_ratio, _THICK[b.thickness])).id if ups else None

    keep: list[KeepBranch] = []
    remove: list[RemoveBranch] = []
    kept: list[Branch] = []
    first: Branch | None = None
    last_side: str | None = None
    for b in sorted(analysis.branches, key=lambda b: b.height_ratio):
        r = _ratio(analysis, targets, b)
        reason = None
        if targets.lower_apex_by_px > 0 and b.start_px[1] < apex_y - 1:
            reason = "Nằm trên ngọn mới — bỏ khi hạ ngọn"
        elif b.direction == "up" and b.id != leader:
            reason = "Cạnh tranh ngọn — chỉ giữ một ngọn"
        elif {"crossing", "eye_poke", "inside_curve"} & set(b.issues):
            reason = "Cành bắt chéo / đâm thẳng ra trước / nằm trong khúc cong"
        elif style == "bunjingi" and b.height_ratio < 0.6:
            reason = "Dáng văn nhân chỉ giữ cành ở phần trên thân"
        elif style == "fukinagashi" and b.direction == _OPPOSITE[wind_side]:
            reason = f"Ngược hướng gió (dáng phong xuy dồn cành về bên {_SIDE_VI[wind_side]})"
        elif first is None and r < fb_lo and b.direction != "up":
            reason = "Thấp hơn vị trí cành thứ nhất (khoảng 1/3 chiều cao)"
        elif b.id in bar_losers or any(
                {k.direction, b.direction} == {"left", "right"} and abs(k.height_ratio - b.height_ratio) < BAR_BRANCH_RATIO_GAP
                for k in kept):
            reason = "Tạo cặp cành ngang đối xứng (cành chống) với cành khác"
        elif b.direction != "up" and b.height_ratio > 0.45 and any(_THICK[k.thickness] < _THICK[b.thickness] for k in kept):
            reason = "To hơn cành bên dưới — cành phải nhỏ dần lên ngọn"
        elif b.direction in ("left", "right") and b.direction == last_side and style not in ("fukinagashi",) and len(kept) >= 1 \
                and abs(kept[-1].height_ratio - b.height_ratio) < 0.12:
            reason = "Cùng phía và quá gần cành bên dưới — cành nên so le trái phải"
        if reason:
            remove.append(RemoveBranch(id=b.id, reason_vi=reason))
            continue
        if first is None and b.direction in ("left", "right") and fb_lo <= r <= fb_hi:
            role = "first_branch"
            first = b
        elif b.direction == "back":
            role = "back_branch"
        elif b.direction == "up" and b.height_ratio > 0.75:
            role = "apex"
        elif first is not None and not any(k.role == "second_branch" for k in keep):
            role = "second_branch"
        elif first is not None and not any(k.role == "third_branch" for k in keep):
            role = "third_branch"
        else:
            role = "other"
        keep.append(KeepBranch(id=b.id, role=role))
        kept.append(b)
        if b.direction in ("left", "right"):
            last_side = b.direction

    new: list[NewBranch] = []
    base_y = t.base_point_px[1]
    lo, hi = targets.first_branch_height_ratio
    if first is None and style != "bunjingi":
        side = wind_side if style == "fukinagashi" else ("left" if lean_side == "right" else "right")
        y = base_y - targets.target_height_px * (lo + hi) / 2
        new.append(NewBranch(at_px=_edge_point(analysis, targets, y, side), direction=side,
                             note_vi=f"Nuôi cành thứ nhất bên {_SIDE_VI[side]}, khoảng 1/3 chiều cao"))
    sides_kept = {b.direction for b in kept}
    if style not in ("fukinagashi", "bunjingi") and first is not None:
        missing = _OPPOSITE[first.direction]
        if missing not in sides_kept:
            y = base_y - targets.target_height_px * min(0.6, hi + 0.15)
            new.append(NewBranch(at_px=_edge_point(analysis, targets, y, missing), direction=missing,
                                 note_vi=f"Nuôi cành thứ hai bên {_SIDE_VI[missing]}, cao hơn cành thứ nhất"))

    wr, hr, pads, pot_shape = _SHAPE.get(style, (1.0, 0.8, 4, "oval"))
    pads = max(1, min(12, pads if style == "bunjingi" else max(3, min(7, len(kept) + len(new) + 1))))
    if style in ("shakan", "fukinagashi"):
        apex_lean = "slightly_left" if (wind_side if style == "fukinagashi" else lean_side) == "left" else "slightly_right"
        pot_pos = "off_center_right" if lean_side == "left" else "off_center_left"
    else:
        apex_lean = "forward"
        pot_pos = "center" if style in ("chokkan", "vn_truc_quan_tu", "kengai", "han_kengai", "bunjingi") else (
            "off_center_left" if first is not None and first.direction == "right" else "off_center_right")
    lower = targets.lower_apex_by_px
    care = []
    if remove:
        care.append(f"Bước 1: Cắt bỏ {len(remove)} cành không hợp thế (đánh dấu đỏ)")
    if lower:
        care.append("Bước 2: Hạ ngọn về điểm ngọn mới, chọn một cành gần đó làm ngọn")
    care.append("Uốn dây các cành giữ lại theo khung tán trên bản vẽ")
    if new:
        care.append(f"Nuôi {len(new)} cành mới ở vị trí đánh dấu vàng")
    why = _WHY.get(style, "Thế phù hợp với dáng thân hiện có.").format(mv=_MOVEMENT_VI.get(t.movement, ""), lean=abs(t.lean_angle_deg))
    return DesignOption(
        style_key=style,
        suitability=round(suitability, 2),
        why_vi=why,
        front="Mặt tiền hiện tại",
        apex=Apex(point_px=list(targets.candidate_apex_px), lean=apex_lean),
        keep_branches=keep,
        remove_branches=remove,
        new_branches_needed=new,
        # Thân lùn, to (tỉ lệ cao/gốc thấp): tán phải rộng hơn gốc nhiều lần, không chỉ theo chiều cao.
        silhouette=Silhouette(width_px=max(1, round(targets.target_height_px * wr), round(targets.base_diameter_px * 2.2 * wr)),
                              height_px=max(1, round(targets.target_height_px * hr)), pads=pads),
        pot=Pot(shape=pot_shape, color="unglazed_brown", position=pot_pos),
        care_steps_vi=care,
    )


def design_by_rules(analysis: Analysis, targets: Targets, *, user_style: str | None = None) -> DesignResult:
    scores = style_scores(analysis, targets)
    if user_style in scores:
        scores[user_style] = min(0.95, scores[user_style] + 0.1)
    ranked = sorted(scores.items(), key=lambda kv: -kv[1])[:MAX_OPTIONS]
    design = DesignResult(options=[design_option(analysis, targets, k, s) for k, s in ranked])
    errors = validate_design(design, analysis, targets)
    if errors:  # luật thiết kế phải luôn qua luật cứng; lỗi ở đây là bug cần sửa
        raise ValueError("rule designer produced an invalid design: " + "; ".join(errors))
    return design
