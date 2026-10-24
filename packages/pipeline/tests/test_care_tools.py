from datetime import date

from bonsai_pipeline.care_tools import (
    graft_suggestions, mai_plan, menh, next_tet, price_estimate, rescue_plan, wire_plan,
)
from bonsai_pipeline.schemas import Analysis, DesignOption

from samples import analysis, option


def _a():
    return Analysis.model_validate(analysis()), DesignOption.model_validate(option())


def test_wire_plan_scales_with_real_height():
    a, o = _a()
    p = wire_plan(a, o, real_height_cm=60)  # cao 1000 px = 60 cm → gốc 120 px = 7,2 cm
    assert p.scale_known and [ln.branch for ln in p.lines][:3] == ["b1", "b3", "b4"] and p.lines[-1].branch == "new1"
    b1 = p.lines[0]
    assert b1.diameter_mm == round(72 * 0.33, 1) and b1.gauge_mm == 6  # cành to ≈ 23,8 mm → dây ≈ 8 mm → cỡ lớn nhất có
    assert all(g in (1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6) for g, _ in p.shopping) and all(m > 0 for _, m in p.shopping)
    assert not wire_plan(a, o, None).scale_known


def test_graft_finds_bare_sides_and_new_branch_spots():
    a, o = _a()
    spots, season = graft_suggestions(a, o, "si")
    sides = {s.side for s in spots}
    assert "right" in sides and any("trống cành" in s.reason_vi for s in spots)  # b2 (phải) bị cắt → thân phải trống
    assert any(s.at_px == [505, 600] for s in spots) and season


def test_rescue_plan_combines_causes():
    p = rescue_plan({"wilting": True, "wet_smell": True, "recent_repot": True})
    assert p.causes == ["root_rot", "shock"] and p.see_expert and "Ngừng tưới" in p.now[0]
    assert rescue_plan({}).cause_vi == "Cây có vẻ ổn"
    assert rescue_plan({"wilting": True}).causes == ["unknown"]


def test_menh_nap_am():
    m = menh(1984)
    assert (m.can_chi, m.element, m.nap_am) == ("Giáp Tý", "Kim", "Hải trung Kim") and m.good_elements == ["Kim", "Thổ"]
    assert menh(1990).element == "Thổ" and menh(1990).can_chi == "Canh Ngọ"
    assert menh(1975).nap_am == "Đại khê Thủy" and menh(1975).species == ["mai_chieu_thuy"]  # Kim sinh Thủy → hoa trắng hợp


def test_mai_plan_window_and_weather():
    p = mai_plan(date(2026, 11, 1), "south")
    assert p.tet == date(2027, 2, 6) == next_tet(date(2026, 11, 1))
    assert (p.tet - p.defoliate_from).days == 20 and (p.tet - p.defoliate_to).days == 15
    assert [s.title_vi for s in p.steps][2] == "Tuốt lá"
    hot, cold = mai_plan(date(2026, 11, 1), "south", 31), mai_plan(date(2026, 11, 1), "central", 21)
    assert hot.defoliate_from > p.defoliate_from > cold.defoliate_from  # nóng tuốt muộn, lạnh / miền Trung tuốt sớm


def test_price_estimate_rules_and_listings():
    a, _ = _a()
    est = price_estimate(a, "si", 60)
    assert est.basis == "rules" and est.trunk_cm == 7.2 and est.low < est.high
    est2 = price_estimate(a, "si", 60, [300000, 320000, 350000, 400000, 420000, 500000])
    assert est2.basis == "listings" and est2.comparables == 6
    assert price_estimate(a, "si", None) is None  # không biết cỡ thật thì không định giá
