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

## Màn hình
| Đường dẫn | Màn | Ghi chú |
|---|---|---|
| `/` | 01 Trang chủ | |
| `/chup`, `/chup/thong-tin` | 02 Chụp ảnh, 03 Thông tin cây | |
| `/phan-tich/:job` | 04 Đang phân tích | SSE |
| `/chon/:job` | 05 Chọn thế | bản vẽ đè ảnh; trừ 1 lượt |
| `/ket-qua/:job` | 06 Kết quả + lộ trình | tiến độ phiên B, timeline S0–S4, việc cần làm, phản hồi |
| `/chia-se/:job`, `/s/:code` | 07 Chia sẻ | ảnh 9:16/1:1 ghép phía server; trang công khai có thẻ OG |
| `/vuon` | 08 Vườn của tôi | |
| `/mua-luot`, `/tai-khoan` | 09 Mua lượt, tài khoản | VietQR + webhook SePay/Casso |
| `/admin` | Quản trị | chi phí, prompt, job lỗi (`ADMIN_EMAILS`) |

## Thanh toán
`POST /payments` tạo đơn + mã chuyển khoản `BONSAI XXXXX` + ảnh VietQR. Ngân hàng báo về `POST /api/v1/webhooks/bank`
(SePay: `Authorization: Apikey …`; Casso: `Secure-Token: …`), khớp mã trong nội dung, cộng lượt một lần duy nhất
(`payments.provider_txn_id` unique + `credit_ledger` unique theo đơn). Gói nhà vườn tự nâng vai trò `nursery`.

## Giám sát & triển khai
- Sentry (`SENTRY_DSN`, `VITE_SENTRY_DSN`), Uptime Kuma (`--profile monitoring`), cảnh báo Telegram từ dịch vụ `beat` mỗi 10 phút.
- CI: `.github/workflows/ci.yml` (pytest + migration check + web). Deploy: workflow **Deploy** (SSH tới VPS).
- Danh sách việc trước khi mở beta: `docs/beta-checklist.md`.

## YOLO-seg thân cây
Xem `packages/pipeline/tools/seg/README.md` (SAM gán nhãn → dataset → huấn luyện → `TRUNK_SEG_WEIGHTS`).
Chưa có trọng số thì A2 dùng số đo P1 (`cv_fallback`).

## Đổi nhà cung cấp AI
Chỉ sửa biến môi trường của `worker`: `LLM_PROVIDER/LLM_MODEL` (anthropic | gemini | fake), `IMAGE_PROVIDER/IMAGE_MODEL` (gemini | openai | fake) và các biến `*_FALLBACK_*`. Đơn giá để tính `cost_usd` ở `packages/pipeline/bonsai_pipeline/pricing.py`.

## Cài R2
- Bucket private; áp `infra/r2-lifecycle.json` (xóa ảnh thô `uploads/` sau 1 ngày) và `infra/r2-cors.json` (sửa domain).
- Backup: cron `infra/backup/pg_backup.sh` (giữ 14 bản).
