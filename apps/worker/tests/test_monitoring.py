import json
import uuid
from datetime import UTC, datetime
from decimal import Decimal

import httpx

from bonsai_api.db.models import DesignJob, JobStatus, PipelineStep, Tree, User
from bonsai_worker.tasks import monitoring


def _jobs(db, login, statuses):
    _, body = login()
    user = db.get(User, uuid.UUID(body["user"]["id"]))
    tree = Tree(user_id=user.id)
    db.add(tree)
    db.flush()
    for st, code in statuses:
        db.add(DesignJob(tree_id=tree.id, user_id=user.id, status=st, error_code=code))
    db.commit()


def test_alerts_error_rate_cost_queue(db, login):
    _jobs(db, login, [(JobStatus.failed, "ai_unavailable")] * 2 + [(JobStatus.done, None)] * 4
          + [(JobStatus.failed, "unusable_photo")] * 3)
    db.add(PipelineStep(step_code="P3a", provider="g", model="m", cost_usd=Decimal("25.5"), latency_ms=1, ok=True))
    db.commit()
    alerts = monitoring.collect_alerts(db, queue_len=60, now=datetime.now(UTC), daily_budget=20)
    assert set(alerts) == {"error_rate", "daily_cost", "queue"}
    assert "2/9" in alerts["error_rate"] and "$25.50" in alerts["daily_cost"]


def test_no_alert_when_few_jobs(db, login):
    _jobs(db, login, [(JobStatus.failed, "ai_unavailable")] * 2)
    assert monitoring.collect_alerts(db, queue_len=0, now=datetime.now(UTC), daily_budget=20) == {}


def test_send_telegram(monkeypatch):
    sent = []

    def handler(req: httpx.Request):
        sent.append((str(req.url), json.loads(req.content)))
        return httpx.Response(200, json={"ok": True})

    assert monitoring.send_telegram("x") is False  # chưa cấu hình
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "123:abc")
    monkeypatch.setenv("TELEGRAM_CHAT_ID", "-100")
    assert monitoring.send_telegram("Lỗi cao", client=httpx.Client(transport=httpx.MockTransport(handler)))
    assert sent == [("https://api.telegram.org/bot123:abc/sendMessage", {"chat_id": "-100", "text": "Lỗi cao"})]


def test_check_dedupes_per_hour(db, login, monkeypatch):
    class FakeRedis:
        keys: set = set()

        def llen(self, q):
            return 40

        def set(self, k, v, nx, ex):
            if k in self.keys:
                return False
            self.keys.add(k)
            return True

    monkeypatch.setattr(monitoring.redis.Redis, "from_url", staticmethod(lambda url: FakeRedis()))
    sent = []
    monkeypatch.setattr(monitoring, "send_telegram", lambda text: sent.append(text) or True)
    first = monitoring.check.run()
    assert first == {"alerts": ["queue"], "sent": ["queue"], "queue": 80}
    assert monitoring.check.run()["sent"] == [] and len(sent) == 1
