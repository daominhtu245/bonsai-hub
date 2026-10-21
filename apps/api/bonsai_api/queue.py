"""Đẩy job sang worker qua Redis. Api chỉ gửi theo tên task, không import code worker."""

from __future__ import annotations

import logging
from functools import lru_cache

from celery import Celery

from .settings import get_settings

log = logging.getLogger(__name__)


@lru_cache
def _celery() -> Celery:
    return Celery("bonsai-api", broker=get_settings().redis_url)


def enqueue(task_name: str, *args, queue: str | None = None) -> bool:
    try:
        _celery().send_task(task_name, args=list(args), queue=queue)
        return True
    except Exception:  # Redis lỗi không được làm hỏng request; A0 chạy lại khi bắt đầu phiên A.
        log.exception("enqueue %s failed", task_name)
        return False
