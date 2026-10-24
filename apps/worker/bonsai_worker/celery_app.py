import os

from celery import Celery
from celery.schedules import crontab

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
    beat_schedule={
        "monitoring-check": {"task": "bonsai_worker.tasks.monitoring.check", "schedule": crontab(minute="*/10")},
    },
)

if (dsn := os.environ.get("SENTRY_DSN", "")).startswith("http"):
    import sentry_sdk
    from sentry_sdk.integrations.celery import CeleryIntegration

    sentry_sdk.init(dsn=dsn, environment=os.environ.get("APP_ENV", "dev"), integrations=[CeleryIntegration()],
                    traces_sample_rate=0.05, send_default_pii=False)


from celery.signals import worker_ready  # noqa: E402


@worker_ready.connect
def _report_seg_model(**_):
    from .seg_status import report

    report()
