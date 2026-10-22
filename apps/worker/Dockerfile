# Build context: gốc repo.
FROM python:3.12-slim
LABEL bonsai.project=bonsai
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /app
RUN useradd --create-home --uid 10001 app

COPY packages/pipeline /app/packages/pipeline
COPY apps/api /app/apps/api
COPY apps/worker /app/apps/worker
RUN pip install "/app/packages/pipeline[all]" /app/apps/api /app/apps/worker

USER app
CMD ["celery", "-A", "bonsai_worker.celery_app", "worker", "-Q", "celery,render", "--loglevel=INFO", "--concurrency=4"]
