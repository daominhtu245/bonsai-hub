"""Công cụ chăm cây chạy trên máy, không tốn API (docs/ideas.md E1, E5–E8, F5).

Thông số lấy từ bộ luật (nghệ nhân chỉnh ở /admin/bo-luat): rule_set.wiring, species.*.price_vnd_per_trunk_cm,
species.*.graft_season. Nội dung là tham khảo — giao diện luôn ghi rõ.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import date, timedelta

from .dictionaries import rule_set, species_rules
from .schemas import Analysis, DesignOption
from .sketch import branch_end

# ---------- E6 tính dây uốn ----------


@dataclass
class WireLine:
    branch: str  # mã cành (b1…) hoặc "new1"…
    label_vi: str
    diameter_mm: float
    gauge_mm: float
    length_cm: float


@dataclass
class WirePlan:
    scale_known: bool  # có chiều cao thật → đổi px ra cm
    lines: list[WireLine]
    shopping: list[tuple[float, float]]  # (cỡ dây mm, tổng mét, làm tròn lên 0,5 m)
    copper_note: str


def _px_to_cm(analysis: Analysis, real_height_cm: float | None) -> float | None:
    t = analysis.trunk
    if not real_height_cm or t is None or t.height_px <= 0:
        return None
    return real_height_cm / t.height_px


def _nearest_gauge(mm: float, gauges: list[float]) -> float:
    return min(gauges, key=lambda g: (abs(g - mm), -g))


def wire_plan(analysis: Analysis, option: DesignOption, real_height_cm: float | None) -> WirePlan:
    """Cành giữ + cành nuôi mới → cỡ dây nhôm và số mét cần mua."""
    w = rule_set().get("wiring") or {}
    ratio, factor = float(w.get("aluminium_to_branch", 0.33)), float(w.get("length_factor", 1.5))
    gauges = [float(g) for g in w.get("gauges_mm", [1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6])]
    rel = w.get("branch_to_trunk") or {"thick": 0.33, "medium": 0.2, "thin": 0.1}
    t = analysis.trunk
    assert t is not None
    k = _px_to_cm(analysis, real_height_cm)
    # không có chiều cao thật: giả định gốc 3 cm (phôi bonsai cỡ vừa) — chỉ để ra cỡ dây hợp lý
    trunk_mm = t.base_diameter_px * k * 10 if k else 30.0
    cm_per_px = k or (3.0 / max(1, t.base_diameter_px))
    branches = {b.id: b for b in analysis.branches}
    lines: list[WireLine] = []
    for i, kb in enumerate(option.keep_branches, start=1):
        b = branches.get(kb.id)
        if b is None:
            continue
        d = trunk_mm * float(rel.get(b.thickness, 0.2))
        ex, ey = branch_end(b, t.height_px)
        length = math.hypot(ex - b.start_px[0], ey - b.start_px[1]) * cm_per_px * factor
        lines.append(WireLine(b.id, f"Cành {b.id[1:] if b.id.startswith('b') else b.id}", round(d, 1),
                              _nearest_gauge(d * ratio, gauges), round(length, 0)))
    for i, nb in enumerate(option.new_branches_needed, start=1):  # cành non: dây nhỏ nhất, dài ~ 1/5 chiều cao
        lines.append(WireLine(f"new{i}", f"Cành mới {i}", round(trunk_mm * 0.08, 1), gauges[0],
                              round(t.height_px * 0.2 * cm_per_px * factor, 0)))
    totals: dict[float, float] = {}
    for ln in lines:
        totals[ln.gauge_mm] = totals.get(ln.gauge_mm, 0.0) + ln.length_cm / 100
    shopping = sorted((g, math.ceil(m * 1.2 * 2) / 2) for g, m in totals.items())  # +20% dư, làm tròn 0,5 m
    return WirePlan(k is not None, lines, shopping,
                    "Dùng dây đồng thì chọn cỡ nhỏ hơn một bậc (đồng cứng hơn nhôm).")


# ---------- E7 gợi ý điểm ghép ----------


@dataclass
class GraftSpot:
    at_px: list[float]
    side: str  # left | right
    reason_vi: str


def graft_suggestions(analysis: Analysis, option: DesignOption, species_key: str | None) -> tuple[list[GraftSpot], str | None]:
    """Đoạn thân trống cành dài (≥ 25% chiều cao) ở một bên → gợi ý ghép cành; thêm các vị trí thiết kế cần nuôi cành mới."""
    t = analysis.trunk
    assert t is not None
    kept = {k.id for k in option.keep_branches}
    spots: list[GraftSpot] = []
    lo = 0.25  # dưới 1/4 chiều cao không cần cành
    for side in ("left", "right"):
        ratios = sorted(b.height_ratio for b in analysis.branches if b.id in kept and b.direction == side)
        marks = [lo, *[r for r in ratios if r >= lo], 0.85]
        for a, b in zip(marks, marks[1:]):
            if b - a >= 0.25:
                mid = (a + b) / 2
                y = t.base_point_px[1] - t.height_px * mid
                frac = (t.base_point_px[1] - y) / max(1, t.base_point_px[1] - t.apex_point_px[1])
                x = t.base_point_px[0] + (t.apex_point_px[0] - t.base_point_px[0]) * frac
                off = t.base_diameter_px * 0.45 * (-1 if side == "left" else 1)
                spots.append(GraftSpot([round(x + off), round(y)], side,
                                       f"Thân {'trái' if side == 'left' else 'phải'} trống cành từ {round(a * 100)}% tới {round(b * 100)}% chiều cao"))
    for nb in option.new_branches_needed:
        if nb.direction in ("left", "right"):
            spots.append(GraftSpot(list(nb.at_px), nb.direction, nb.note_vi or "Thiết kế cần cành ở đây"))
    season = (species_rules().get(species_key or "", {}) or {}).get("graft_season")
    return spots[:6], season


# ---------- E8 cấp cứu cây ----------

RESCUE_QUESTIONS: list[tuple[str, str]] = [
    ("wilting", "Lá héo rũ, mềm oặt?"),
    ("yellow_drop", "Lá vàng và rụng nhiều?"),
    ("wet_smell", "Đất ẩm ướt lâu ngày hoặc có mùi hôi?"),
    ("dry_soil", "Đất khô cứng, tưới nước chảy tuột ra ngoài?"),
    ("recent_repot", "Mới thay chậu, cắt rễ hoặc cắt cành mạnh trong 1 tháng qua?"),
    ("burnt", "Lá cháy mép, bạc màu sau những ngày nắng gắt?"),
    ("pests", "Thấy sâu, rệp, mạng nhện hoặc đốm lạ trên lá?"),
]


@dataclass
class RescuePlan:
    cause_vi: str
    now: list[str]  # việc làm trong 24 giờ
    day3: list[str]
    day7: list[str]
    see_expert: bool = False
    causes: list[str] = field(default_factory=list)


def rescue_plan(answers: dict[str, bool]) -> RescuePlan:
    a = {k: bool(answers.get(k)) for k, _ in RESCUE_QUESTIONS}
    causes: list[str] = []
    if a["wet_smell"] and (a["wilting"] or a["yellow_drop"]):
        causes.append("root_rot")
    if a["dry_soil"] and a["wilting"]:
        causes.append("thirst")
    if a["recent_repot"]:
        causes.append("shock")
    if a["burnt"]:
        causes.append("sunburn")
    if a["pests"]:
        causes.append("pests")
    if not causes and (a["wilting"] or a["yellow_drop"]):
        causes.append("unknown")
    plans = {
        "root_rot": ("Có thể úng / thối rễ", ["Ngừng tưới, đưa cây ra chỗ thoáng có nắng nhẹ", "Kiểm tra lỗ thoát nước, nghiêng chậu cho ráo",
                                              "Nhấc bầu xem rễ: rễ đen, mềm, có mùi thì cắt bỏ, rắc thuốc chống nấm"],
                     ["Chỉ tưới khi mặt đất khô 1–2 cm", "Thay giá thể thoáng (đất trộn sỏi, vỏ thông) nếu rễ hư nhiều"],
                     ["Không bón phân tới khi ra chồi mới", "Chồi non ra đều là cây đã qua"]),
        "thirst": ("Thiếu nước", ["Ngâm cả chậu vào chậu nước 20–30 phút cho đất ngấm lại", "Để chỗ râm mát hôm nay"],
                   ["Tưới đẫm mỗi sáng, kiểm tra đất buổi chiều"], ["Phủ rêu / sỏi mặt chậu cho đỡ khô nhanh"]),
        "shock": ("Sốc sau thay chậu / cắt", ["Để chỗ sáng nhưng tránh nắng trực tiếp", "Giữ ẩm vừa phải, phun sương lá buổi sáng",
                                              "Không bón phân, không cắt thêm"],
                  ["Cố định cây cho chắc, tránh lay gốc"], ["Đợi chồi mới mới cho ra nắng dần"]),
        "sunburn": ("Cháy nắng", ["Che lưới 30–50% hoặc dời chỗ có nắng sáng, tránh nắng trưa", "Tưới vào sáng sớm, không tưới lúc nắng gắt"],
                    ["Cắt lá cháy nặng cho cây đỡ mất nước"], ["Tập nắng lại dần trong 1–2 tuần"]),
        "pests": ("Sâu bệnh", ["Cách ly cây", "Rửa lá bằng vòi nước mạnh, bắt sâu bằng tay",
                               "Chụp lá ở mục \"Đoán sâu bệnh\" để biết loại và thuốc phù hợp"],
                  ["Phun lại nếu còn dấu vết"], ["Kiểm tra mặt dưới lá mỗi tuần"]),
        "unknown": ("Chưa rõ nguyên nhân", ["Để cây chỗ sáng, thoáng, tránh nắng gắt", "Kiểm tra độ ẩm đất bằng ngón tay trước khi tưới"],
                    ["Chụp ảnh so sánh với hôm nay"], ["Nếu không khá hơn, hỏi nghệ nhân kèm ảnh"]),
    }
    if not causes:
        return RescuePlan("Cây có vẻ ổn", ["Tiếp tục chăm như bình thường"], [], [], causes=[])
    now, d3, d7 = [], [], []
    for c in causes:
        _, n, x, y = plans[c]
        now += n
        d3 += x
        d7 += y
    cause = ", ".join(plans[c][0] for c in causes)
    return RescuePlan(cause, list(dict.fromkeys(now)), list(dict.fromkeys(d3)), list(dict.fromkeys(d7)),
                      see_expert=len(causes) >= 3 or "root_rot" in causes, causes=causes)


# ---------- F5 cây hợp mệnh (theo quan niệm dân gian) ----------

CAN = ["Giáp", "Ất", "Bính", "Đinh", "Mậu", "Kỷ", "Canh", "Tân", "Nhâm", "Quý"]
CHI = ["Tý", "Sửu", "Dần", "Mão", "Thìn", "Tỵ", "Ngọ", "Mùi", "Thân", "Dậu", "Tuất", "Hợi"]
# Nạp âm: mỗi cặp năm liền nhau (Giáp Tý – Ất Sửu…) chung một hành, vòng 60 năm.
NAP_AM = [
    ("Kim", "Hải trung Kim"), ("Hỏa", "Lô trung Hỏa"), ("Mộc", "Đại lâm Mộc"), ("Thổ", "Lộ bàng Thổ"), ("Kim", "Kiếm phong Kim"),
    ("Hỏa", "Sơn đầu Hỏa"), ("Thủy", "Giản hạ Thủy"), ("Thổ", "Thành đầu Thổ"), ("Kim", "Bạch lạp Kim"), ("Mộc", "Dương liễu Mộc"),
    ("Thủy", "Tuyền trung Thủy"), ("Thổ", "Ốc thượng Thổ"), ("Hỏa", "Tích lịch Hỏa"), ("Mộc", "Tùng bách Mộc"), ("Thủy", "Trường lưu Thủy"),
    ("Kim", "Sa trung Kim"), ("Hỏa", "Sơn hạ Hỏa"), ("Mộc", "Bình địa Mộc"), ("Thổ", "Bích thượng Thổ"), ("Kim", "Kim bạch Kim"),
    ("Hỏa", "Phú đăng Hỏa"), ("Thủy", "Thiên hà Thủy"), ("Thổ", "Đại trạch Thổ"), ("Kim", "Thoa xuyến Kim"), ("Mộc", "Tang đố Mộc"),
    ("Thủy", "Đại khê Thủy"), ("Thổ", "Sa trung Thổ"), ("Hỏa", "Thiên thượng Hỏa"), ("Mộc", "Thạch lựu Mộc"), ("Thủy", "Đại hải Thủy"),
]
SINH = {"Mộc": "Hỏa", "Hỏa": "Thổ", "Thổ": "Kim", "Kim": "Thủy", "Thủy": "Mộc"}  # A sinh B
COLORS = {"Kim": ["trắng", "xám", "ánh kim"], "Mộc": ["xanh lá"], "Thủy": ["đen", "xanh dương"], "Hỏa": ["đỏ", "hồng", "tím"],
          "Thổ": ["vàng", "nâu đất"]}
# hành của cây theo màu lá / hoa nổi bật (quan niệm dân gian)
SPECIES_ELEMENT = {"si": "Mộc", "sanh": "Mộc", "tung_la_han": "Mộc", "mai_chieu_thuy": "Kim", "linh_sam": "Hỏa"}


@dataclass
class Menh:
    year: int
    can_chi: str
    element: str
    nap_am: str
    good_elements: list[str]  # hành của mệnh + hành sinh ra mệnh
    pot_colors: list[str]
    species: list[str]


def menh(year: int) -> Menh:
    i = (year - 4) % 60
    element, nap = NAP_AM[i // 2]
    mother = next(k for k, v in SINH.items() if v == element)  # hành sinh ra mệnh
    good = [element, mother]
    colors = COLORS[element] + COLORS[mother]
    species = [k for k, e in SPECIES_ELEMENT.items() if e in good]
    return Menh(year, f"{CAN[(year - 4) % 10]} {CHI[(year - 4) % 12]}", element, nap, good, colors, species)


# ---------- E1 Mai kịp Tết ----------

# Mùng 1 Tết Nguyên đán (dương lịch)
TET = {2026: date(2026, 2, 17), 2027: date(2027, 2, 6), 2028: date(2028, 1, 26), 2029: date(2029, 2, 13), 2030: date(2030, 2, 3),
       2031: date(2031, 1, 23), 2032: date(2032, 2, 11), 2033: date(2033, 1, 31), 2034: date(2034, 2, 19), 2035: date(2035, 2, 8)}


@dataclass
class MaiStep:
    when: date
    title_vi: str
    detail_vi: str


@dataclass
class MaiPlan:
    tet: date
    region: str
    defoliate_from: date
    defoliate_to: date
    steps: list[MaiStep]
    note_vi: str


def next_tet(today: date) -> date:
    return next(d for y, d in sorted(TET.items()) if d >= today)


def mai_plan(today: date, region: str, avg_temp_c: float | None = None) -> MaiPlan:
    """Lịch tuốt lá mai vàng: thường 10–15 tháng Chạp (≈ 15–20 ngày trước Tết) ở miền Nam; trời nóng tuốt muộn hơn,
    trời lạnh / miền Trung tuốt sớm hơn (mai nở chậm)."""
    tet = next_tet(today)
    early, late = 20, 15  # số ngày trước Tết
    if region == "central":
        early, late = early + 5, late + 5
    if avg_temp_c is not None:
        if avg_temp_c >= 30:
            early, late = early - 3, late - 3
        elif avg_temp_c <= 22:
            early, late = early + 5, late + 5
    d_from, d_to = tet - timedelta(days=early), tet - timedelta(days=late)
    steps = [
        MaiStep(d_from - timedelta(days=30), "Bón thúc hoa", "Bón phân lân, kali (NPK nhiều lân) để cây tích dinh dưỡng nuôi nụ."),
        MaiStep(d_from - timedelta(days=10), "Xiết nước", "Giảm tưới dần 7–10 ngày cho lá hơi héo, cây tập trung nuôi nụ."),
        MaiStep(d_from, "Tuốt lá", "Tuốt sạch lá (giữ cuống), tưới đẫm lại ngay, phun phân bón lá kích nụ."),
        MaiStep(tet - timedelta(days=10), "Xem nụ", "Nụ nứt vỏ lụa là kịp Tết. Nụ chậm: tưới nước ấm, phân kích hoa. Nụ nhanh: che mát, tưới nước lạnh."),
        MaiStep(tet - timedelta(days=1), "Mai nở", "Mai nở rộ khoảng mùng 1. Giữ chỗ thoáng, tránh gió mạnh làm rụng cánh."),
    ]
    return MaiPlan(tet, region, d_from, d_to, [s for s in steps if s.when >= today - timedelta(days=1)],
                   "Áp dụng cho mai vàng. Miền Bắc dùng đào Tết có lịch khác. Lịch là tham khảo — theo dõi nụ để chỉnh.")


# ---------- E5 định giá phôi ----------


@dataclass
class PriceEstimate:
    low: int
    high: int
    basis: str  # listings | rules
    trunk_cm: float | None
    comparables: int
    note_vi: str


def price_estimate(analysis: Analysis, species_key: str | None, real_height_cm: float | None,
                   comparable_prices_per_cm: list[float] | None = None) -> PriceEstimate | None:
    t = analysis.trunk
    if t is None:
        return None
    k = _px_to_cm(analysis, real_height_cm)
    trunk_cm = round(t.base_diameter_px * k, 1) if k else None
    if trunk_cm is None:
        return None
    nebari = {"good": 1.25, "average": 1.0, "poor": 0.8, "hidden": 0.9}.get(analysis.nebari.quality if analysis.nebari else "", 1.0)
    taper = {"good": 1.15, "weak": 1.0, "reverse": 0.8}.get(t.taper, 1.0)
    factor = nebari * taper
    comps = sorted(comparable_prices_per_cm or [])
    if len(comps) >= 5:
        q1, q3 = comps[len(comps) // 4], comps[(3 * len(comps)) // 4]
        low, high, basis = q1 * trunk_cm * factor, q3 * trunk_cm * factor, "listings"
    else:
        rng = (species_rules().get(species_key or "", {}) or {}).get("price_vnd_per_trunk_cm") or [100000, 300000]
        low, high, basis = rng[0] * trunk_cm * factor, rng[1] * trunk_cm * factor, "rules"
    rnd = lambda v: int(round(v / 50000) * 50000) or 50000  # noqa: E731
    return PriceEstimate(rnd(low), max(rnd(high), rnd(low)), basis, trunk_cm, len(comps),
                         "Giá tham khảo theo cỡ gốc, rễ, độ thon; giá thật tùy giống, sức khỏe và thỏa thuận.")
