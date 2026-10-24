"""Báo cho api biết worker có trọng số YOLO-seg không (trang admin → Chế độ AI hiển thị)."""

import logging
import os

import redis

from bonsai_api.services.settings import SEG_MODEL_KEY
from bonsai_pipeline.segmentation import get_segmenter

log = logging.getLogger(__name__)


def report(ready: bool | None = None) -> None:
    if ready is None:
        ready = get_segmenter() is not None
    try:
        redis.Redis.from_url(os.environ.get("REDIS_URL", "redis://localhost:6379/0"), socket_timeout=0.5).set(
            SEG_MODEL_KEY, "1" if ready else "0", ex=2 * 86400)
    except redis.RedisError:
        log.warning("could not report seg model status")
