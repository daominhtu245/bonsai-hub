import pytest
from pydantic import BaseModel

from bonsai_pipeline.adapters.base import AIError, SchemaValidationError
from bonsai_pipeline.adapters.llm_client import LLMClient, extract_json
from bonsai_pipeline.adapters.providers.fake import FakeLLM
from bonsai_pipeline.steps import StepRecord


class Out(BaseModel):
    style_key: str
    suitability: float


def test_extract_json_handles_fences_and_prose():
    assert extract_json('```json\n{"a": 1}\n```') == {"a": 1}
    assert extract_json('Here you go: {"a": {"b": 2}} thanks') == {"a": {"b": 2}}


def test_valid_first_time():
    llm = FakeLLM(responses=['{"style_key": "moyogi", "suitability": 0.8}'])
    res = LLMClient(llm).complete_json(system="s", user="u", schema=Out)
    assert res.value.style_key == "moyogi"
    assert len(res.trace.calls) == 1


def test_retries_with_error_message_then_succeeds():
    llm = FakeLLM(responses=["not json", '{"style_key": "x"}', '{"style_key": "x", "suitability": 0.5}'])
    res = LLMClient(llm, max_retries=2).complete_json(system="s", user="u", schema=Out)
    assert res.value.suitability == 0.5
    assert len(res.trace.calls) == 3
    retry_prompt = llm.calls[2]["messages"][-1]["content"]
    assert "suitability" in retry_prompt and "Field required" in retry_prompt


def test_gives_up_after_two_retries():
    llm = FakeLLM(responses=["bad"] * 3)
    with pytest.raises(SchemaValidationError) as exc:
        LLMClient(llm, max_retries=2).complete_json(system="s", user="u", schema=Out)
    assert len(llm.calls) == 3
    assert len(exc.value.trace.calls) == 3  # vẫn tính chi phí các lần gọi hỏng


def test_hard_rules_trigger_retry():
    llm = FakeLLM(responses=['{"style_key": "vn_long", "suitability": 0.9}', '{"style_key": "moyogi", "suitability": 0.7}'])
    rules = lambda v: ["style vn_long not allowed for straight trunk"] if v.style_key == "vn_long" else []
    res = LLMClient(llm).complete_json(system="s", user="u", schema=Out, hard_rules=rules)
    assert res.value.style_key == "moyogi"
    assert "vn_long not allowed" in llm.calls[1]["messages"][-1]["content"]


def test_fallback_provider_on_api_error():
    primary = FakeLLM(model="claude-sonnet-5-5", responses=[AIError("down", retryable=True)])
    fallback = FakeLLM(model="gemini-flash-latest", responses=['{"style_key": "a", "suitability": 1}'])
    res = LLMClient(primary, fallback).complete_json(system="s", user="u", schema=Out)
    assert res.value.style_key == "a"
    rec = StepRecord.from_trace("P2", res.trace, prompt_version="v1", ok=True)
    assert rec.model == "gemini-flash-latest" and rec.attempts == 2
    assert rec.cost_usd > 0
