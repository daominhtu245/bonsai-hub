import pytest
from pydantic import ValidationError

from bonsai_pipeline.rule_engine import allowed_styles, compute_targets, validate_design
from bonsai_pipeline.schemas import Analysis, DesignResult

from samples import analysis, design, option


def test_unusable_analysis_may_omit_structure():
    a = Analysis.model_validate({"image_quality": {"usable": False, "issues": ["blurry"]}})
    assert a.trunk is None


def test_usable_analysis_requires_trunk():
    with pytest.raises(ValidationError):
        Analysis.model_validate({"image_quality": {"usable": True}, "species": {"guess": "si", "confidence": 1}})


def test_targets_lower_apex_when_trunk_too_tall():
    a = Analysis.model_validate(analysis())  # 1000 / 120 = 8.3 > 7
    t = compute_targets(a, image_size=(1000, 1500), growth_speed="fast", real_height_cm=50)
    assert t.target_height_px == 720 and t.lower_apex_by_px == 280
    assert t.candidate_apex_px == [514.4, 580.0]
    assert t.first_branch_y_range_px == [1012, 1120]
    assert t.base_diameter_cm == 6.0 and t.max_thicken_pct_per_year == 15
    assert any("lower the apex" in n for n in t.notes_en)


def test_targets_keep_height_when_in_range():
    a = analysis()
    a["trunk"]["base_diameter_px"] = 160  # 6.25
    t = compute_targets(Analysis.model_validate(a), image_size=(1000, 1500))
    assert t.target_height_px == 1000 and t.lower_apex_by_px == 0 and t.cm_per_px is None


def test_measured_values_override_p1():
    t = compute_targets(Analysis.model_validate(analysis()), image_size=(1000, 1500),
                        measured_height_px=900, measured_base_diameter_px=150)
    assert t.current_height_px == 900 and t.target_height_px == 900


@pytest.mark.parametrize(
    "movement,lean,notable,expect_in,expect_out",
    [
        ("straight", 2, [], {"chokkan", "vn_truc_quan_tu", "shakan"}, {"vn_long", "moyogi", "kengai"}),
        ("s_curve", 5, [], {"moyogi", "vn_long"}, {"chokkan", "sokan", "sekijoju"}),
        ("leaning", 30, ["twin_trunk"], {"shakan", "sokan", "kengai"}, {"chokkan", "vn_long"}),
    ],
)
def test_allowed_styles(movement, lean, notable, expect_in, expect_out):
    a = analysis()
    a["trunk"].update(movement=movement, lean_angle_deg=lean, notable=notable)
    allowed = set(allowed_styles(Analysis.model_validate(a)))
    assert expect_in <= allowed and not (expect_out & allowed)


def _check(d, a=None):
    an = Analysis.model_validate(a or analysis())
    t = compute_targets(an, image_size=(1000, 1500))
    return validate_design(DesignResult.model_validate(d), an, t)


def test_valid_design_passes():
    # b1 ở (1300-1000)/720 = 0.42 → trong khoảng 0.25–0.4 ± 0.12
    assert _check(design()) == []


def test_detects_hard_rule_violations():
    bad = option(
        style_key="chokkan",  # thân chữ S không làm Trực
        keep_branches=[{"id": "b1", "role": "first_branch"}, {"id": "b2", "role": "first_branch"}, {"id": "b9", "role": "other"}],
        remove_branches=[{"id": "b1", "reason_vi": "x"}],
        apex={"point_px": [1500, 100], "lean": "forward"},
    )
    errs = "\n".join(_check(design(bad, option(style_key="shakan", suitability=0.95))))
    for needle in ["style_key must be one of", "unknown branch ids ['b9']", "both kept and removed", "missing ['b3', 'b4', 'b5']",
                   "only one branch can be first_branch", "bar branch", "outside the image", "sorted by suitability"]:
        assert needle in errs, needle


def test_first_branch_too_high():
    o = option(keep_branches=[{"id": "b4", "role": "first_branch"}, {"id": "b1", "role": "other"}, {"id": "b3", "role": "other"}])
    errs = _check(design(o, option(style_key="shakan", suitability=0.5)))
    assert any("first_branch b4" in e for e in errs)


def test_duplicate_styles():
    errs = _check(design(option(), option(suitability=0.5)))
    assert any("duplicate style_key" in e for e in errs)
