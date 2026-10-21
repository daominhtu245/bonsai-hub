# Bonsai AI

PWA cho người chơi và nhà vườn bonsai: chụp phôi → phân tích → 2–3 phương án thế kèm bản vẽ → ảnh tương lai và lộ trình chăm theo giai đoạn.
Đọc trước: `CLAUDE.md`, `docs/architecture.md`, `docs/prompt_system.md`, `docs/ui-spec.md`.

## Cấu trúc
```
apps/web/            React + Vite + Tailwind PWA (token từ design/)
apps/api/            FastAPI: auth (Google/Zalo/JWT), uploads (R2 presign), trees, catalog; Alembic
apps/worker/         Celery: A0 chuẩn hóa ảnh; ghi pipeline_steps; tự hoàn lượt khi lỗi
packages/pipeline/   adapter AI (llm_client, image_client), A0 preprocess, rule set, từ điển, giá
packages/prompts/    template P1…P6 (seed vào prompt_versions)
infra/               docker-compose, nginx, backup Postgres → R2, cấu hình R2
```

## Chạy local
```bash
make setup          # venv Python 3.12 + npm install
make db-dev         # Postgres 16 ở cổng 55432
make test           # pipeline + api + worker + web

# API (cần Redis ở localhost:6379 để đẩy task)
export DATABASE_URL=postgresql+psycopg://bonsai:bonsai@localhost:55432/bonsai
make migrate seed
cd apps/api && ../../.venv/bin/uvicorn bonsai_api.main:app --port 8001 --reload
cd apps/web && npm run dev          # http://localhost:5173 (proxy /api → :8001)
```
Đăng nhập khi dev: `POST /api/v1/auth/dev {"email": "..."}` (chỉ khi `APP_ENV=dev`).
Thư viện component: http://localhost:5173/he-thong-thiet-ke

Toàn bộ stack: `cp .env.example .env`, điền khóa, rồi `make up` (web ở cổng `WEB_PORT`, mặc định 8080).

### Chạy thử khi chưa có key
- **Lưu trữ:** `COMPOSE_PROFILES=local-s3` bật S3 local (SeaweedFS, cổng 9000) thay R2; `s3-init` tự tạo bucket.
- **AI:** `LLM_PROVIDER=demo` trả kết quả P1/P2 **mẫu** (gắn chữ "Dữ liệu mẫu") để đi hết luồng giao diện. Chỉ chạy khi `APP_ENV=dev`.
- **Đăng nhập:** `VITE_DEV_LOGIN=true` hiện form "Vào bằng email thử" ở `/dang-nhap`.
- Phiên B (ảnh tương lai) làm ở tuần 3–4: hiện tại chọn phương án sẽ trừ lượt rồi tự hoàn lượt kèm thông báo.

## Luồng màn hình (đã có)
`/` Trang chủ → `/chup` Chụp 4 mặt → `/chup/thong-tin` Thông tin cây → `/phan-tich/:job` Đang phân tích (SSE)
→ `/chon/:job` Chọn thế (bản vẽ đè ảnh) → `/ket-qua/:job` chờ phiên B.

## YOLO-seg thân cây
Xem `packages/pipeline/tools/seg/README.md` (SAM gán nhãn → dataset → huấn luyện → `TRUNK_SEG_WEIGHTS`).
Chưa có trọng số thì A2 dùng số đo P1 (`cv_fallback`).

## Đổi nhà cung cấp AI
Chỉ sửa biến môi trường của `worker`: `LLM_PROVIDER/LLM_MODEL` (anthropic | gemini | fake), `IMAGE_PROVIDER/IMAGE_MODEL` (gemini | openai | fake) và các biến `*_FALLBACK_*`. Đơn giá để tính `cost_usd` ở `packages/pipeline/bonsai_pipeline/pricing.py`.

## Cài R2
- Bucket private; áp `infra/r2-lifecycle.json` (xóa ảnh thô `uploads/` sau 1 ngày) và `infra/r2-cors.json` (sửa domain).
- Backup: cron `infra/backup/pg_backup.sh` (giữ 14 bản).
