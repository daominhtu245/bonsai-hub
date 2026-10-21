"""Phiên B (trả 1 lượt): P3a render S4 → P4 judge → P2b → S1–S3 → P6/P5.

Triển khai ở tuần 3–4. Hiện tại task thất bại có kiểm soát: job_guard đánh dấu `failed`
và tự hoàn lượt (credit_ledger reason=refund), giao diện báo "Đã hoàn lượt cho bạn".
"""

from __future__ import annotations

import logging
import uuid

from bonsai_api.db.session import get_sessionmaker

from ..celery_app import app
from ..recording import JobFailure, job_guard

log = logging.getLogger(__name__)


def run_phase_b(db, job_id: uuid.UUID) -> None:
    with job_guard(db, job_id):
        raise JobFailure("phase_b_not_ready", "phase B is scheduled for week 3")


@app.task(name="bonsai_worker.tasks.phase_b.run", acks_late=True)
def run(job_id: str) -> str:
    with get_sessionmaker()() as db:
        try:
            run_phase_b(db, uuid.UUID(job_id))
        except Exception:
            log.exception("phase B failed for %s", job_id)
            return "failed"
    return "done"
