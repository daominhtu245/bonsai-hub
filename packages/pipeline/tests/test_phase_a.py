import json
from pathlib import Path

import pytest
import yaml

from bonsai_pipeline.adapters.base import ImageInput, SchemaValidationError
from bonsai_pipeline.adapters.llm_client import LLMClient
from bonsai_pipeline.adapters.providers.fake import FakeLLM
from bonsai_pipeline.phase_a import PromptTemplate, run_p1, run_p2
from bonsai_pipeline.rule_engine import compute_targets

from samples import analysis, design, option

PROMPTS = Path(__file__).resolve().parents[2] / "prompts"


def _tpl(code):
    d = yaml.safe_load((PROMPTS / f"{code}.v1.yaml").read_text())
    return PromptTemplate(d["step_code"], d["version"], d.get("system"), d["user"])


def test_p1_renders_prompt_and_parses():
    llm = FakeLLM(responses=[json.dumps(analysis())])
    a, rec = run_p1(LLMClient(llm), _tpl("P1"), [ImageInput(b"x")], image_size=(1000, 1500), species_key=None, real_height_cm=45)
    assert a.species.guess == "si" and rec.step_code == "P1" and rec.prompt_version == "P1.v1"
    user = llm.calls[0]["messages"][0]["content"]
    assert 'species="unknown"' in user and "real_height_cm=45" in user and "1000x1500" in user
    assert llm.calls[0]["images"] == 1


def test_p2_retries_on_hard_rule_violation():
    a, _ = run_p1(LLMClient(FakeLLM(responses=[json.dumps(analysis())])), _tpl("P1"), [], image_size=(1000, 1500),
                  species_key="si", real_height_cm=None)
    t = compute_targets(a, image_size=(1000, 1500), growth_speed="fast")
    bad = design(option(style_key="chokkan"), option(style_key="shakan", suitability=0.5))
    llm = FakeLLM(responses=[json.dumps(bad), json.dumps(design())])
    d, rec = run_p2(LLMClient(llm), _tpl("P2"), a, t, user_style="vn_long", goal="sale")
    assert [o.style_key for o in d.options] == ["moyogi", "shakan", "bunjingi"]
    assert rec.attempts == 2
    first = llm.calls[0]
    assert "moyogi:" in first["messages"][0]["content"] and "chokkan:" not in first["messages"][0]["content"]
    assert 'style="vn_long"' in first["messages"][0]["content"]
    assert "height_to_base_diameter" in first["system"]
    assert "style_key must be one of" in llm.calls[1]["messages"][-1]["content"]


def test_p2_gives_up():
    a, _ = run_p1(LLMClient(FakeLLM(responses=[json.dumps(analysis())])), _tpl("P1"), [], image_size=(1000, 1500),
                  species_key="si", real_height_cm=None)
    t = compute_targets(a, image_size=(1000, 1500))
    bad = json.dumps(design(option(style_key="chokkan"), option(style_key="shakan", suitability=0.5)))
    with pytest.raises(SchemaValidationError):
        run_p2(LLMClient(FakeLLM(responses=[bad] * 3)), _tpl("P2"), a, t)


def test_demo_provider_passes_schema_and_rules(monkeypatch):
    from bonsai_pipeline.adapters.llm_client import build_llm_provider
    from bonsai_pipeline.config import AISettings

    monkeypatch.setenv("APP_ENV", "dev")
    llm = LLMClient(build_llm_provider("demo", "demo", AISettings()))
    a, _ = run_p1(llm, _tpl("P1"), [], image_size=(1024, 1536), species_key=None, real_height_cm=45)
    t = compute_targets(a, image_size=(1024, 1536))
    d, rec = run_p2(llm, _tpl("P2"), a, t)
    assert len(d.options) == 3 and rec.attempts == 1  # không vi phạm luật cứng
    monkeypatch.setenv("APP_ENV", "prod")
    with pytest.raises(ValueError):
        build_llm_provider("demo", "demo", AISettings())
