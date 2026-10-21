import io
import json
from pathlib import Path

import numpy as np
import pytest
import yaml
from PIL import Image, ImageDraw

from bonsai_pipeline.adapters.base import ImageInput, SchemaValidationError
from bonsai_pipeline.adapters.image_client import ImageClient
from bonsai_pipeline.adapters.llm_client import LLMClient
from bonsai_pipeline.adapters.providers.fake import DemoImage, DemoLLM, FakeImage, FakeLLM
from bonsai_pipeline.phase_a import PromptTemplate
from bonsai_pipeline.phase_b import Candidate
from bonsai_pipeline.prompts import template_variables
from bonsai_pipeline.schemas import Analysis, DesignOption
from bonsai_pipeline.stages import (
    StagePlan, chain_prompt, cut_regions_change, render_stage, run_p2b, run_p5, run_p6, s1_prompt, stage_checks,
    validate_plan,
)
from bonsai_pipeline.steps import StepRecord

from samples import analysis, option

PROMPTS = Path(__file__).resolve().parents[2] / "prompts"


def _tpl(code):
    d = yaml.safe_load((PROMPTS / f"{code}.v1.yaml").read_text())
    return PromptTemplate(d["step_code"], d["version"], d.get("system"), d["user"])


def _plan(**over):
    body = DemoLLM().complete(system="planning the realistic development path", messages=[{"role": "user", "content": ""}],
                              images=[], max_tokens=10).text
    d = json.loads(body)
    for i, patch in over.items():
        d["stages"][int(i)].update(patch)
    return d


def _photo(w=300, h=450, color=(200, 190, 170)):
    img = Image.new("RGB", (w, h), color)
    ImageDraw.Draw(img).line([(150, 420), (150, 80)], fill=(107, 79, 58), width=20)
    buf = io.BytesIO()
    img.save(buf, format="WEBP")
    return buf.getvalue()


def test_validate_plan():
    assert validate_plan(StagePlan.model_validate(_plan()), max_thicken_pct=60) == []
    errs = "\n".join(validate_plan(StagePlan.model_validate(
        _plan(**{"1": {"trunk_thicken_pct_vs_original": 40, "foliage_density_pct": 30}, "3": {"trunk_thicken_pct_vs_original": 90}})),
        max_thicken_pct=60))
    assert "never decrease" in errs and "exceeds the allowed 60" in errs and "S2 foliage" in errs
    wrong = _plan()
    wrong["stages"] = wrong["stages"][:3]
    assert "exactly" in validate_plan(StagePlan.model_validate(wrong), max_thicken_pct=60)[0]


def test_p2b_retries_on_rule_violation():
    a, o = Analysis.model_validate(analysis()), DesignOption.model_validate(option())
    bad = _plan(**{"3": {"trunk_thicken_pct_vs_original": 99}})
    llm = FakeLLM(responses=[json.dumps(bad), json.dumps(_plan())])
    plan, rec = run_p2b(LLMClient(llm), _tpl("P2b"), a, o, final_summary="four pads", growth_speed="fast",
                        region="south", max_thicken_pct=60)
    assert rec.attempts == 2 and [s.id for s in plan.stages] == ["S1", "S2", "S3", "S4"]
    sent = llm.calls[0]["messages"][0]["content"]
    assert "Final image description (from judge): four pads" in sent and "S4 is at most 60" in sent
    assert "south" in llm.calls[0]["system"]


def test_stage_prompts_fill_templates():
    plan = StagePlan.model_validate(_plan())
    assert "Foliage density about 40%" in s1_prompt(_tpl("P3d_S1"), plan)
    s3 = chain_prompt(_tpl("P3d_chain"), plan, "S3")
    assert "pad formation" in s3 and "original +30%" in s3 and "bonsai pot shown in the final" in s3
    assert "Same nursery pot" in chain_prompt(_tpl("P3d_chain"), plan, "S2")
    assert template_variables(_tpl("P3d_chain").user) == {
        "prev_stage_name", "stage_name_en", "time_from_start", "trunk_thicken_pct", "pot_rule", "visual_state_en",
        "foliage_density_pct"}


def _cand(img):
    return Candidate(0, img, "m", "p", StepRecord("P3d", "x", "m", None, 0, 0, 1, 0, 1, True))


class Seg:
    def __init__(self, masks):
        self.masks = list(masks)

    def segment(self, img):
        return self.masks.pop(0)


def _mask(width, x=140):
    m = np.zeros((450, 300), dtype=bool)
    m[80:420, x : x + width] = True
    return m


def test_stage_checks_monotonic_trunk():
    orig = _photo()
    out, mask = stage_checks(orig, orig, _cand(orig), previous_mask=_mask(20), segmenter=Seg([_mask(24)]))
    assert out["fails"] == [] and out["trunk_area_ratio"] == 1.2 and mask is not None
    out, _ = stage_checks(orig, orig, _cand(orig), previous_mask=_mask(20), segmenter=Seg([_mask(12)]))
    assert "trunk_shrank" in out["fails"]
    out, _ = stage_checks(orig, orig, _cand(orig), previous_mask=_mask(20), segmenter=Seg([_mask(20, x=200)]))
    assert "base_moved" in out["fails"]
    out, _ = stage_checks(orig, orig, _cand(_photo(color=(20, 90, 20))))
    assert "background_changed" in out["fails"] and out["cv_fallback"]


def test_render_stage_retries_then_falls_back():
    orig = _photo()
    imgs = [ImageInput(orig, "image/webp")]
    ok, _ = render_stage(ImageClient(DemoImage(), max_retries=0), "Foliage density about 40%", imgs, code="S1",
                         size=(300, 450), original=orig, previous=orig, previous_mask=None, segmenter=None,
                         prompt_version="P3d_S1.v1")
    assert ok.candidate is not None and len(ok.attempts) == 1
    bad, _ = render_stage(ImageClient(FakeImage(), max_retries=0), "x", imgs, code="S2", size=(300, 450),
                          original=orig, previous=orig, previous_mask=None, segmenter=None, prompt_version="v")
    assert bad.candidate is None and len(bad.attempts) == 3 and len(bad.records) == 3


def test_cut_regions_metric():
    a, o = Analysis.model_validate(analysis()), DesignOption.model_validate(option())
    img = _photo(1000, 1500)
    assert cut_regions_change(img, img, img, a, o) == 0.0


def test_p6_and_p5_with_demo():
    a, o = Analysis.model_validate(analysis()), DesignOption.model_validate(option())
    llm = LLMClient(DemoLLM())
    guide, rec = run_p6(llm, _tpl("P6"), a, StagePlan.model_validate(_plan()))
    assert [s.id for s in guide.stages] == ["S0", "S1", "S2", "S3", "S4"] and rec.step_code == "P6"
    report, _ = run_p5(llm, _tpl("P5"), a, o, {"total": 8})
    assert report.disclaimer_vi.startswith("Ảnh là minh hoạ")


def test_p6_requires_all_stages():
    a = Analysis.model_validate(analysis())
    partial = json.dumps({"stages": [{"id": "S0", "title_vi": "t", "see_vi": "s", "actions_vi": [], "best_time_vi": "x"}]})
    with pytest.raises(SchemaValidationError):
        run_p6(LLMClient(FakeLLM(responses=[partial] * 3)), _tpl("P6"), a, StagePlan.model_validate(_plan()))
