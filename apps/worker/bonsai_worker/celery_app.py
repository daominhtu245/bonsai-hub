import os

from celery import Celery

app = Celery(
    "bonsai",
    broker=os.environ.get("REDIS_URL", "redis://localhost:6379/0"),
    backend=os.environ.get("REDIS_URL", "redis://localhost:6379/0"),
    include=["bonsai_worker.tasks"],
)
app.conf.update(
    task_acks_late=True,  # worker chết giữa chừng → job được giao lại
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=1,
    task_serializer="json",
    result_expires=3600,
    timezone="Asia/Ho_Chi_Minh",
    task_routes={"bonsai_worker.tasks.phase_b.*": {"queue": "render"}},
)
