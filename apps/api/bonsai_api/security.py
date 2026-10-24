from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .db.models import User, UserRole
from .db.session import get_db
from .settings import get_settings

_bearer = HTTPBearer(auto_error=False)


def create_access_token(user_id: uuid.UUID) -> str:
    s = get_settings()
    now = datetime.now(UTC)
    payload = {"sub": str(user_id), "iat": now, "exp": now + timedelta(hours=s.jwt_ttl_hours), "typ": "access"}
    return jwt.encode(payload, s.jwt_secret, algorithm=s.jwt_algorithm)


def decode_access_token(token: str) -> uuid.UUID:
    s = get_settings()
    try:
        payload = jwt.decode(token, s.jwt_secret, algorithms=[s.jwt_algorithm], options={"require": ["exp", "sub"]})
        if payload.get("typ") != "access":
            raise jwt.InvalidTokenError("wrong token type")
        return uuid.UUID(payload["sub"])
    except (jwt.InvalidTokenError, ValueError) as e:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Phiên đăng nhập hết hạn, bạn đăng nhập lại nhé.") from e


def get_current_user(
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    db: Annotated[Session, Depends(get_db)],
) -> User:
    if creds is None or creds.scheme.lower() != "bearer":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Bạn cần đăng nhập.")
    user = db.get(User, decode_access_token(creds.credentials))
    if user is None or user.deleted_at is not None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Tài khoản không tồn tại hoặc đã bị xóa.")
    return user


def require_admin(user: Annotated[User, Depends(get_current_user)]) -> User:
    if user.role != UserRole.admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Chỉ quản trị viên.")
    return user


def require_artisan(user: Annotated[User, Depends(get_current_user)]) -> User:
    """Nghệ nhân (chấm ảnh, chỉnh bộ luật) — quản trị viên cũng vào được."""
    if user.role not in (UserRole.artisan, UserRole.admin):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Chỉ nghệ nhân hoặc quản trị viên.")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
DB = Annotated[Session, Depends(get_db)]


def get_optional_user(
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    db: Annotated[Session, Depends(get_db)],
) -> User | None:
    """Trang công khai: có token hợp lệ thì trả người dùng, không thì None (không báo lỗi)."""
    if creds is None or creds.scheme.lower() != "bearer":
        return None
    try:
        user = db.get(User, decode_access_token(creds.credentials))
    except HTTPException:
        return None
    return user if user is not None and user.deleted_at is None else None


OptionalUser = Annotated[User | None, Depends(get_optional_user)]
