import httpx
import jwt
import pytest
from sqlalchemy import select

from bonsai_api.auth import google as google_mod
from bonsai_api.auth.identity import ExternalIdentity, IdentityError
from bonsai_api.auth.zalo import exchange_zalo_code
from bonsai_api.db.models import CreditLedger, CreditReason


def test_new_user_gets_trial_credit_once(client, login, db):
    headers, body = login()
    assert body["is_new"] and body["user"]["credits"] == 1
    _, again = login()
    assert not again["is_new"] and again["user"]["credits"] == 1
    rows = db.execute(select(CreditLedger)).scalars().all()
    assert [(r.delta, r.reason, r.ref_id) for r in rows] == [(1, CreditReason.gift, "trial")]
    me = client.get("/api/v1/me", headers=headers)
    assert me.status_code == 200 and me.json()["email"] == "nhavuon@example.com"


@pytest.mark.parametrize("header", [None, "Bearer nope", "Bearer " + jwt.encode({"sub": "x"}, "other", "HS256")])
def test_me_rejects_bad_tokens(client, header):
    r = client.get("/api/v1/me", headers={"Authorization": header} if header else {})
    assert r.status_code == 401


def test_google_login_and_email_merge(client, login, monkeypatch):
    _, dev = login("nguoichoi@example.com")

    def fake_verify(token, client_id):
        if token != "good-token-123":
            raise IdentityError("bad")
        return ExternalIdentity("google", "g-sub-1", email="nguoichoi@example.com", name="Người chơi")

    monkeypatch.setattr("bonsai_api.routers.auth.verify_google_id_token", fake_verify)
    r = client.post("/api/v1/auth/google", json={"id_token": "good-token-123"})
    assert r.status_code == 200
    assert r.json()["user"]["id"] == dev["user"]["id"] and not r.json()["is_new"]
    assert client.post("/api/v1/auth/google", json={"id_token": "bad-token-123"}).status_code == 401


def test_google_verifier_rejects_garbage():
    with pytest.raises(IdentityError):
        google_mod.verify_google_id_token("not-a-jwt", "client-id")


def test_zalo_code_exchange():
    def handler(req: httpx.Request):
        if req.url.host == "oauth.zaloapp.com":
            assert req.headers["secret_key"] == "secret"
            assert b"code_verifier=v" in req.content
            return httpx.Response(200, json={"access_token": "zat", "expires_in": "3600"})
        assert req.headers["access_token"] == "zat"
        return httpx.Response(200, json={"id": "8800", "name": "Chú Ba", "picture": {"data": {"url": "https://a/p.jpg"}}})

    http = httpx.Client(transport=httpx.MockTransport(handler))
    ident = exchange_zalo_code("c0de", "v" * 43, app_id="123", app_secret="secret", client=http)
    assert ident == ExternalIdentity("zalo", "8800", name="Chú Ba", avatar_url="https://a/p.jpg")


def test_zalo_rejected_code():
    http = httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(200, json={"error_name": "Invalid code"})))
    with pytest.raises(IdentityError):
        exchange_zalo_code("c0de", "v" * 43, app_id="123", app_secret="s", client=http)


def test_zalo_login_endpoint(client, monkeypatch):
    monkeypatch.setattr(
        "bonsai_api.routers.auth.exchange_zalo_code",
        lambda code, verifier, **kw: ExternalIdentity("zalo", "8800", name="Chú Ba"),
    )
    r = client.post("/api/v1/auth/zalo", json={"code": "abcd", "code_verifier": "v" * 43})
    assert r.status_code == 200 and r.json()["is_new"] and r.json()["user"]["credits"] == 1


def test_dev_login_disabled_outside_dev(client, monkeypatch):
    from bonsai_api.settings import get_settings

    monkeypatch.setattr(get_settings(), "app_env", "prod")
    assert client.post("/api/v1/auth/dev", json={"email": "a@b.c"}).status_code == 404
