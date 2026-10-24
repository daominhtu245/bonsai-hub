# Build context: gốc repo.
FROM python:3.12-slim
LABEL bonsai.project=bonsai
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /app
RUN useradd --create-home --uid 10001 app

# 1) Thư viện bên thứ ba: chỉ phụ thuộc pyproject.toml → lớp này được cache khi chỉ sửa code.
COPY packages/pipeline/pyproject.toml /app/packages/pipeline/pyproject.toml
COPY apps/api/pyproject.toml /app/apps/api/pyproject.toml
COPY apps/worker/pyproject.toml /app/apps/worker/pyproject.toml
RUN for p in packages/pipeline/bonsai_pipeline apps/api/bonsai_api apps/worker/bonsai_worker; do mkdir -p /app/$p && touch /app/$p/__init__.py; done \
    && pip install "/app/packages/pipeline[all]" /app/apps/api /app/apps/worker
# YOLO-seg (model riêng cho phân tích phôi) cần ultralytics + torch CPU (~1 GB). Chỉ bật khi đã có trọng số:
#   WORKER_WITH_CV=true trong .env → make up. Không bật thì phân tích dùng API (chế độ hybrid tự chuyển).
ARG WITH_CV=false
RUN if [ "$WITH_CV" = "true" ]; then \
      pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu \
      && pip install "ultralytics>=8.3" "opencv-python-headless>=4.10"; \
    fi

# 2) Mã nguồn của dự án (cài lại riêng 3 gói, không đụng thư viện).
COPY packages/pipeline /app/packages/pipeline
COPY apps/api /app/apps/api
COPY apps/worker /app/apps/worker
RUN pip install --no-deps --force-reinstall /app/packages/pipeline /app/apps/api /app/apps/worker

USER app
CMD ["celery", "-A", "bonsai_worker.celery_app", "worker", "-Q", "celery,render", "--loglevel=INFO", "--concurrency=4"]
