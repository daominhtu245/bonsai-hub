import json
import time
import uuid
from collections.abc import Iterator

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select

from .. import queue
from sqlalchemy.dialects.postgresql import insert

from ..db.models import DesignJob, DesignOption, Feedback, JobStatus, Stage, StageTaskCheck, Tree
from ..db.session import get_sessionmaker
from ..schemas import ChooseIn, FeedbackIn, JobCreate, JobOut, ResultFull, TaskToggle
from ..security import DB, CurrentUser
from ..services.credits import InsufficientCredits, spend_for_render
from ..services.jobs import STREAM_END, job_out, jobs_today
from ..services.results import result_full
from ..settings import get_settings

router = APIRouter(tags=["jobs"])

POLL_SECONDS = 1.0
HEARTBEAT_SECONDS = 15.0
STREAM_MAX_SECONDS = 15 * 60


def _own_job(db, job_id: uuid.UUID, user) -> DesignJob:
    job = db.get(DesignJob, job_id)
    if job is None or job.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy phiên thiết kế.")
    return job


@router.post("/trees/{tree_id}/jobs", response_model=JobOut, status_code=status.HTTP_202_ACCEPTED)
def create_job(tree_id: uuid.UUID, body: JobCreate, user: CurrentUser, db: DB):
    tree = db.get(Tree, tree_id)
    if tree is None or tree.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy cây.")
    if jobs_today(db, user) >= get_settings().phase_a_daily_limit:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS,
                            "Hôm nay bạn đã phân tích đủ số lần cho phép. Ngày mai bạn thử tiếp nhé.")
    job = DesignJob(tree_id=tree.id, user_id=user.id, status=JobStatus.queued,
                    inputs=body.model_dump(exclude_none=True), progress={})
    db.add(job)
    db.commit()
    queue.enqueue("bonsai_worker.tasks.phase_a.run", str(job.id))
    return job_out(db, job, user)


@router.get("/jobs/{job_id}", response_model=JobOut)
def get_job(job_id: uuid.UUID, user: CurrentUser, db: DB):
    return job_out(db, _own_job(db, job_id, user), user)


def _snapshot(job: DesignJob) -> dict:
    return {"status": job.status.value, "progress": job.progress or {}, "error_code": job.error_code}


def _event_stream(job_id: uuid.UUID) -> Iterator[str]:
    """Đọc trạng thái từ DB mỗi giây, chỉ gửi khi thay đổi; dừng ở trạng thái chờ người dùng / kết thúc."""
    started = last_beat = time.monotonic()
    last = None
    yield "retry: 3000\n\n"
    while time.monotonic() - started < STREAM_MAX_SECONDS:
        with get_sessionmaker()() as db:
            job = db.get(DesignJob, job_id)
            snap = _snapshot(job) if job else {"status": "failed", "progress": {}, "error_code": "not_found"}
        if snap != last:
            last = snap
            yield f"event: job\ndata: {json.dumps(snap, ensure_ascii=False)}\n\n"
            if snap["status"] in STREAM_END:
                return
        elif time.monotonic() - last_beat > HEARTBEAT_SECONDS:
            last_beat = time.monotonic()
            yield ": ping\n\n"
        time.sleep(POLL_SECONDS)


@router.get("/jobs/{job_id}/events")
def job_events(job_id: uuid.UUID, user: CurrentUser, db: DB):
    _own_job(db, job_id, user)
    return StreamingResponse(
        _event_stream(job_id),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/jobs/{job_id}/choose", response_model=JobOut)
def choose(job_id: uuid.UUID, body: ChooseIn, user: CurrentUser, db: DB):
    job = db.execute(select(DesignJob).where(DesignJob.id == job_id).with_for_update()).scalar_one_or_none()
    if job is None or job.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy phiên thiết kế.")
    if job.chosen_option_id == body.option_id and job.status != JobStatus.awaiting_choice:
        return job_out(db, job, user)  # bấm lại: không trừ lượt lần nữa
    if job.status != JobStatus.awaiting_choice:
        raise HTTPException(status.HTTP_409_CONFLICT, "Phiên này không còn ở bước chọn phương án.")
    option = db.get(DesignOption, body.option_id)
    if option is None or option.job_id != job.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Phương án không thuộc phiên này.")
    try:
        spend_for_render(db, user.id, job.id)
    except InsufficientCredits:
        db.rollback()
        raise HTTPException(status.HTTP_402_PAYMENT_REQUIRED, "Bạn đã hết lượt. Mua thêm lượt để tạo ảnh tương lai.")
    job.chosen_option_id = option.id
    job.status = JobStatus.rendering_final
    job.finished_at = None
    db.commit()
    db.refresh(user)
    queue.enqueue("bonsai_worker.tasks.phase_b.run", str(job.id), queue="render")
    return job_out(db, job, user)


def _done_job(db, job_id: uuid.UUID, user) -> DesignJob:
    job = _own_job(db, job_id, user)
    if job.status != JobStatus.done:
        raise HTTPException(status.HTTP_409_CONFLICT, "Kết quả chưa sẵn sàng.")
    return job


@router.get("/jobs/{job_id}/result", response_model=ResultFull)
def get_result(job_id: uuid.UUID, user: CurrentUser, db: DB):
    return result_full(db, _done_job(db, job_id, user), user)


@router.put("/jobs/{job_id}/tasks", status_code=status.HTTP_204_NO_CONTENT)
def toggle_task(job_id: uuid.UUID, body: TaskToggle, user: CurrentUser, db: DB):
    job = _done_job(db, job_id, user)
    stage = db.execute(select(Stage).where(Stage.job_id == job.id, Stage.code == body.stage_code)).scalar_one_or_none()
    actions = ((stage.guide_vi or {}).get("actions_vi") or []) if stage else []
    if body.task_index >= len(actions):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Không có việc này trong giai đoạn.")
    if body.done:
        db.execute(insert(StageTaskCheck).values(job_id=job.id, stage_code=body.stage_code, task_index=body.task_index)
                   .on_conflict_do_nothing(constraint="uq_stage_task_checks_task"))
    else:
        db.query(StageTaskCheck).filter_by(job_id=job.id, stage_code=body.stage_code, task_index=body.task_index).delete()
    db.commit()


@router.post("/jobs/{job_id}/feedback", status_code=status.HTTP_204_NO_CONTENT)
def feedback(job_id: uuid.UUID, body: FeedbackIn, user: CurrentUser, db: DB):
    job = _own_job(db, job_id, user)
    if job.status not in (JobStatus.done, JobStatus.awaiting_choice):
        raise HTTPException(status.HTTP_409_CONFLICT, "Chưa có bản thiết kế để đánh giá.")
    stmt = insert(Feedback).values(job_id=job.id, user_id=user.id, rating=body.rating, reason_tags=body.reason_tags,
                                   comment=body.comment)
    db.execute(stmt.on_conflict_do_update(constraint="uq_feedback_job_user",
                                          set_={"rating": stmt.excluded.rating, "reason_tags": stmt.excluded.reason_tags,
                                                "comment": stmt.excluded.comment}))
    db.commit()
