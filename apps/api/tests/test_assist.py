"""Đợt 6: đoán sâu bệnh, hỏi đáp, thời tiết."""

import io
import uuid

from PIL import Image

from bonsai_api.db.models import User

from test_week5 import bucket  # noqa: F401 (fixture)


def _admin(db, client, login):
    h, b = login("admin@example.com")
    from bonsai_api.db.models import UserRole

    db.get(User, uuid.UUID(b["user"]["id"])).role = UserRole.admin
    db.commit()
    return h


def test_health_check_offline_then_ai(db, client, login, bucket, monkeypatch):  # noqa: F811
    sent = []
    monkeypatch.setattr("bonsai_api.queue.enqueue", lambda *a, **kw: sent.append(a) or True)
    syms = client.get("/api/v1/tools/health/symptoms").json()
    assert {"code": "white_cotton", "label_vi": syms[1]["label_vi"]} in syms
    headers, body = login()
    assert client.post("/api/v1/health-checks", headers=headers, json={}).status_code == 400
    assert client.post("/api/v1/health-checks", headers=headers, json={"symptoms": ["khong_co"]}).status_code == 400
    r = client.post("/api/v1/health-checks", headers=headers, json={"symptoms": ["white_cotton", "sticky_leaves"]}).json()
    assert r["status"] == "done" and r["result"]["findings"][0]["key"] == "rep_sap" and sent == []  # không ảnh → tra bảng ngay

    raw = f"uploads/{body['user']['id']}/leaf.jpg"
    buf = io.BytesIO()
    Image.new("RGB", (3000, 2000), (60, 120, 50)).save(buf, "JPEG")
    bucket[raw] = buf.getvalue()
    r = client.post("/api/v1/health-checks", headers=headers, json={"photo_key": raw, "symptoms": ["white_cotton"]}).json()
    assert r["status"] == "queued" and r["photo_url"] and r["result"]["method"] == "symptoms"  # có kết quả tạm trong lúc chờ AI
    assert sent[-1] == ("bonsai_worker.tasks.assist.health", r["id"]) and raw not in bucket
    assert client.get(f"/api/v1/health-checks/{r['id']}", headers=headers).json()["status"] == "queued"
    other, _ = login("other@example.com")
    assert client.get(f"/api/v1/health-checks/{r['id']}", headers=other).status_code == 404

    # chế độ trợ lý = tra bảng → không gửi worker
    admin = _admin(db, client, login)
    assert client.put("/api/v1/admin/settings", headers=admin, json={"assist_mode": "offline"}).json()["assist_mode"] == "offline"
    bucket[raw] = buf.getvalue()
    r = client.post("/api/v1/health-checks", headers=headers, json={"photo_key": raw, "symptoms": ["burnt_edges"]}).json()
    assert r["status"] == "done" and len(sent) == 1
    for _ in range(2):
        client.post("/api/v1/health-checks", headers=headers, json={"symptoms": ["burnt_edges"]})
    assert client.post("/api/v1/health-checks", headers=headers, json={"symptoms": ["burnt_edges"]}).status_code == 429  # 5 / ngày
    assert len(client.get("/api/v1/me/health-checks", headers=headers).json()) == 5


def test_assistant_questions(db, client, login, monkeypatch):
    sent = []
    monkeypatch.setattr("bonsai_api.queue.enqueue", lambda *a, **kw: sent.append(a) or True)
    headers, _ = login()
    r = client.post("/api/v1/assistant/questions", headers=headers, json={"question": "Khi nào nên tuốt lá?"}).json()
    assert r["status"] == "queued" and r["answer"]["method"] == "offline" and sent[-1][0] == "bonsai_worker.tasks.assist.question"
    assert client.get(f"/api/v1/assistant/questions/{r['id']}", headers=headers).json()["question"] == "Khi nào nên tuốt lá?"
    assert client.post("/api/v1/assistant/questions", headers=headers, json={"question": "a"}).status_code == 422
    assert client.post("/api/v1/assistant/questions", headers=headers, json={"question": "tưới?", "tree_id": str(uuid.uuid4())}).status_code == 404


def test_weather_endpoint(client, monkeypatch):
    from bonsai_api.routers import assist

    assist._CACHE.clear()
    calls = []
    daily = {"time": ["2026-10-26"], "temperature_2m_max": [38], "temperature_2m_min": [26], "precipitation_sum": [0], "wind_speed_10m_max": [12]}
    monkeypatch.setattr("bonsai_pipeline.weather.fetch", lambda lat, lon, client=None, days=3: calls.append((lat, lon)) or daily)
    w = client.get("/api/v1/tools/weather?province=can_tho").json()
    assert w["province_vi"] == "Cần Thơ" and [a["kind"] for a in w["alerts"]] == ["heat"] and w["days"][0]["max_c"] == 38
    client.get("/api/v1/tools/weather?province=can_tho")
    assert len(calls) == 1  # lưu đệm 1 giờ
    assert client.get("/api/v1/tools/weather?province=sai_gon").status_code == 400

    def boom(*a, **k):
        raise RuntimeError("down")

    monkeypatch.setattr("bonsai_pipeline.weather.fetch", boom)
    assert client.get("/api/v1/tools/weather?province=hue").status_code == 503
