import io
import json
from pathlib import Path

import numpy as np
import pytest
import yaml
from PIL import Image, ImageDraw

from bonsai_pipeline.adapters.base import AIError, ImageInput
from bonsai_pipeline.adapters.image_client import ImageClient
from bonsai_pipeline.adapters.llm_client import LLMClient
from bonsai_pipeline.adapters.providers.fake import DemoImage, FakeImage, FakeLLM
from bonsai_pipeline.phase_a import PromptTemplate
from bonsai_pipeline.phase_b import (
    Candidate, JudgeResult, cv_checks, generate, judge, p3a_variables, repair_inputs, select, years_to_final,
)
from bonsai_pipeline.prompts import render, template_variables
from bonsai_pipeline.schemas import Analysis, DesignOption
from bonsai_pipeline.steps import StepRecord

from samples import analysis, option

PROMPTS = Path(__file__).resolve().parents[2] / "prompts"


def _tpl(code):
    d = yaml.safe_load((PROMPTS / f"{code}.v1.yaml").read_text())
    return PromptTemplate(d["step_code"], d["version"], d.get("system"), d["user"])


def _photo(w=300, h=450, color=(200, 190, 170)):
    img = Image.new("RGB", (w, h), color)
    ImageDraw.Draw(img).line([(150, 420), (150, 80)], fill=(107, 79, 58), width=20)
    buf = io.BytesIO()
    img.save(buf, format="WEBP")
    return buf.getvalue()


def _rec():
    return StepRecord("P3a", "fake", "fake", None, 0, 0, 1, 0.0, 1, True)


def _cand(attempt=0, image=None, scores=8, hard=None, cv_fails=None):
    c = Candidate(attempt, image or _photo(), "fake", "p", _rec())
    c.cv = {"fails": cv_fails or []}
    if scores is not None:
        c.judge = JudgeResult(**dict.fromkeys(
            ["trunk_fidelity", "proportions", "silhouette", "branch_structure", "negative_space", "species_realism",
             "timeline_plausibility", "photo_realism"], scores), hard_fail=hard or [])
    return c


def test_p3a_variables_fill_template():
    a, o = Analysis.model_validate(analysis()), DesignOption.model_validate(option())
    v = p3a_variables(o, a, style_desc="informal upright", species_name="Si", species_desc="ficus", growth_speed="fast",
                      years=years_to_final("fast"))
    assert template_variables(_tpl("P3a").user) <= v.keys()
    assert v["years"] == 4 and v["max_thicken_pct"] == 60 and v["first_branch_side"] == "left"
    text = render(_tpl("P3a").user, v)
    assert "oval bonsai pot, unglazed brown" in text and "off-center to the left" in text and "4 distinct foliage pads" in text


def test_judge_total_is_weighted():
    j = JudgeResult(trunk_fidelity=10, proportions=6, silhouette=6, branch_structure=6, negative_space=6,
                    species_realism=6, timeline_plausibility=6, photo_realism=6)
    assert j.total() == pytest.approx((20 + 9 + 4 * 6 + 9 + 6) / 10, abs=0.01)


def test_generate_parallel_tolerates_failures():
    import threading

    class Flaky(FakeImage):
        lock, n = threading.Lock(), 0

        def edit(self, **kw):
            with self.lock:
                Flaky.n += 1
                fail = Flaky.n == 2
            if fail:
                raise AIError("down", retryable=False)
            return super().edit(**kw)

    client = ImageClient(Flaky(), max_retries=0, sleep=lambda _: None)
    cands, failed = generate(client, "p", [ImageInput(_photo(), "image/webp")], size=(300, 450), n=3,
                             step_code="P3a", prompt_version="P3a.v1", first_attempt=0)
    assert len(cands) == 2 and len(failed) == 1 and not failed[0].ok
    assert Image.open(io.BytesIO(cands[0].image)).size == (300, 450)
    assert sorted(c.attempt for c in cands) in ([0, 2], [0, 1], [1, 2])


def test_cv_checks_background_and_aspect():
    orig = _photo()
    same = Candidate(0, DemoImage().edit(prompt="", images=[ImageInput(orig)]).images[0], "demo", "p", _rec())
    same.image = _webp(same.image)
    assert cv_checks(orig, same)["fails"] == []

    changed = Candidate(1, _photo(color=(30, 60, 30)), "x", "p", _rec())
    out = cv_checks(orig, changed)
    assert "background_changed" in out["fails"] and out["cv_fallback"] is True

    squashed = Candidate(2, _photo(), "x", "p", _rec())
    squashed.cv["generated_size"] = [400, 450]
    assert "aspect_changed" in cv_checks(orig, squashed)["fails"]


def _webp(png):
    buf = io.BytesIO()
    Image.open(io.BytesIO(png)).save(buf, format="WEBP")
    return buf.getvalue()


def test_cv_trunk_iou_with_segmenter():
    m = np.zeros((450, 300), dtype=bool)
    m[80:420, 140:160] = True

    class Seg:
        def __init__(self, mask):
            self.mask = mask

        def segment(self, img):
            return self.mask

    orig = _photo()
    c = Candidate(0, orig, "x", "p", _rec())
    assert cv_checks(orig, c, original_mask=m, segmenter=Seg(m))["trunk_iou"] == 1.0
    moved = np.roll(m, 60, axis=1)
    out = cv_checks(orig, c, original_mask=m, segmenter=Seg(moved))
    assert {"trunk_changed", "base_moved"} <= set(out["fails"]) and out["cv_fallback"] is False


def test_judge_records_and_scores():
    a_opt = DesignOption.model_validate(option())
    body = {k: 8 for k in ["trunk_fidelity", "proportions", "silhouette", "branch_structure", "negative_space",
                           "species_realism", "timeline_plausibility", "photo_realism"]} | {"hard_fail": [], "summary_en": "ok"}
    llm = FakeLLM(responses=[json.dumps(body)])
    c = _cand(scores=None)
    rec = judge(LLMClient(llm), _tpl("P4"), _photo(), c, option=a_opt, years=4, species_name="Si")
    assert rec.ok and c.total == 8.0 and c.passed
    assert llm.calls[0]["images"] == 2 and "Target years: 4; species: Si" in llm.calls[0]["messages"][0]["content"]


def test_select_rules():
    good, better, failed = _cand(0, scores=7), _cand(1, scores=9, hard=["trunk_changed"]), _cand(2, scores=10, cv_fails=["background_changed"])
    s = select([good, better, failed])
    assert s.best is good and s.passed and not s.low_confidence

    s = select([_cand(0, scores=5), _cand(1, scores=6)])
    assert s.best.attempt == 1 and not s.passed and s.low_confidence

    s = select([_cand(0, scores=None, cv_fails=["aspect_changed"])])
    assert s.best is not None and s.low_confidence
    assert select([]).best is None


def test_repair_inputs():
    c = _cand(scores=5, hard=["trunk_changed"])
    c.judge.fix_instructions = "Make the pads smaller."
    checks, fixes = repair_inputs(c)
    assert "trunk_changed" in checks and "low score: proportions" in checks
    assert "Do not redraw the trunk" in fixes and "Make the pads smaller." in fixes
