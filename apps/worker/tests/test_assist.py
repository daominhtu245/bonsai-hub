import json
from datetime import date

import httpx

from bonsai_api.db.models import AssistantQuestion, HealthCheck, PipelineStep, Tree, User
from bonsai_pipeline.adapters.base import AIError
from bonsai_pipeline.adapters.llm_client import LLMClient
from bonsai_pipeline.adapters.providers.fake import FakeLLM
from bonsai_worker.tasks import assist

from test_worker import _tree, bucket  # noqa: F401 (fixture)


def test_health_ai_and_fallback(db, login, bucket):  # noqa: F811
    user, tree = _tree(db, login)
    bucket["health/x.webp"] = b"img"
    h = HealthCheck(user_id=user.id, tree_id=tree.id, photo_key="health/x.webp", symptoms=["white_cotton"], status="queued",
                    result={"method": "symptoms", "findings": [{"key": "rep_sap"}]})
    db.add(h)
    db.commit()
    fake = FakeLLM(responses=[json.dumps({"usable": True, "healthy": False, "picks": [{"key": "rep_muoi", "likelihood": "medium", "reason_vi": "Rệp ở đọt"}]})])
    assist.run_health(db, h.id, llm=LLMClient(fake))
    db.refresh(h)
    assert h.status == "done" and h.result["method"] == "ai" and h.result["findings"][0]["key"] == "rep_muoi"
    assert db.query(PipelineStep).filter(PipelineStep.step_code == "H1").count() == 1

    h2 = HealthCheck(user_id=user.id, photo_key="health/x.webp", symptoms=["white_cotton"], status="queued",
                     result={"method": "symptoms", "findings": [{"key": "rep_sap"}]})
    db.add(h2)
    db.commit()
    assist.run_health(db, h2.id, llm=LLMClient(FakeLLM(responses=[AIError("out of credit")])))
    db.refresh(h2)
    assert h2.status == "done" and h2.result["ai_failed"] and h2.result["findings"][0]["key"] == "rep_sap"  # giữ kết quả tra bảng


def test_question_ai_and_fallback(db, login):
    user, tree = _tree(db, login)
    db.get(Tree, tree.id).species_key = "si"
    q = AssistantQuestion(user_id=user.id, tree_id=tree.id, question="Khi nào cắt tỉa?", status="queued", answer={"answer_vi": "tra bảng", "method": "offline"})
    db.add(q)
    db.commit()
    assist.run_question(db, q.id, llm=LLMClient(FakeLLM(responses=[json.dumps({"answer_vi": "Cắt khi đủ 6–8 lá.", "confident": True})])))
    db.refresh(q)
    assert q.answer["method"] == "ai" and q.answer["answer_vi"].startswith("Cắt")
    q2 = AssistantQuestion(user_id=user.id, question="x?", status="queued", answer={"answer_vi": "tra bảng", "method": "offline"})
    db.add(q2)
    db.commit()
    assist.run_question(db, q2.id, llm=LLMClient(FakeLLM(responses=[AIError("down")])))
    db.refresh(q2)
    assert q2.status == "done" and q2.answer["answer_vi"] == "tra bảng" and q2.answer["ai_failed"]


class FakeRedis:
    def __init__(self):
        self.keys = set()

    def set(self, k, v, nx=False, ex=None):
        if nx and k in self.keys:
            return None
        self.keys.add(k)
        return True


def test_weather_daily_dedupes(db, login, monkeypatch):
    user, tree = _tree(db, login)
    db.get(User, user.id).province = "can_tho"
    login("noprov@example.com")  # không có tỉnh → không lấy dự báo
    db.commit()
    pushed = []
    monkeypatch.setattr(assist, "send_web_push", lambda db, uid, msg, base: pushed.append((uid, msg.event, msg.body)) or 1)
    calls = []

    def handler(req):
        calls.append(req.url.params["latitude"])
        return httpx.Response(200, json={"daily": {"time": ["2026-10-25", "2026-10-26"], "temperature_2m_max": [30, 31], "temperature_2m_min": [24, 24],
                                                   "precipitation_sum": [5, 90], "wind_speed_10m_max": [10, 10]}})

    http = httpx.Client(transport=httpx.MockTransport(handler))
    r = FakeRedis()
    assert assist.run_weather_daily(db, r, http=http, today=date(2026, 10, 25)) == 1
    assert pushed == [(user.id, "weather_heavy_rain", pushed[0][2])] and pushed[0][2].startswith("Ngày 26/10:")
    assert len(calls) == 1  # chỉ tỉnh có người dùng có cây
    assert assist.run_weather_daily(db, r, http=http, today=date(2026, 10, 25)) == 0  # không báo lại


def test_weather_daily_respects_feature_flag(db, login, monkeypatch):
    from bonsai_api.services.features import save

    user, _ = _tree(db, login)
    db.get(User, user.id).province = "can_tho"
    db.commit()
    pushed = []
    monkeypatch.setattr(assist, "send_web_push", lambda db, uid, msg, base: pushed.append(uid) or 1)
    rain = {"daily": {"time": ["2026-10-26"], "temperature_2m_max": [30], "temperature_2m_min": [24], "precipitation_sum": [90], "wind_speed_10m_max": [10]}}
    http = httpx.Client(transport=httpx.MockTransport(lambda req: httpx.Response(200, json=rain)))
    save(db, {"weather": "off"}, None, by=None)
    db.commit()
    assert assist.run_weather_daily(db, FakeRedis(), http=http, today=date(2026, 10, 25)) == 0
    save(db, {"weather": "staff"}, None, by=None)  # người chơi thường không nhận
    db.commit()
    assert assist.run_weather_daily(db, FakeRedis(), http=http, today=date(2026, 10, 25)) == 0
    save(db, {"weather": "staff"}, [db.get(User, user.id).email], by=None)  # có trong danh sách người thử
    db.commit()
    assert assist.run_weather_daily(db, FakeRedis(), http=http, today=date(2026, 10, 25)) == 1 and pushed == [user.id]
