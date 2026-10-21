# Bonsai AI — Kiến trúc kỹ thuật MVP

Bản gốc có sơ đồ: tài liệu "Bonsai AI — Kiến trúc kỹ thuật MVP" (Claude Docs). File này là bản văn bản để dùng trong repo. Cập nhật: 21/10/2026.

## 1. Phạm vi MVP
| Hạng mục | Trong MVP | Sau MVP |
|---|---|---|
| Loài | si, sanh, mai chiếu thủy, tùng la hán, linh sam | mở rộng theo nhu cầu |
| Đầu vào | 1–4 ảnh, chọn mặt tiền | video quay quanh cây |
| Thiết kế | 2–3 phương án thế, người dùng chọn 1 | tự chỉnh cành trên bản vẽ |
| Bản vẽ | SVG đè ảnh gốc | bản vẽ phong cách nghệ nhân (P3b) |
| Ảnh | S4 + S1, S2, S3 theo chuỗi | đa góc nhìn, video timelapse |
| Hướng dẫn | thẻ theo giai đoạn, tiếng Việt | nhắc lịch, theo dõi cây thật |
| Tài khoản | Google/Zalo, lịch sử cây | cổng nhà vườn B2B |
| Thanh toán | gói lượt qua VietQR | subscription |
| 3D | không | xem xét khi có nhu cầu trả tiền |

## 2. Kiến trúc
```
PWA (React) ──REST + SSE──▶ API (FastAPI) ──▶ PostgreSQL
     │                          │  └──đẩy job──▶ Redis ──▶ Worker (Celery)
     └──presigned upload──▶ R2 ◀──lưu ảnh render──┘          │
Ngân hàng (SePay/Casso) ──webhook──▶ API          Worker ──▶ Vision LLM (Claude/Gemini)
                                                 Worker ──▶ Model ảnh (Nano Banana)
```
Worker ghi kết quả vào PostgreSQL và R2; API đọc trạng thái và đẩy tiến độ qua SSE.

## 3. Pipeline
**Phiên A** (miễn phí, 20–40 giây): A0 tiền xử lý → A1 P1 Analyze → A2 segment thân (YOLO-seg) → A3 rule engine → A4 P2 Design → A5 vẽ sketch SVG/PNG.
**Người dùng chọn phương án → trừ 1 lượt.**
**Phiên B** (2–4 phút): B1 P3a render S4 (3 ứng viên song song) → B2 P4 judge (CV IoU rồi VLM) → [P3c tối đa 2 vòng] · B3 P2b stage plan (song song B1–B2) → B4 render S1 (sửa có kiểm soát) → B5 render S2, S3 (chuỗi) + kiểm tra đơn điệu → B6 P6 + P5 → B7 đóng gói, ảnh chia sẻ.

| Bước | Thực thi | Retry / lỗi |
|---|---|---|
| A0 | code: cạnh dài 1536 px, xoay EXIF, xóa GPS | sai định dạng → báo ngay |
| A1 P1 | Vision LLM | JSON lỗi → gọi lại 2 lần; `usable=false` → dừng, hướng dẫn chụp lại, không trừ lượt |
| A2 | YOLO-seg | mask rỗng → dùng số đo P1, cờ `cv_fallback` |
| A3 | code | — |
| A4 P2 | LLM | kiểm schema + luật cứng bằng code; vi phạm → gọi lại kèm lỗi |
| A5 | code | — |
| B1 P3a | image model | lỗi API → retry backoff 3 lần |
| B2 P4 | CV + VLM | tất cả trượt → P3c tối đa 2 vòng, rồi trả ảnh tốt nhất kèm cảnh báo |
| B3 P2b | LLM | — |
| B4 S1 | image model | kiểm tra gốc, nền |
| B5 S2→S3 | image model, tuần tự | vi phạm đơn điệu → sinh lại bước đó tối đa 2 lần |
| B6 | LLM | — |

**Trạng thái job:** `queued → analyzing → designing → awaiting_choice → rendering_final → judging → rendering_stages → writing_guide → done`; bất kỳ bước nào có thể `failed` (tự hoàn lượt nếu đã trừ).

## 4. Database (PostgreSQL)
| Bảng | Trường chính | Ghi chú |
|---|---|---|
| users | id, auth_provider, email/zalo_id, name, role (player/nursery/admin), credits | credits là cache; nguồn gốc ở ledger |
| trees | id, user_id, nickname, species_key, real_height_cm, created_at | |
| tree_photos | id, tree_id, storage_key, view_index, is_front, taken_at, source (upload/progress) | |
| design_jobs | id, tree_id, status, analysis JSONB, targets JSONB, chosen_option_id, prompt_version, error, started_at, finished_at | |
| design_options | id, job_id, rank, style_key, suitability, design JSONB, sketch_svg_key, sketch_png_key | |
| stages | id, job_id, code S0–S4, time_from_start, plan JSONB, guide_vi JSONB, image_id | |
| render_images | id, job_id, stage_code, attempt, storage_key, model, prompt_hash, cv_checks JSONB, judge JSONB, total_score, selected | lưu cả ảnh bị loại |
| pipeline_steps | id, job_id, step_code, provider, model, prompt_version, input_ref, output JSONB, tokens_in, tokens_out, images_out, cost_usd, latency_ms, ok | log + chi phí |
| feedback | id, job_id, user_id, rating, reason_tags, comment | |
| credit_ledger | id, user_id, delta, reason (purchase/render/refund/gift), ref_id, created_at | chỉ ghi thêm |
| payments | id, user_id, amount_vnd, package_code, transfer_code, status, paid_at | |
| prompt_versions | id, step_code, version, template, active, created_at | |
| species / styles | key, name_vi, prompt_desc_en, growth_speed, ref_image_keys | |

Đường dẫn ảnh R2: `trees/{tree_id}/jobs/{job_id}/{stage}_{attempt}.webp`.

## 5. API (`/api/v1`, JWT, SSE cho tiến độ)
| Method | Endpoint | Mục đích |
|---|---|---|
| POST | /auth/google, /auth/zalo | đăng nhập |
| GET | /me | user + số lượt |
| POST | /uploads/presign | URL ký sẵn lên R2 |
| POST | /trees | tạo cây |
| GET | /trees, /trees/{id} | danh sách, chi tiết |
| POST | /trees/{id}/jobs | chạy phiên A (giới hạn 10/ngày/user) |
| GET | /jobs/{id} | trạng thái + kết quả hiện có |
| GET | /jobs/{id}/events | SSE |
| POST | /jobs/{id}/choose | chọn phương án → trừ lượt → phiên B |
| GET | /jobs/{id}/result | sketch, S0–S4, hướng dẫn |
| POST | /jobs/{id}/share | link công khai + ảnh watermark |
| GET | /s/{share_code} | trang công khai |
| POST | /jobs/{id}/feedback | đánh giá |
| GET | /packages | gói lượt |
| POST | /payments | tạo đơn, trả VietQR + nội dung CK |
| POST | /webhooks/bank | cộng lượt (xác thực chữ ký, idempotent) |
| — | /admin/* | prompt, từ điển, job lỗi, chi phí |

## 6. Chi phí mỗi lượt (giá tra ngày 21/10/2026; 1 USD = 26.000 đ, giả định)
Đơn giá: Claude Sonnet 5.5 $2/$10 mỗi triệu token vào/ra; Nano Banana 2.1 $0.0336/ảnh 1K, đầu vào $1.50/triệu token.
| Bước | Chi phí (USD) |
|---|---|
| Phiên A (P1 + P2) | 0,067 |
| P3a S4 (3 ảnh) | 0,123 |
| P4 judge ×3 | 0,048 |
| P3c (30% lượt) | 0,035 |
| P2b | 0,038 |
| S1–S3 (3,5 ảnh trung bình) | 0,144 |
| P6 + P5 | 0,052 |
| **Tổng** | **≈ 0,51 (≈ 13.300 đ)** |

Cấu hình: tiết kiệm (Gemini 3.8 Flash + Nano Banana 2.1) ≈ $0,36; mặc định ≈ $0,51; cao cấp (Nano Banana Pro) ≈ $1,20.
Gói đề xuất: dùng thử 1 lượt; lẻ 49.000 đ; người chơi 199.000 đ/5 lượt; nhà vườn 1.490.000 đ/50 lượt.

## 7. Hạ tầng, bảo mật, giám sát
- Docker Compose: web (Nginx + PWA), api, worker (4–8 tiến trình), redis, postgres; Cloudflare phía trước; backup Postgres hằng ngày lên R2, giữ 14 bản; GitHub Actions deploy qua SSH; staging chung VPS.
- Bucket private, URL ký sẵn 1 giờ; xóa EXIF/GPS; khóa AI chỉ ở worker; rate limit phiên A; P1 từ chối ảnh không phải cây; webhook xác thực chữ ký, idempotent.
- Sentry, Uptime Kuma; dashboard admin từ `pipeline_steps`; cảnh báo Telegram khi lỗi > 10%/giờ, chi phí ngày vượt ngưỡng, hàng đợi > 50.

## 8. Rủi ro kỹ thuật
| Rủi ro | Dấu hiệu | Xử lý |
|---|---|---|
| Model ảnh vẽ lại thân | IoU thân < 0,75 nhiều ứng viên | ghép lại vùng thân gốc theo mask rồi hòa viền; chỉ cho vẽ vùng tán; nếu vẫn kém → Flux + ControlNet |
| S1–S3 không nhất quán | sinh lại vẫn vi phạm | giữ S1 + S4, thay S2/S3 bằng bản vẽ SVG |
| YOLO-seg thiếu dữ liệu | mask sai với si, sanh có rễ khí | SAM với điểm từ P1; bổ sung nhãn từ ảnh người dùng |
| Kiến thức bonsai sai | người chơi chê | nghệ nhân duyệt bộ luật từ tuần 2; nút báo sai |
| Chi phí vượt | > $0,70/lượt | cấu hình tiết kiệm, giảm ứng viên, prompt caching |
| Nhà cung cấp đổi giá/ngừng model | deprecate, lỗi tăng | adapter + nhà cung cấp dự phòng |
| Lạm dụng phiên A | nhiều tài khoản mới, ảnh không phải cây | rate limit user + IP; P1 từ chối |
