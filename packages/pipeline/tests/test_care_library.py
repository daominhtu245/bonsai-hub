import pytest

from bonsai_pipeline.care_library import guide_library, library_guide, library_report, rule_stage_plan, stage_years
from bonsai_pipeline.dictionaries import SPECIES, STYLES
from bonsai_pipeline.schemas import Analysis, DesignOption
from bonsai_pipeline.stages import chain_prompt, validate_guide, validate_plan
from bonsai_pipeline.phase_a import PromptTemplate

from samples import analysis, option


@pytest.mark.parametrize("years", [4, 5, 6])
@pytest.mark.parametrize("species", [s["key"] for s in SPECIES] + [None])
def test_plan_and_guide_satisfy_llm_rules(years, species):
    a, o = Analysis.model_validate(analysis()), DesignOption.model_validate(option())
    max_thicken = 10 * years
    plan = rule_stage_plan(a, o, years=years, max_thicken_pct=max_thicken, style_desc_en="informal upright",
                           species_key=species, region="north")
    assert validate_plan(plan, max_thicken_pct=max_thicken) == []
    t = stage_years(years)
    assert 0 < t["S2"] < t["S3"] < t["S4"] == years
    guide = library_guide(a, o, plan, species_key=species, style_key="moyogi", region="north")
    assert validate_guide(guide) == []
    assert all(len(g.actions_vi) <= 5 and g.title_vi for g in guide.stages)
    s1 = guide.stages[1]
    assert any("cành đánh dấu đỏ" in x for x in s1.actions_vi)
    report = library_report(a, o, guide, species_key=species)
    assert report.style_reason_vi == o.why_vi and report.species_care_vi


def test_every_style_has_a_tip_and_prompt_uses_english_time():
    lib = guide_library()
    assert {s["key"] for s in STYLES} <= set(lib["styles"])
    a, o = Analysis.model_validate(analysis()), DesignOption.model_validate(option())
    plan = rule_stage_plan(a, o, years=5, max_thicken_pct=50, style_desc_en="dragon", species_key="si", region="south")
    text = chain_prompt(PromptTemplate("P3d_chain", "v1", None, "{{time_from_start}} | {{visual_state_en}}"), plan, "S2")
    assert text.startswith("about 2 years |") and "grown out freely" in text


def test_background_check_ignores_pot_corners_when_pot_changes():
    from bonsai_pipeline.phase_b import background_failed

    pot_swapped = [0.05, 0.08, 0.30, 0.25]  # chỉ 2 góc dưới (chậu) đổi
    assert background_failed(pot_swapped, pot_changes=False)
    assert not background_failed(pot_swapped, pot_changes=True)
    assert background_failed([0.2, 0.3, 0.0, 0.0], pot_changes=True)
