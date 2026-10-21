"""A3 — Rule engine: tính trước các con số mục tiêu từ số đo phôi + bộ luật YAML, và kiểm luật cứng cho P2.

LLM ở P2 chỉ chọn và giải thích trong khuôn khổ các con số này; code kiểm lại đầu ra.
"""

from __future__ import annotations

import math
from dataclasses import asdict, dataclass, field

from .dictionaries import MAX_THICKEN_PCT_PER_YEAR, STYLES, rule_set
from .schemas import Analysis, DesignResult

STYLE_KEYS = [s["key"] for s in STYLES]

# Thế nào khả thi với dáng thân nào (thân thẳng không thể thành thế long mà không uốn nặng nhiều năm).
_CURVED = {"gentle_curve", "s_curve", "strong_twist"}
STYLE_REQUIREMENTS: dict[str, dict] = {
    "chokkan": {"movement": {"straight", "gentle_curve", "uncertain"}, "max_lean": 10},
    "vn_truc_quan_tu": {"movement": {"straight", "gentle_curve", "uncertain"}, "max_lean": 10},
    "moyogi": {"movement": _CURVED | {"leaning", "uncertain"}},
    "vn_long": {"movement": {"s_curve", "strong_twist"}},
    "shakan": {},  # thân thẳng vẫn làm được bằng cách nghiêng chậu
    "kengai": {"movement": _CURVED | {"leaning"}},
    "han_kengai": {"movement": _CURVED | {"leaning"}},
    "bunjingi": {},
    "fukinagashi": {},
    "sokan": {"notable_any": {"twin_trunk", "multiple_trunks", "second_trunk"}},
    "sekijoju": {"notable_any": {"rock", "root_over_rock"}},
}

# Cho phép lệch quanh khoảng lý tưởng trước khi coi là vi phạm cứng (khoảng lý tưởng vẫn được đưa vào prompt).
FIRST_BRANCH_TOLERANCE = 0.12
BAR_BRANCH_RATIO_GAP = 0.04


@dataclass
class Targets:
    image_width: int
    image_height: int
    current_height_px: int
    base_diameter_px: int
    height_to_base_ratio: float
    target_height_px: int
    lower_apex_by_px: int
    candidate_apex_px: list[float]
    first_branch_y_range_px: list[int]
    first_branch_height_ratio: list[float]
    pot_length_px: list[int]
    pot_depth_px: list[int]
    cm_per_px: float | None
    real_height_cm: float | None
    base_diameter_cm: float | None
    growth_speed: str
    max_thicken_pct_per_year: int
    allowed_styles: list[str]
    notes_en: list[str] = field(default_factory=list)

    def as_dict(self) -> dict:
        return asdict(self)


def allowed_styles(analysis: Analysis) -> list[str]:
    trunk = analysis.trunk
    if trunk is None:
        return []
    notable = {n.lower() for n in trunk.notable}
    out = []
    for key in STYLE_KEYS:
        req = STYLE_REQUIREMENTS.get(key, {})
        if "movement" in req and trunk.movement not in req["movement"]:
            continue
        if "max_lean" in req and abs(trunk.lean_angle_deg) > req["max_lean"]:
            continue
        if "notable_any" in req and not (notable & req["notable_any"]):
            continue
        out.append(key)
    return out


def compute_targets(
    analysis: Analysis,
    *,
    image_size: tuple[int, int],
    growth_speed: str = "medium",
    real_height_cm: float | None = None,
    measured_height_px: int | None = None,
    measured_base_diameter_px: int | None = None,
) -> Targets:
    """`measured_*` (từ mask YOLO-seg) được ưu tiên hơn số P1 ước lượng."""
    if analysis.trunk is None:
        raise ValueError("analysis has no trunk")
    rs = rule_set()
    w, h = image_size
    trunk = analysis.trunk
    height = measured_height_px or trunk.height_px
    base_d = max(1, measured_base_diameter_px or trunk.base_diameter_px)
    lo, hi = rs["proportions"]["height_to_base_diameter"]
    ideal = (lo + hi) / 2
    ratio = height / base_d
    notes: list[str] = []

    if ratio > hi:
        target = round(base_d * ideal)
        notes.append(
            f"trunk is too tall for its base (ratio {ratio:.1f} > {hi}); lower the apex by about {height - target}px"
        )
    elif ratio < lo:
        target = height
        notes.append(f"trunk is stout (ratio {ratio:.1f} < {lo}); keep height, a new leader can grow taller later")
    else:
        target = height
    lower_by = max(0, height - target)

    bx, by = trunk.base_point_px
    ax, ay = trunk.apex_point_px
    frac = target / height if height else 1.0
    candidate_apex = [round(bx + (ax - bx) * frac, 1), round(by + (ay - by) * frac, 1)]

    fb_lo, fb_hi = rs["proportions"]["first_branch_height_ratio"]
    first_branch_y = [round(by - target * fb_hi), round(by - target * fb_lo)]

    pl_lo, pl_hi = rs["proportions"]["pot_length_to_tree_height"]
    pd_lo, pd_hi = rs["proportions"]["pot_depth_to_base_diameter"]

    cm_per_px = (real_height_cm / height) if real_height_cm and height else None
    base_cm = round(base_d * cm_per_px, 1) if cm_per_px else None

    if analysis.nebari and analysis.nebari.quality in ("poor", "hidden"):
        notes.append("nebari is weak or hidden; prefer designs and pot position that hide this side")
    if trunk.taper == "reverse":
        notes.append("trunk has reverse taper; consider chopping above the thick section")

    return Targets(
        image_width=w,
        image_height=h,
        current_height_px=height,
        base_diameter_px=base_d,
        height_to_base_ratio=round(ratio, 2),
        target_height_px=target,
        lower_apex_by_px=lower_by,
        candidate_apex_px=candidate_apex,
        first_branch_y_range_px=first_branch_y,
        first_branch_height_ratio=[fb_lo, fb_hi],
        pot_length_px=[round(target * pl_lo), round(target * pl_hi)],
        pot_depth_px=[round(base_d * pd_lo), round(base_d * pd_hi)],
        cm_per_px=round(cm_per_px, 5) if cm_per_px else None,
        real_height_cm=real_height_cm,
        base_diameter_cm=base_cm,
        growth_speed=growth_speed,
        max_thicken_pct_per_year=MAX_THICKEN_PCT_PER_YEAR.get(growth_speed, 10),
        allowed_styles=allowed_styles(analysis),
        notes_en=notes,
    )


def validate_design(design: DesignResult, analysis: Analysis, targets: Targets) -> list[str]:
    """Luật cứng do code kiểm. Trả danh sách vi phạm (tiếng Anh, gửi lại cho model khi gọi lại)."""
    errors: list[str] = []
    branches = {b.id: b for b in analysis.branches}
    styles_seen: set[str] = set()
    prev_suit = math.inf

    for i, opt in enumerate(design.options):
        p = f"options[{i}] ({opt.style_key})"
        if opt.style_key not in targets.allowed_styles:
            errors.append(f"{p}: style_key must be one of {targets.allowed_styles}")
        if opt.style_key in styles_seen:
            errors.append(f"{p}: duplicate style_key; each option must be a different style")
        styles_seen.add(opt.style_key)
        if opt.suitability > prev_suit:
            errors.append(f"{p}: options must be sorted by suitability, highest first")
        prev_suit = opt.suitability

        keep = [k.id for k in opt.keep_branches]
        remove = [r.id for r in opt.remove_branches]
        unknown = sorted(set(keep + remove) - branches.keys())
        if unknown:
            errors.append(f"{p}: unknown branch ids {unknown}; valid ids are {sorted(branches)}")
        both = sorted(set(keep) & set(remove))
        if both:
            errors.append(f"{p}: branches {both} are both kept and removed")
        missing = sorted(branches.keys() - set(keep) - set(remove))
        if missing:
            errors.append(f"{p}: every branch must be kept or removed; missing {missing}")

        firsts = [k.id for k in opt.keep_branches if k.role == "first_branch"]
        if len(firsts) > 1:
            errors.append(f"{p}: only one branch can be first_branch")
        for fid in firsts:
            b = branches.get(fid)
            if b is None:
                continue
            ratio = (targets_base_y(analysis) - b.start_px[1]) / targets.target_height_px
            lo, hi = targets.first_branch_height_ratio
            if not (lo - FIRST_BRANCH_TOLERANCE <= ratio <= hi + FIRST_BRANCH_TOLERANCE):
                errors.append(
                    f"{p}: first_branch {fid} sits at {ratio:.2f} of target height; must be about {lo}-{hi}"
                )

        kept = [branches[k] for k in keep if k in branches]
        for a_i, a in enumerate(kept):
            for b in kept[a_i + 1 :]:
                if {a.direction, b.direction} == {"left", "right"} and abs(a.height_ratio - b.height_ratio) < BAR_BRANCH_RATIO_GAP:
                    errors.append(f"{p}: kept branches {a.id} and {b.id} form a bar branch; remove one")

        x, y = opt.apex.point_px
        if not (0 <= x <= targets.image_width and 0 <= y <= targets.image_height):
            errors.append(f"{p}: apex.point_px {opt.apex.point_px} is outside the image")
        for nb in opt.new_branches_needed:
            nx, ny = nb.at_px
            if not (0 <= nx <= targets.image_width and 0 <= ny <= targets.image_height):
                errors.append(f"{p}: new branch at {nb.at_px} is outside the image")
    return errors


def targets_base_y(analysis: Analysis) -> float:
    assert analysis.trunk is not None
    return analysis.trunk.base_point_px[1]
