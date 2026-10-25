"""Giới hạn tần suất theo IP (cửa sổ cố định, Redis). Redis lỗi → cho qua (không chặn người dùng thật)."""

from __future__ import annotations

import logging
import time
from functools import lru_cache

import redis
from fastapi import HTTPException, Request, status

from .settings import get_settings

log = logging.getLogger(__name__)


@lru_cache
def _redis() -> redis.Redis:
    return redis.Redis.from_url(get_settings().redis_url, socket_timeout=0.5, socket_connect_timeout=0.5)


def client_ip(request: Request) -> str:
    # Chỉ tin CF-Connecting-IP khi chắc chắn đứng sau Cloudflare (TRUST_CLOUDFLARE), nếu không client tự giả được.
    # uvicorn --proxy-headers đã thay request.client bằng IP từ X-Forwarded-For do Nginx đặt.
    if get_settings().trust_cloudflare and (cf := request.headers.get("cf-connecting-ip")):
        return cf
    return request.client.host if request.client else "unknown"


def hit(key: str, limit: int, window_s: int) -> bool:
    """True nếu còn trong hạn mức."""
    bucket = f"rl:{key}:{int(time.time() // window_s)}"
    try:
        r = _redis()
        n = r.incr(bucket)
        if n == 1:
            r.expire(bucket, window_s)
        return n <= limit
    except redis.RedisError:
        log.warning("rate limiter unavailable; allowing request")
        return True


def per_ip(name: str, limit: int, window_s: int, message: str = "Bạn thao tác quá nhanh. Thử lại sau ít phút nhé.", *, staff_exempt: bool = False):
    """Dependency FastAPI: giới hạn `limit` lần mỗi `window_s` giây cho mỗi IP.
    `staff_exempt`: quản trị / nghệ nhân không bị giới hạn (chạy bộ đo chất lượng, kiểm thử)."""
    if not staff_exempt:
        def dep(request: Request) -> None:
            if not hit(f"{name}:{client_ip(request)}", limit, window_s):
                raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, message)

        return dep

    from fastapi import Depends

    from .db.models import UserRole
    from .security import get_optional_user

    def staff_dep(request: Request, user=Depends(get_optional_user)) -> None:  # noqa: B008
        if user is not None and user.role in (UserRole.admin, UserRole.artisan):
            return
        if not hit(f"{name}:{client_ip(request)}", limit, window_s):
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, message)

    return staff_dep
