# Checklist lên beta (tuần 6)

Các bước cần người vận hành làm tay. Code đã sẵn; mục nào chưa có key thì tính năng đó tự tắt hoặc báo "chưa cấu hình".

## 1. Hạ tầng (VPS + Cloudflare)
- [ ] VPS (4 vCPU / 8 GB), cài Docker; clone repo vào `/srv/bonsai` (staging: `/srv/bonsai-staging`).
- [ ] Copy `.env.example` → `.env`, đặt `APP_ENV=prod`, `JWT_SECRET` dài ngẫu nhiên, `VITE_DEV_LOGIN=false`, `PUBLIC_BASE_URL=https://<domain>`, `CORS_ORIGINS=https://<domain>`.
- [ ] Bỏ `COMPOSE_PROFILES=local-s3`, `R2_PUBLIC_ENDPOINT` (chỉ dùng cho S3 local).
- [ ] Cloudflare trỏ domain về VPS (proxy bật), SSL Full (strict).
- [ ] GitHub secrets `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`; chạy workflow **Deploy** (staging trước).
- [ ] Cron backup: `15 3 * * * cd /srv/bonsai && sh infra/backup/pg_backup.sh >> /var/log/bonsai-backup.log 2>&1`; thử khôi phục 1 lần.

## 2. Cloudflare R2
- [ ] Bucket private `bonsai-private` + bucket `bonsai-backups`.
- [ ] Áp `infra/r2-lifecycle.json` (xóa `uploads/` sau 1 ngày) và `infra/r2-cors.json` (sửa domain).
- [ ] API token R2 → `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`.

## 3. Đăng nhập
- [ ] Google Cloud Console: OAuth Client (Web), Authorized JavaScript origins = domain → `GOOGLE_CLIENT_ID` và `VITE_GOOGLE_CLIENT_ID`.
- [ ] Zalo for Developers: tạo app, bật Social API, callback `https://<domain>/dang-nhap/zalo` → `ZALO_APP_ID`, `ZALO_APP_SECRET`, `VITE_ZALO_APP_ID`.
- [ ] `ADMIN_EMAILS` = email quản trị.

## 4. AI (chỉ ở worker)
- [ ] `ANTHROPIC_API_KEY`, `LLM_PROVIDER=anthropic`; `GEMINI_API_KEY`, `IMAGE_PROVIDER=gemini` (kiểm tra lại model ID trong `.env`).
- [ ] Kiểm tra tên model và đơn giá trong `packages/pipeline/bonsai_pipeline/pricing.py`.
- [ ] **Cổng 1**: chạy phiên A trên 20 ảnh phôi thật, nghệ nhân chấm thiết kế P2.
- [ ] **Cổng 2**: ≥ 70% lượt qua P4 ngay vòng đầu (xem `/admin` → Chi phí → tỉ lệ P3c).
- [ ] Gom 300–500 ảnh phôi thật, gán nhãn 3 lớp (thân / cành / rễ) và huấn luyện YOLO-seg (`packages/pipeline/tools/seg/README.md`) → `models/bonsai-seg.pt`, `TRUNK_SEG_WEIGHTS`, `WORKER_WITH_CV=true`.
- [ ] Nghệ nhân so sánh **bộ thiết kế bằng luật** với P2 trên ~20 phôi (`/admin` → Chế độ AI → Thiết kế: Bộ luật); chỉnh `rule_designer.py` rồi mới đặt làm mặc định.
- [ ] Nạp ảnh tham chiếu loài vào `species.ref_image_keys`.
- [ ] Nghệ nhân duyệt thư viện hướng dẫn chăm `packages/pipeline/bonsai_pipeline/rules/care_guide.yaml` (bản nháp; dùng ở chế độ AI Tiêu chuẩn/Tiết kiệm).
- [ ] Chọn chế độ AI ở `/admin` → Chế độ AI; đối chiếu chi phí `/admin` → Chi phí với hóa đơn nhà cung cấp.

## 5. Thanh toán
- [ ] Tài khoản nhận tiền → `BANK_BIN`, `BANK_ACCOUNT`, `BANK_ACCOUNT_NAME`, `BANK_NAME`.
- [ ] SePay: webhook `https://<domain>/api/v1/webhooks/bank`, kiểu xác thực API Key → `SEPAY_API_KEY`.
  Hoặc Casso: webhook cùng URL, secure token → `CASSO_SECURE_TOKEN`.
- [ ] Chuyển thử 1 giao dịch nhỏ (gói Lẻ) → lượt tự cộng; gửi lại webhook lần 2 không cộng thêm.

## 6. Giám sát
- [ ] Sentry: tạo project Python + React → `SENTRY_DSN`, `VITE_SENTRY_DSN`.
- [ ] Telegram: tạo bot với @BotFather, thêm vào nhóm vận hành → `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`; chỉnh `DAILY_COST_ALERT_USD`.
- [ ] Uptime Kuma: `docker compose --profile monitoring up -d uptime-kuma`, monitor `https://<domain>/healthz` mỗi 60 s, thông báo qua Telegram. Không mở cổng 3001 ra Internet (dùng SSH tunnel hoặc Cloudflare Access).

## 7. Thông báo
- [ ] Web Push: `docker compose exec worker python -m bonsai_worker.scripts.gen_vapid` → `VAPID_PUBLIC_KEY` (api), `VAPID_PRIVATE_KEY` (worker), `VAPID_SUBJECT=mailto:<email vận hành>`. Đổi khóa sẽ làm mất mọi đăng ký cũ.
- [ ] iPhone chỉ nhận Web Push khi người dùng "Thêm vào Màn hình chính" (iOS 16.4+); app tự hướng dẫn.
- [ ] Zalo ZNS: Zalo OA đã xác thực, nạp tiền ZNS; đăng ký 4 mẫu tin với **tham số `customer_name`, `message`, `link`** → `ZNS_TEMPLATE_DESIGN_READY`, `ZNS_TEMPLATE_RESULT_READY`, `ZNS_TEMPLATE_RESULT_FAILED`, `ZNS_TEMPLATE_ANALYSIS_FAILED`.
- [ ] Cấp quyền OA cho app → `ZALO_OA_APP_ID`, `ZALO_OA_SECRET_KEY`, `ZALO_OA_REFRESH_TOKEN` (lần đầu; worker tự lưu token mới vào Redis — **không xóa volume Redis**, nếu mất phải cấp lại).

## 8. Pháp lý
- [ ] Luật sư duyệt trang `/dieu-khoan` (bản nháp), nhất là mục dùng ảnh huấn luyện và xóa tài khoản.
- [ ] Chỉ xuất ảnh huấn luyện của người đã đồng ý (`export_from_db.py` đã lọc `consent_training`).

## 9. Mời 20–30 người dùng thử
- [ ] Nhóm: ~10 nhà vườn, ~10 người chơi lâu năm, ~5–10 người mới (docs/ui-spec.md).
- [ ] Tặng lượt dùng thử ở `/admin` → Tặng lượt (mỗi người 1 lần mỗi mã đợt) để mỗi người thử 3–5 cây.
- [ ] Theo dõi hằng ngày: `/admin` (chi phí/lượt, job lỗi), phản hồi "Chưa đúng" trong bảng `feedback`, cảnh báo Telegram.
- [ ] Sau 2 tuần: tổng hợp phản hồi, nghệ nhân duyệt lại bộ luật (`rules/rule_set.yaml`) và prompt (tạo phiên bản mới ở `/admin` → Prompt).
