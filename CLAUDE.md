# Bonsai AI — hướng dẫn triển khai cho Claude Code

## Sản phẩm
Web app mobile-first (PWA) cho người chơi và nhà vườn bonsai Việt Nam. Người dùng chụp ảnh **phôi** (cây chưa tạo dáng), hệ thống:
1. Phân tích phôi (loài, thân, cành, rễ) — miễn phí.
2. Đề xuất 2–3 **thế cây** kèm **bản vẽ SVG** đè lên ảnh gốc (cành cắt / giữ / nuôi mới, khung tán, điểm ngọn) — miễn phí.
3. Khi người dùng chọn phương án và trả 1 lượt: sinh **ảnh kết quả cuối (S4)** + **3 ảnh giai đoạn (S1–S3)** + **hướng dẫn chăm theo từng giai đoạn** bằng tiếng Việt.

Giao diện và nội dung hiển thị: **tiếng Việt**. Prompt gửi cho model: **tiếng Anh** (xem `docs/prompt_system.md`).

## Tài liệu nguồn (đọc trước khi code)
| File | Nội dung |
|---|---|
| `docs/architecture.md` | Stack, kiến trúc, pipeline A/B, trạng thái job, DB, API, chi phí, hạ tầng, kế hoạch 6 tuần, rủi ro |
| `docs/prompt_system.md` | Toàn bộ prompt P1→P6, từ điển thế/loài, bộ luật tỉ lệ (YAML), luật chấm P4, kiểm tra đơn điệu giai đoạn |
| `docs/ui-spec.md` | Nguyên tắc UX, 9 màn hình, trạng thái bắt buộc, giọng văn, trợ năng |
| `design/tokens.json`, `design/tailwind.tokens.cjs` | Hệ thiết kế **v2** (kiểu công cụ chuyên nghiệp: trung tính, một màu nhấn, Be Vietnam Pro), sáng/tối |
| `design/mockups/*.dc.html` | Mockup 9 màn hình v1 — chỉ còn dùng để tham chiếu **luồng và chức năng**; giao diện đã thay bằng hệ v2 |
| `/he-thong-thiet-ke` (web) | Thư viện component v2 đang dùng |
| `docs/features.md` | Danh sách chức năng hiện có (người dùng / quản trị) |
| `docs/deploy.md` | Deploy lên VPS Ubuntu có Nginx (domain, cổng trong `.env`) |
| `docs/ideas.md` | Danh sách ý tưởng phát triển đã chốt + thứ tự |
| `docs/quality-plan.md` | Kế hoạch sửa chất lượng ảnh kết quả (phản hồi beta) |
| `docs/huong-dan-test.md` | Hướng dẫn test từng chức năng theo đúng thứ tự tạo dữ liệu |

Khi tài liệu và mockup lệch nhau: **tài liệu kỹ thuật** quyết định hành vi; giao diện theo **hệ thiết kế v2** (tokens + thư viện component), không theo màu/chữ của mockup v1.

## Stack (đã chốt)
- Frontend: React + Vite + TypeScript + Tailwind, PWA. Font: Be Vietnam Pro (duy nhất). Icon: lucide-react.
- Backend: FastAPI (Python 3.12), Celery (hoặc Arq) + Redis, PostgreSQL 16 (JSONB), Cloudflare R2 (S3 API).
- AI: lớp adapter `llm_client` (Claude Sonnet 5.5 mặc định, Gemini Flash dự phòng) và `image_client` (Gemini Nano Banana mặc định, GPT Image dự phòng). Đổi nhà cung cấp bằng cấu hình, không sửa code pipeline.
- CV: YOLO-seg (thân/cành), SAM làm fallback và công cụ gán nhãn; OpenCV, Pillow.
- Triển khai: Docker Compose (`web`, `api`, `worker`, `redis`, `postgres`), 1 VPS.

## Cấu trúc repo cần tạo
```
apps/web/            # React PWA
apps/api/            # FastAPI: auth, trees, jobs, payments, admin
apps/worker/         # Celery tasks: pipeline A, pipeline B
packages/pipeline/   # P1..P6, rule_engine, sketch_svg, cv_checks, adapters
packages/prompts/    # template prompt (seed vào bảng prompt_versions)
infra/               # docker-compose, nginx, backup
design/              # tokens + mockups (đã có)
docs/                # tài liệu (đã có)
```

## Quy ước bắt buộc
- Mỗi bước AI trả **JSON có schema** (Pydantic). JSON lỗi → gọi lại tối đa 2 lần kèm thông báo lỗi.
- Mỗi bước ghi 1 dòng `pipeline_steps`: provider, model, prompt_version, tokens, số ảnh, `cost_usd`, latency, ok.
- Lưu **cả ảnh bị loại** (`render_images.selected=false`) — đây là dataset về sau.
- Prompt lưu trong DB (`prompt_versions`), seed từ `packages/prompts/`; không hardcode trong code.
- Bộ luật + thông số (`rule_set`, `styles_vn`, `species`, `judging`) lưu trong DB (`rule_docs`, có phiên bản), seed từ `packages/pipeline/bonsai_pipeline/rules/*.yaml`; nghệ nhân sửa ở `/admin/bo-luat`. Thông số mới cho nghệ nhân chỉnh → thêm vào YAML, code đọc qua `dictionaries` (không hằng số trong code).
- Không bao giờ để model ảnh tự quyết thẩm mỹ: thiết kế quyết định ở P2 + rule engine; P3 chỉ thực thi.
- Ảnh tải lên: xóa EXIF/GPS, chuẩn hóa cạnh dài 1536 px, lưu R2 private, truy cập bằng URL ký sẵn 1 giờ.
- Lỗi sau khi đã trừ lượt → tự hoàn lượt (ghi `credit_ledger` reason `refund`).
- UI: chỉ dùng token trong `design/tokens.json`; vùng chạm ≥ 44 px, nút chính 48 px; mọi màn hình có 4 trạng thái (đang tải, rỗng, lỗi, bình thường).
- UI tối giản chữ: không thêm đoạn mẹo/giải thích/chú thích dài; chỉ giữ chức năng, nhãn bắt buộc ("Minh họa" trên ảnh AI) và thông báo cần thiết. Không dùng hình vẽ hoạt hình; hình minh họa là ảnh thật có giấy phép (`apps/web/public/images/CREDITS.md`).
- Không lưu khóa API ngoài biến môi trường của `worker`.

## Thứ tự triển khai (6 tuần, kiểm thử song song khi xây)
1. **Tuần 1 — Nền tảng:** monorepo, Docker Compose, schema DB + migration (Alembic), đăng nhập Google/Zalo (JWT), presigned upload R2, adapter AI, tokens Tailwind + thư viện component (nút, thẻ, chip, thanh trượt trước/sau, timeline giai đoạn, thẻ hướng dẫn).
2. **Tuần 2 — Phiên A:** P1 Analyze, YOLO-seg (gán nhãn ~200 ảnh bằng SAM), rule engine (tỉ lệ từ YAML), P2 Design, vẽ sketch SVG/PNG. Màn hình 02–05. *Cổng 1: P2 cho thiết kế hợp lý trên 20 ảnh phôi thật.*
3. **Tuần 3 — Phiên B:** P3a sinh 3 ứng viên song song, P4 (IoU thân + VLM judge), vòng sửa P3c tối đa 2 lần.
4. **Tuần 4 — Lộ trình:** P2b, render chuỗi S1→S3, kiểm tra đơn điệu CV, P6/P5. Màn hình 06. *Cổng 2: ≥ 70% lượt qua P4 ngay vòng đầu.*
5. **Tuần 5 — Sản phẩm:** chia sẻ (ảnh 9:16 / 1:1 + watermark, link công khai), vườn của tôi, VietQR + webhook SePay/Casso (idempotent), trang admin prompt + chi phí.
6. **Tuần 6 — Beta:** Sentry, Uptime Kuma, cảnh báo Telegram, mời 20–30 người dùng thử.

Bắt đầu bằng tuần 1. Sau mỗi tuần, tóm tắt việc đã xong, việc còn lại và các quyết định đã đưa ra.
