"""Ghi `pipeline_steps` và quản lý trạng thái job + hoàn lượt khi lỗi."""

from __future__ import annotations

import logging
import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from bonsai_api.db.models import DesignJob, JobStatus, PipelineStep, Tree
from bonsai_api.services.credits import refund_render
from bonsai_pipeline.steps import StepRecord

log = logging.getLogger(__name__)


def record_step(db: Session, job_id: uuid.UUID | None, rec: StepRecord, input_ref: dict | None = None) -> PipelineStep:
    row = PipelineStep(
        job_id=job_id,
        step_code=rec.step_code,
        provider=rec.provider,
        model=rec.model,
        prompt_version=rec.prompt_version,
        input_ref=input_ref,
        output=rec.output,
        tokens_in=rec.tokens_in,
        tokens_out=rec.tokens_out,
        images_out=rec.images_out,
        cost_usd=rec.cost_usd,
        latency_ms=rec.latency_ms,
        ok=rec.ok,
        error=rec.error,
    )
    db.add(row)
    db.commit()
    return row


def set_status(db: Session, job: DesignJob, status: JobStatus) -> None:
    job.status = status
    if status != JobStatus.queued and job.started_at is None:
        job.started_at = datetime.now(UTC)
    if status in (JobStatus.done, JobStatus.failed, JobStatus.awaiting_choice):
        job.finished_at = datetime.now(UTC)
    db.commit()


@contextmanager
def job_guard(db: Session, job_id: uuid.UUID) -> Iterator[DesignJob]:
    """Bọc một phiên pipeline: lỗi bất kỳ → job `failed`, hoàn lượt nếu đã trừ (ghi ledger reason=refund)."""
    job = db.get(DesignJob, job_id)
    if job is None:
        raise LookupError(f"job {job_id} not found")
    try:
        yield job
    except Exception as e:
        db.rollback()
        job = db.get(DesignJob, job_id)
        job.error = f"{type(e).__name__}: {e}"[:2000]
        tree = db.get(Tree, job.tree_id)
        refunded = refund_render(db, tree.user_id, job.id)
        set_status(db, job, JobStatus.failed)  # commit cả refund
        log.exception("job %s failed (refunded=%s)", job_id, refunded)
        raise
