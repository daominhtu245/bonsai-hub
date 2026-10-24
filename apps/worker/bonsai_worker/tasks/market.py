"""Chợ phôi: tin đăng mới có ảnh → so "dấu vân thân" với cây đang báo mất (docs/ideas.md F7).

Khớp thì báo chủ cây (Web Push, mở trang tin để tự xem) và báo quản trị (Telegram). Không tự gỡ tin: chỉ là gợi ý.
"""

from __future__ import annotations

import logging
import os
import uuid

from bonsai_api import storage
from bonsai_api.db.models import Listing
from bonsai_api.db.session import get_sessionmaker
from bonsai_api.services.stolen import stolen_matches

from ..celery_app import app
from .notify import Message, send_web_push

log = logging.getLogger(__name__)


def run_listing_created(db, listing_id: uuid.UUID) -> list[uuid.UUID]:
    x = db.get(Listing, listing_id)
    if x is None or not x.photo_key:
        return []
    trees = stolen_matches(db, storage.get_bytes(x.photo_key), exclude_user=x.user_id)
    base = os.environ.get("PUBLIC_BASE_URL", "http://localhost:8080").rstrip("/")
    for tree in trees:
        msg = Message("stolen_match", "Có tin đăng giống cây bạn báo mất",
                      f"Tin \"{x.title}\" có thể là cây của bạn. Mở để xem và đối chiếu.", f"/tin/{x.code}")
        send_web_push(db, tree.user_id, msg, base)
    if trees:
        from .monitoring import send_telegram

        send_telegram(f"⚠️ Tin {x.code} ({x.title}) giống {len(trees)} cây đang báo mất: " + ", ".join(t.passport_code or str(t.id) for t in trees))
        db.commit()
    return [t.id for t in trees]


@app.task(name="bonsai_worker.tasks.market.listing_created")
def listing_created(listing_id: str) -> int:
    with get_sessionmaker()() as db:
        return len(run_listing_created(db, uuid.UUID(listing_id)))
