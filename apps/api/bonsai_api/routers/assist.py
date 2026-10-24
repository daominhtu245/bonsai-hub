"""Trợ lý chăm cây (docs/ideas.md E2, E3, E4): đoán sâu bệnh qua ảnh lá, hỏi đáp bằng giọng nói / chữ, thời tiết.

Trả lời tra bảng có ngay (miễn phí); nếu chế độ trợ lý = AI thì worker gọi model rồi cập nhật (api không giữ khóa AI).
Giới hạn mỗi ngày ở Cấu hình vận hành.
"""

from __future__ import annotations

import time
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from bonsai_pipeline import health, qa, weather
from bonsai_pipeline.preprocess import InvalidImageError, prepare_upload

from .. import queue, storage
from ..db.models import AssistantQuestion, HealthCheck, Tree
from ..security import DB, CurrentUser
from ..services.ops import get_ops
from ..services.provinces import PROVINCES
from ..services.settings import get_setting
from .uploads import upload_prefix

router = APIRouter(tags=["assist"])


def _today_count(db, model, user_id) -> int:
    since = datetime.now(UTC) - timedelta(days=1)
    return db.execute(select(func.count()).select_from(model).where(model.user_id == user_id, model.created_at >= since)).scalar_one()


def _own_tree(db, tree_id: uuid.UUID | None, user) -> Tree | None:
    if tree_id is None:
        return None
    tree = db.get(Tree, tree_id)
    if tree is None or tree.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy cây.")
    return tree


# ---------- E3: đoán sâu bệnh ----------


@router.get("/tools/health/symptoms")
def symptoms():
    return health.symptoms()


class HealthIn(BaseModel):
    photo_key: str | None = None
    symptoms: list[str] = Field(default_factory=list, max_length=13)
    tree_id: uuid.UUID | None = None


def _health_out(h: HealthCheck) -> dict:
    return {"id": str(h.id), "status": h.status, "symptoms": h.symptoms, "result": h.result, "created_at": h.created_at.isoformat(),
            "photo_url": storage.presign_get(h.photo_key) if h.photo_key else None}


@router.post("/health-checks", status_code=status.HTTP_201_CREATED)
def create_health(body: HealthIn, db: DB, user: CurrentUser):
    codes = {s["code"] for s in health.symptoms()}
    if not set(body.symptoms) <= codes:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Dấu hiệu không hợp lệ.")
    if not body.photo_key and not body.symptoms:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Chụp ảnh lá hoặc chọn ít nhất một dấu hiệu.")
    _own_tree(db, body.tree_id, user)
    if _today_count(db, HealthCheck, user.id) >= int(get_ops(db).get("health_daily_free") or 0):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Hôm nay bạn đã đoán bệnh đủ số lần. Mai thử lại nhé.")
    h = HealthCheck(id=uuid.uuid4(), user_id=user.id, tree_id=body.tree_id, symptoms=body.symptoms, photo_key="")
    if body.photo_key:
        if not body.photo_key.startswith(upload_prefix(user.id)):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Ảnh không hợp lệ.")
        try:
            img = prepare_upload(storage.get_bytes(body.photo_key))
        except InvalidImageError as e:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Ảnh không đọc được.") from e
        h.photo_key = f"health/{user.id}/{h.id}.webp"
        storage.put_bytes(h.photo_key, img.data, img.media_type)
        try:
            storage.delete(body.photo_key)
        except Exception:  # noqa: BLE001
            pass
    h.result = health.from_symptoms(body.symptoms) if body.symptoms else None
    use_ai = bool(h.photo_key) and get_setting(db, "assist_mode") == "ai"
    h.status = "queued" if use_ai else "done"
    db.add(h)
    db.commit()
    if use_ai and not queue.enqueue("bonsai_worker.tasks.assist.health", str(h.id)):
        h.status = "done"
        db.commit()
    return _health_out(h)


@router.get("/health-checks/{check_id}")
def get_health(check_id: uuid.UUID, db: DB, user: CurrentUser):
    h = db.get(HealthCheck, check_id)
    if h is None or h.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy.")
    return _health_out(h)


@router.get("/me/health-checks")
def my_health(db: DB, user: CurrentUser):
    rows = db.execute(select(HealthCheck).where(HealthCheck.user_id == user.id).order_by(HealthCheck.created_at.desc()).limit(30)).scalars()
    return [_health_out(h) for h in rows]


# ---------- E4: hỏi đáp ----------


class QuestionIn(BaseModel):
    question: str = Field(min_length=3, max_length=500)
    tree_id: uuid.UUID | None = None


def _q_out(q: AssistantQuestion) -> dict:
    return {"id": str(q.id), "question": q.question, "status": q.status, "answer": q.answer, "created_at": q.created_at.isoformat()}


@router.post("/assistant/questions", status_code=status.HTTP_201_CREATED)
def ask(body: QuestionIn, db: DB, user: CurrentUser):
    tree = _own_tree(db, body.tree_id, user)
    q = AssistantQuestion(id=uuid.uuid4(), user_id=user.id, tree_id=body.tree_id, question=body.question.strip())
    q.answer = qa.offline_answer(q.question, tree.species_key if tree else None)
    over = _today_count(db, AssistantQuestion, user.id) >= int(get_ops(db).get("assistant_daily_ai") or 0)
    use_ai = get_setting(db, "assist_mode") == "ai" and not over
    q.status = "queued" if use_ai else "done"
    db.add(q)
    db.commit()
    if use_ai and not queue.enqueue("bonsai_worker.tasks.assist.question", str(q.id)):
        q.status = "done"
        db.commit()
    return _q_out(q)


@router.get("/assistant/questions/{question_id}")
def get_question(question_id: uuid.UUID, db: DB, user: CurrentUser):
    q = db.get(AssistantQuestion, question_id)
    if q is None or q.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy.")
    return _q_out(q)


# ---------- E2: thời tiết ----------

_CACHE: dict[str, tuple[float, dict]] = {}
CACHE_S = 3600


def forecast(province: str) -> dict:
    hit = _CACHE.get(province)
    if hit and time.monotonic() - hit[0] < CACHE_S:
        return hit[1]
    name, _, lat, lon = PROVINCES[province]
    daily = weather.fetch(lat, lon)
    out = {"province": province, "province_vi": name, "days": weather.summary(daily), "alerts": weather.as_dicts(weather.alerts(daily))}
    _CACHE[province] = (time.monotonic(), out)
    return out


@router.get("/tools/weather")
def get_weather(province: str = Query(max_length=32)):
    if province not in PROVINCES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Tỉnh, thành không hợp lệ.")
    try:
        return forecast(province)
    except Exception as e:  # noqa: BLE001 — dịch vụ thời tiết lỗi: báo nhẹ, không làm hỏng trang
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Chưa lấy được dự báo thời tiết, thử lại sau.") from e
