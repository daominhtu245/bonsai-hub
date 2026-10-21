from google.auth.exceptions import GoogleAuthError
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token

from .identity import ExternalIdentity, IdentityError

_request = google_requests.Request()


def verify_google_id_token(token: str, client_id: str) -> ExternalIdentity:
    """Xác thực ID token từ Google Identity Services (nút "Đăng nhập bằng Google" trên web)."""
    try:
        info = id_token.verify_oauth2_token(token, _request, client_id)
    except (ValueError, GoogleAuthError) as e:
        raise IdentityError("Google token không hợp lệ") from e
    if info.get("iss") not in ("accounts.google.com", "https://accounts.google.com"):
        raise IdentityError("Google issuer không hợp lệ")
    email = info.get("email") if info.get("email_verified") else None
    return ExternalIdentity("google", info["sub"], email=email, name=info.get("name"), avatar_url=info.get("picture"))
