"""Trợ lý chăm cây (docs/ideas.md E2, E3, E4) ở worker — nơi duy nhất giữ khóa AI.

- health: ảnh lá + dấu hiệu → H1 (chỉ chọn mục trong bảng sâu bệnh). Lỗi AI → giữ kết quả tra bảng đã có.
- question: câu hỏi → Q1 (model rẻ). Lỗi AI → giữ câu trả lời tra bảng.
- weather_daily (6:30 hằng ngày): dự báo Open-Meteo theo tỉnh người dùng → báo mưa to / nắng nóng / rét / gió mạnh,
  mỗi (tỉnh, ngày, loại) chỉ báo một lần.
"""

from __future__ import annotations

import logging
import os
import uuid
from datetime import date

from sqlalchemy import select

from bonsai_api import storage
from bonsai_api.db.models import AssistantQuestion, DesignJob, HealthCheck, JobStatus, Species, Stage, Tree, User
from bonsai_api.db.session import get_sessionmaker
from bonsai_api.services.provinces import PROVINCES
from bonsai_pipeline import health as health_mod
from bonsai_pipeline import qa, weather
from bonsai_pipeline.adapters.base import AIError
from bonsai_pipeline.adapters.llm_client import get_llm_client

from ..celery_app import app
from ..prompts_repo import load_active_prompt
from ..recording import record_step
from ..rules_repo import active_rules
from .notify import Message, send_web_push

log = logging.getLogger(__name__)


def run_health(db, check_id: uuid.UUID, llm=None) -> None:
    h = db.get(HealthCheck, check_id)
    if h is None or h.status != "queued":
        return
    tree = db.get(Tree, h.tree_id) if h.tree_id else None
    sp = db.get(Species, tree.species_key) if tree and tree.species_key else None
    try:
        with active_rules(db):
            out, rec = health_mod.run_h1(llm or get_llm_client(economy=True), load_active_prompt(db, "H1"),
                                         storage.get_bytes(h.photo_key), list(h.symptoms or []), sp.name_vi if sp else None)
        record_step(db, None, rec, input_ref={"health_check": str(h.id)})
        if not out["usable"] and h.result:  # ảnh chưa dùng được: giữ kết quả theo dấu hiệu, kèm lý do
            out = {**h.result, "issue_vi": out.get("issue_vi"), "photo_unusable": True}
        h.result, h.status = out, "done"
    except AIError as e:
        log.warning("H1 failed for %s: %s", check_id, e)
        h.result = {**(h.result or {"findings": []}), "ai_failed": True}
        h.status = "done" if h.result.get("findings") else "failed"
    db.commit()


def _tree_context(db, tree: Tree | None) -> dict:
    if tree is None:
        return {}
    job = db.execute(select(DesignJob).where(DesignJob.tree_id == tree.id, DesignJob.status == JobStatus.done)
                     .order_by(DesignJob.created_at.desc())).scalars().first()
    if job is None:
        return {"nickname": tree.nickname}
    stages = {s.code: s for s in db.execute(select(Stage).where(Stage.job_id == job.id)).scalars()}
    return {"nickname": tree.nickname, "years": ((job.progress or {}).get("result") or {}).get("years"),
            "stages": {c: (s.guide_vi or {}).get("actions_vi") for c, s in stages.items() if s.guide_vi}}


def run_question(db, question_id: uuid.UUID, llm=None) -> None:
    q = db.get(AssistantQuestion, question_id)
    if q is None or q.status != "queued":
        return
    tree = db.get(Tree, q.tree_id) if q.tree_id else None
    try:
        with active_rules(db):
            out, rec = qa.run_q1(llm or get_llm_client(economy=True), load_active_prompt(db, "Q1"), q.question,
                                 tree.species_key if tree else None, _tree_context(db, tree))
        record_step(db, None, rec, input_ref={"assistant_question": str(q.id)})
        q.answer = out
    except AIError as e:
        log.warning("Q1 failed for %s: %s", question_id, e)
        q.answer = {**(q.answer or {}), "ai_failed": True}
    q.status = "done"
    db.commit()


def run_weather_daily(db, r, http=None, today: date | None = None) -> int:
    """Trả số thông báo đã gửi. `r`: Redis (khóa chống gửi trùng), `http`: httpx.Client (test truyền giả)."""
    from bonsai_api.services.features import is_staff, load

    cfg = load(db)
    state = cfg["flags"]["weather"]
    if state == "off":
        return 0
    base = os.environ.get("PUBLIC_BASE_URL", "http://localhost:8080").rstrip("/")
    with_trees = select(Tree.user_id).distinct()
    users = db.execute(select(User).where(User.province.is_not(None), User.deleted_at.is_(None), User.id.in_(with_trees))).scalars().all()
    by_province: dict[str, list[User]] = {}
    for u in users:
        if state == "staff" and not is_staff(u, cfg["testers"]):
            continue
        if u.province in PROVINCES:
            by_province.setdefault(u.province, []).append(u)
    sent = 0
    for prov, people in by_province.items():
        _, _, lat, lon = PROVINCES[prov]
        try:
            daily = weather.fetch(lat, lon, client=http)
        except Exception:  # noqa: BLE001 — dịch vụ thời tiết lỗi: bỏ qua tỉnh này hôm nay
            log.exception("weather fetch failed for %s", prov)
            continue
        with active_rules(db):
            alerts = weather.alerts(daily)
        for a in alerts:
            if today and a.date < today.isoformat():
                continue
            if not r.set(f"bonsai:weather:{prov}:{a.date}:{a.kind}", "1", nx=True, ex=4 * 86400):
                continue  # đã báo
            when = "Hôm nay" if today and a.date == today.isoformat() else f"Ngày {a.date[8:10]}/{a.date[5:7]}"
            msg = Message(f"weather_{a.kind}", f"{a.title_vi} · {PROVINCES[prov][0]}", f"{when}: {a.advice_vi}", "/vuon")
            for u in people:
                sent += send_web_push(db, u.id, msg, base)
        db.commit()
    return sent


@app.task(name="bonsai_worker.tasks.assist.health")
def health(check_id: str) -> str:
    with get_sessionmaker()() as db:
        run_health(db, uuid.UUID(check_id))
    return "ok"


@app.task(name="bonsai_worker.tasks.assist.question")
def question(question_id: str) -> str:
    with get_sessionmaker()() as db:
        run_question(db, uuid.UUID(question_id))
    return "ok"


@app.task(name="bonsai_worker.tasks.assist.weather_daily")
def weather_daily() -> int:
    import redis

    from datetime import datetime
    from zoneinfo import ZoneInfo

    r = redis.Redis.from_url(os.environ.get("REDIS_URL", "redis://localhost:6379/0"))
    with get_sessionmaker()() as db:
        return run_weather_daily(db, r, today=datetime.now(ZoneInfo("Asia/Ho_Chi_Minh")).date())
