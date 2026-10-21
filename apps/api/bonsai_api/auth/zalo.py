"""Zalo Social API v4 — luồng OAuth có PKCE: web gửi `code` + `code_verifier`, server đổi lấy access token."""

import httpx

from .identity import ExternalIdentity, IdentityError

TOKEN_URL = "https://oauth.zaloapp.com/v4/access_token"
ME_URL = "https://graph.zalo.me/v2.0/me"


def exchange_zalo_code(code: str, code_verifier: str, *, app_id: str, app_secret: str,
                       client: httpx.Client | None = None) -> ExternalIdentity:
    http = client or httpx.Client(timeout=10)
    try:
        r = http.post(
            TOKEN_URL,
            headers={"secret_key": app_secret},
            data={"app_id": app_id, "code": code, "code_verifier": code_verifier, "grant_type": "authorization_code"},
        )
        token = r.json() if r.status_code == 200 else {}
        access_token = token.get("access_token")
        if not access_token:
            raise IdentityError(f"Zalo từ chối mã đăng nhập: {token.get('error_name') or r.status_code}")
        me = http.get(ME_URL, headers={"access_token": access_token}, params={"fields": "id,name,picture"}).json()
    except httpx.HTTPError as e:
        raise IdentityError("Không kết nối được Zalo") from e
    finally:
        if client is None:
            http.close()
    if not me.get("id"):
        raise IdentityError(f"Zalo không trả thông tin người dùng: {me.get('message')}")
    picture = (me.get("picture") or {}).get("data", {}).get("url")
    return ExternalIdentity("zalo", str(me["id"]), name=me.get("name"), avatar_url=picture)
