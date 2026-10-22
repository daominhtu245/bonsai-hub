# Build context: gốc repo (cần packages/pipeline và packages/prompts).
FROM python:3.12-slim AS base
LABEL bonsai.project=bonsai
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /app
RUN useradd --create-home --uid 10001 app

# 1) Thư viện bên thứ ba (cache theo pyproject.toml).
COPY packages/pipeline/pyproject.toml /app/packages/pipeline/pyproject.toml
COPY apps/api/pyproject.toml /app/apps/api/pyproject.toml
RUN for p in packages/pipeline/bonsai_pipeline apps/api/bonsai_api; do mkdir -p /app/$p && touch /app/$p/__init__.py; done \
    && pip install /app/packages/pipeline /app/apps/api

# 2) Mã nguồn.
COPY packages/pipeline /app/packages/pipeline
COPY apps/api /app/apps/api
RUN pip install --no-deps --force-reinstall /app/packages/pipeline /app/apps/api
COPY packages/prompts /app/packages/prompts
ENV PROMPTS_DIR=/app/packages/prompts

WORKDIR /app/apps/api
USER app
EXPOSE 8000
CMD ["sh", "-c", "alembic upgrade head && python -m bonsai_api.scripts.seed && exec uvicorn bonsai_api.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips='*'"]
