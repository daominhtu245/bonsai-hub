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

# Tách nền trên máy trước khi phân tích (bonsai_pipeline/cutout.py): onnxruntime + ISNet (~176 MB file, ~0,8 GB RAM khi chạy).
# Tắt: WORKER_WITH_CUTOUT=false (phân tích gửi ảnh gốc như trước).
ARG WITH_CUTOUT=true
ARG CUTOUT_URL=https://github.com/danielgatis/rembg/releases/download/v0.0.0/isnet-general-use.onnx
ARG CUTOUT_SHA256=60920e99c45464f2ba57bee2ad08c919a52bbf852739e96947fbb4358c0d964a
RUN if [ "$WITH_CUTOUT" = "true" ]; then \
      pip install "onnxruntime>=1.18" "opencv-python-headless>=4.10" \
      && mkdir -p /opt/models \
      && python -c "import hashlib,sys,urllib.request; p='/opt/models/isnet-general-use.onnx'; urllib.request.urlretrieve(sys.argv[1], p); h=hashlib.sha256(open(p,'rb').read()).hexdigest(); assert h==sys.argv[2], h" "$CUTOUT_URL" "$CUTOUT_SHA256"; \
    fi

# 2) Mã nguồn của dự án (cài lại riêng 3 gói, không đụng thư viện).
COPY packages/pipeline /app/packages/pipeline
COPY apps/api /app/apps/api
COPY apps/worker /app/apps/worker
RUN pip install --no-deps --force-reinstall /app/packages/pipeline /app/apps/api /app/apps/worker

USER app
CMD ["celery", "-A", "bonsai_worker.celery_app", "worker", "-Q", "celery,render", "--loglevel=INFO", "--concurrency=4"]
