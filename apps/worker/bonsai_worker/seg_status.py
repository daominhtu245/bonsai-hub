"""Báo cho api biết cấu hình worker (trang admin → Hệ thống, Chế độ AI): có model YOLO-seg / SAM không,
nhà cung cấp và model AI đang dùng, khóa nào đã có (chỉ true/false — không bao giờ gửi giá trị khóa)."""

import json
import logging
import os
import socket
from datetime import UTC, datetime

import redis

from bonsai_api.services.settings import SEG_MODEL_KEY
from bonsai_pipeline.config import get_ai_settings
from bonsai_pipeline.segmentation import get_segmenter

log = logging.getLogger(__name__)
WORKER_INFO_KEY = "bonsai:worker:info"  # đọc ở bonsai_api/routers/admin_system.py
TTL = 2 * 86400


def worker_info(seg_ready: bool) -> dict:
    s = get_ai_settings()
    return {
        "host": socket.gethostname(),
        "reported_at": datetime.now(UTC).isoformat(),
        "seg_model": seg_ready,
        "sam": bool(os.environ.get("SAM_WEIGHTS")),
        "llm": {"provider": s.llm_provider, "model": s.llm_model, "economy_model": s.llm_economy_model,
                "fallback": s.llm_fallback_provider or None, "effort": s.llm_effort},
        "image": {"provider": s.image_provider, "model": s.image_model, "fallback": s.image_fallback_provider or None},
        "keys": {"anthropic": bool(s.anthropic_api_key), "gemini": bool(s.gemini_api_key), "openai": bool(s.openai_api_key)},
    }


def report(ready: bool | None = None) -> None:
    if ready is None:
        ready = get_segmenter() is not None
    try:
        r = redis.Redis.from_url(os.environ.get("REDIS_URL", "redis://localhost:6379/0"), socket_timeout=0.5)
        r.set(SEG_MODEL_KEY, "1" if ready else "0", ex=TTL)
        r.set(WORKER_INFO_KEY, json.dumps(worker_info(ready)), ex=TTL)
    except redis.RedisError:
        log.warning("could not report worker status")
