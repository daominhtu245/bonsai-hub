import redis

from bonsai_api import ratelimit

# Bản thật (fixture tự động trong testing.py tắt giới hạn cho các test khác).
REAL_HIT = ratelimit.hit


class FakeRedis:
    def __init__(self):
        self.d = {}

    def incr(self, k):
        self.d[k] = self.d.get(k, 0) + 1
        return self.d[k]

    def expire(self, k, s):
        pass


def test_fixed_window(monkeypatch):
    fake = FakeRedis()
    monkeypatch.setattr(ratelimit, "_redis", lambda: fake)
    assert [REAL_HIT("x:1.2.3.4", 2, 60) for _ in range(3)] == [True, True, False]
    assert REAL_HIT("x:5.6.7.8", 2, 60)  # IP khác không bị ảnh hưởng


def test_fail_open(monkeypatch):
    class Down:
        def incr(self, k):
            raise redis.ConnectionError("down")

    monkeypatch.setattr(ratelimit, "_redis", lambda: Down())
    assert REAL_HIT("x", 1, 60)


def test_dependency_blocks_with_429(client, monkeypatch):
    from bonsai_api.settings import get_settings

    monkeypatch.setattr(get_settings(), "trust_cloudflare", True)
    fake = FakeRedis()
    monkeypatch.setattr(ratelimit, "_redis", lambda: fake)
    monkeypatch.setattr(ratelimit, "hit", REAL_HIT)
    codes = [client.post("/api/v1/auth/dev", json={"email": f"u{i}@x.vn"}, headers={"CF-Connecting-IP": "9.9.9.9"}).status_code
             for i in range(32)]
    assert codes.count(429) == 2 and codes[:30] == [200] * 30



def test_cf_header_ignored_unless_trusted():
    from starlette.requests import Request

    req = Request({"type": "http", "headers": [(b"cf-connecting-ip", b"6.6.6.6")], "client": ("10.0.0.1", 1234)})
    assert ratelimit.client_ip(req) == "10.0.0.1"
