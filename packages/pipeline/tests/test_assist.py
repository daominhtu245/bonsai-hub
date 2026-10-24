import json

import httpx
import pytest

from bonsai_pipeline import health, qa, weather
from bonsai_pipeline.adapters.llm_client import LLMClient
from bonsai_pipeline.adapters.providers.fake import FakeLLM
from bonsai_pipeline.dictionaries import default_rule_doc
from bonsai_pipeline.phase_a import PromptTemplate
from bonsai_pipeline.rules_validate import validate_rule_doc

PROMPT = PromptTemplate("H1", "v1", "sys {{species_vi}}", "u {{symptoms_json}} {{catalog_json}}")


def test_pests_doc_is_valid_and_validator_catches_errors():
    doc = default_rule_doc("pests")
    assert validate_rule_doc("pests", doc) == []
    bad = {**doc, "items": {"x": {"name_vi": "X", "symptoms": ["khong_co"], "treat_now_vi": []}}}
    errs = validate_rule_doc("pests", bad)
    assert any("khong_co" in e for e in errs) and any("xử lý" in e for e in errs)


def test_symptom_scoring():
    r = health.from_symptoms(["fine_webs", "speckled_leaves"])
    assert r["findings"][0]["key"] == "nhen_do" and r["findings"][0]["treat_now_vi"]
    assert health.from_symptoms([])["findings"] == []


def test_h1_only_accepts_catalog_keys_and_copies_treatment():
    fake = FakeLLM(responses=[
        json.dumps({"usable": True, "healthy": False, "picks": [{"key": "thuoc_xyz", "likelihood": "high", "reason_vi": "x"}]}),
        json.dumps({"usable": True, "healthy": False, "picks": [{"key": "rep_sap", "likelihood": "high", "reason_vi": "Bông trắng ở nách lá"}]}),
    ])
    out, rec = health.run_h1(LLMClient(fake), PROMPT, b"img", ["white_cotton"], "Si")
    assert len(fake.calls) == 2 and fake.calls[0]["images"] == 1  # lần 1 bị luật cứng loại (mã ngoài bảng)
    f = out["findings"][0]
    assert out["method"] == "ai" and f["key"] == "rep_sap" and f["treat_now_vi"] == default_rule_doc("pests")["items"]["rep_sap"]["treat_now_vi"]
    assert rec.step_code == "H1" and rec.attempts == 2


def test_weather_fetch_and_alerts():
    def handler(req: httpx.Request):
        assert req.url.params["latitude"] == "10.03" and "precipitation_sum" in req.url.params["daily"]
        return httpx.Response(200, json={"daily": {"time": ["2026-10-26", "2026-10-27"], "temperature_2m_max": [33, 38.2],
                                                   "temperature_2m_min": [24, 25], "precipitation_sum": [72.5, 0], "wind_speed_10m_max": [20, 15]}})

    daily = weather.fetch(10.03, 105.78, client=httpx.Client(transport=httpx.MockTransport(handler)))
    got = [(a.date, a.kind) for a in weather.alerts(daily)]
    assert got == [("2026-10-26", "heavy_rain"), ("2026-10-27", "heat")]
    assert weather.summary(daily)[1]["max_c"] == 38.2


@pytest.mark.parametrize("q,topics", [
    ("Khi nào nên tuốt lá?", ["defoliation"]),
    ("Cây đầy rễ có nên thay chậu?", ["repot"]),  # "đầy" không bị nhầm "dây"
    ("uon day canh nao", ["wiring"]),  # gõ không dấu
    ("Tưới bao nhiêu và bón phân gì", ["water", "fertilize"]),
])
def test_offline_answer_topics(q, topics):
    a = qa.offline_answer(q, "mai_chieu_thuy")
    assert a["topics"] == topics and a["answer_vi"] and "[" not in a["answer_vi"]  # bỏ mã nguồn khỏi câu đọc to


def test_q1_answer():
    fake = FakeLLM(responses=[json.dumps({"answer_vi": "Bạn tưới khi mặt đất se khô.", "confident": False})])
    out, rec = qa.run_q1(LLMClient(fake), PromptTemplate("Q1", "v1", "s", "{{question}} {{species_json}} {{tree_json}}"), "Tưới sao?", "si", {"years": 4})
    assert out == {"answer_vi": "Bạn tưới khi mặt đất se khô.", "topics": [], "method": "ai", "suggest_expert": True}
    assert "Ficus" in fake.calls[0]["messages"][0]["content"] and rec.step_code == "Q1"
