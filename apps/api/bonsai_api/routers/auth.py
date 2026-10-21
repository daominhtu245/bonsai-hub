from fastapi import APIRouter, HTTPException, status

from ..auth.google import verify_google_id_token
from ..auth.identity import ExternalIdentity, IdentityError
from ..auth.zalo import exchange_zalo_code
from ..schemas import DevLogin, GoogleLogin, TokenOut, UserOut, ZaloLogin
from ..security import DB, create_access_token
from ..services.users import get_or_create_user
from ..settings import get_settings

router = APIRouter(prefix="/auth", tags=["auth"])


def _issue(db, ident: ExternalIdentity) -> TokenOut:
    user, created = get_or_create_user(db, ident)
    return TokenOut(access_token=create_access_token(user.id), user=UserOut.model_validate(user), is_new=created)


@router.post("/google", response_model=TokenOut)
def login_google(body: GoogleLogin, db: DB):
    s = get_settings()
    if not s.google_client_id:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Đăng nhập Google chưa được cấu hình.")
    try:
        ident = verify_google_id_token(body.id_token, s.google_client_id)
    except IdentityError as e:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Không xác thực được tài khoản Google.") from e
    return _issue(db, ident)


@router.post("/zalo", response_model=TokenOut)
def login_zalo(body: ZaloLogin, db: DB):
    s = get_settings()
    if not (s.zalo_app_id and s.zalo_app_secret):
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Đăng nhập Zalo chưa được cấu hình.")
    try:
        ident = exchange_zalo_code(body.code, body.code_verifier, app_id=s.zalo_app_id, app_secret=s.zalo_app_secret)
    except IdentityError as e:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Không xác thực được tài khoản Zalo.") from e
    return _issue(db, ident)


@router.post("/dev", response_model=TokenOut, include_in_schema=False)
def login_dev(body: DevLogin, db: DB):
    """Chỉ dùng khi APP_ENV=dev để chạy local và test."""
    if not get_settings().is_dev:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    return _issue(db, ExternalIdentity("dev", body.email, email=body.email, name=body.name))
