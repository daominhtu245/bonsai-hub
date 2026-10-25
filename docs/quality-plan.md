# Kế hoạch sửa chất lượng ảnh kết quả ("đẹp nhưng sai")

Phản hồi beta (25/10/2026): ảnh kết quả đẹp nhưng không đúng phôi, không đúng tiêu chuẩn, không như mong muốn.

## Vì sao hiện tại ra "ảnh đẹp" chứ không "ảnh đúng"
1. **Model ảnh vẽ lại cả bức ảnh.** P3a gửi ảnh gốc + bản vẽ + prompt; ràng buộc (giữ thân, cắt cành đỏ, đặt tầng lá) chỉ là *lời dặn*. Model ảnh tối ưu cho "trông đẹp, hợp lý", nên tự sửa thân, thêm cành, dàn tán theo ý nó.
2. **Gần như không có bước kiểm tra.** Chế độ Tiêu chuẩn tắt P4 (AI chấm ảnh) để tiết kiệm. Kiểm tra thân (IoU) cần model YOLO-seg — chưa có → bị bỏ qua. Ảnh nào ra cũng được giao.
3. **"Đúng chuẩn" chưa được định nghĩa.** Bộ luật tỉ lệ và thư viện chăm là bản nháp, chưa có nghệ nhân duyệt; chưa có bảng chấm.
4. **Thiết kế (P2) có thể đã sai từ đầu** — ảnh chỉ thực thi thiết kế; thiết kế sai thì ảnh sai.
5. **S1–S3 vẽ độc lập** → mỗi ảnh một kiểu, không khớp nhau.

## Các bước
| # | Bước | Cần train? | Ước lượng |
|---|---|---|---|
| 0a | ✅ Bộ luật + bảng chấm nháp từ nguồn công khai (`rules/*.yaml`, `rules/SOURCES.md`) + 380 ảnh tham chiếu có giấy phép (`data/seed/`) | Không | xong 25/10 |
| 0 | Gom 5–10 phiên bị chê + bảng chấm "đúng chuẩn" (~10 tiêu chí) cùng nghệ nhân | Không | 1–2 buổi |
| 1 | ✅ công cụ (25/10): vai trò Nghệ nhân, `/admin/cham-diem` (ảnh + thiết kế), `/admin/thong-ke-cham`; còn: mời nghệ nhân chấm | Không | — |
| 2 | ✅ (25/10) **Khóa phần không được đổi**: dùng mặt nạ (tách nền + thân) giữ nguyên pixel thân, gốc, chậu, nền; model chỉ được vẽ vùng tán (inpaint có mask) | Không | 3–4 ngày |
| 3 | ✅ (25/10) **Dựng bố cục trước, AI chỉ làm thật**: ghép tầng lá đúng vị trí thiết kế + xóa cành cắt (dùng lại `studio_compose`) → AI chỉ tinh chỉnh cho giống ảnh thật trong vùng tán | Không | 3–4 ngày |
| 4 | ✅ (25/10) **Tự kiểm tra trước khi giao**: đo thân có bị đổi, số / vị trí tầng lá, tỉ lệ tán theo luật, cành cắt có mọc lại, ngọn đúng chỗ + AI chấm theo bảng chấm; không đạt → sửa / vẽ lại; vẫn không đạt → báo độ tin cậy thấp hoặc hoàn lượt | Không | 3–5 ngày |
| 5 | ✅ (25/10) S1–S3 khóa thân + nền; thêm chế độ dựng S1–S3 từ S4 (admin chọn, `stage_derive.py`). S1–S3 suy ra từ S4 (gỡ dần tán theo mặt nạ) thay vì vẽ độc lập | Không | 2–3 ngày |
| 6 | ✅ (25/10) Nút "Sai ở đâu" (thân bị đổi / sai số tầng / cành cắt còn / sai loài lá / quá già…) → dữ liệu chỉnh prompt, luật, model | Không | 1–2 ngày |
| 7 | Train YOLO-seg thân / cành / rễ (300–500 ảnh) → đo và kiểm tra chính xác hơn | Có | khi đủ ảnh |
| 8 | Train model chấm dáng từ điểm nghệ nhân + quẹt chọn (B6) → lọc ảnh xấu tự động | Có | ~1–2 nghìn lượt chấm |
| 9 | Tự huấn luyện model tạo ảnh mã nguồn mở (Flux / SDXL + ControlNet + LoRA theo loài), chạy GPU thuê | Có | cần 1–5 nghìn cặp ảnh trước/sau thật |

Chi phí thêm dự kiến cho bước 2–5: khoảng +$0,02–0,05 mỗi lượt (chấm ảnh, sửa ảnh). GPT Image / Gemini không cho tự huấn luyện;
huấn luyện chỉ áp dụng cho model riêng (bước 7–9).

## Cách đo đã cải thiện
Bộ 20 phôi cố định; mỗi thay đổi chạy lại cả bộ, nghệ nhân chấm theo bảng chấm; so tỉ lệ đạt trước / sau.
Mục tiêu Cổng 2: ≥ 70% ảnh đạt ngay lần đầu.

## Kết quả thử thật đầu tiên (25/10/2026)
Chạy lại phiên B trên 2 phiên cũ (giữ nguyên phôi + thiết kế, chỉ đổi cách tạo ảnh), P3a v3 + khóa vùng + P4 v2:
- Phôi si (ảnh có tay cầm): ảnh cũ vẽ lại thân và phân cành theo ý model; ảnh mới giữ đúng thân, u sẹo, rễ;
  tầng lá đúng vị trí bố cục, chậu đúng thiết kế. Bộ đo bắt được lá xòe rộng hơn tầng thiết kế.
- Phôi sanh: ảnh cũ "bịa" một cây khác; ảnh mới giữ đúng cây nhưng tầng lá quá nhỏ (bộ đo báo `pads_missing`) —
  phân tích cũ của phiên này kém và tách nền thất bại nên cành cũ ngoài thiết kế không được dọn.
- Đã sửa sau lần thử: vùng chậu cắt cứng (giờ cả dải dưới), vệt sọc mép sau khi căn (bỏ mép không có dữ liệu),
  lỗi trung thực là lỗi "mềm" (vẫn chấm P4 để có hướng dẫn sửa), mặt nạ sai cỡ với ảnh vuông.
- Chưa thử lại được sau khi sửa: tài khoản OpenAI hết tiền.

## Giai đoạn tập trung chất lượng (từ 25/10/2026)
Dừng thêm tính năng (xem [status.md](status.md)). "Training" ở đây gồm 2 việc khác nhau:
**chỉnh có đo** (prompt, bộ luật, khóa vùng — làm ngay, không cần GPU) và **huấn luyện model riêng**
(YOLO-seg, model chấm, model ảnh — cần dữ liệu, làm dần). GPT Image / Gemini không cho tự huấn luyện.

| # | Việc | Cần gì | Tốn |
|---|---|---|---|
| Q0 | **Bộ đo cố định**: 20 phôi thật (đủ 5 loài, nhiều góc / nền), bảng chấm ~10 tiêu chí, lệnh chạy cả bộ + báo cáo so sánh trước / sau. ✅ công cụ: `scripts/benchmark/bench.py` (seed · check · run · report); ảnh mạng có giấy phép: `scripts/dataset/` (tải → CLIP phân loại → tách nền); hướng dẫn chụp: `docs/huong-dan-chup-phoi.md` | Ảnh phôi thật (chủ dự án / nhà vườn quen) | 0 đ |
| Q1 | **Nghệ nhân duyệt bộ luật** (`rule_set`, `styles_vn`, `species`, `judging`) ở `/admin/bo-luat` | 1–2 nghệ nhân, 2–3 buổi | công nghệ nhân |
| Q2 | **Đo lần đầu**: chạy Q0 với chế độ hiện tại → nghệ nhân chấm ở `/admin/cham-diem` → tỉ lệ đạt + lỗi hay gặp | Nạp tiền AI | ~$10–20 / lần chạy |
| Q3 | **Vòng sửa**: mỗi lần sửa prompt / luật / khóa vùng theo lỗi hay gặp → chạy lại cả bộ → chỉ giữ thay đổi làm tăng tỉ lệ đạt; tới Cổng 2 (≥ 70%) | Q2 | ~$10–20 / vòng |
| Q4 | **Train YOLO-seg** thân / cành / rễ: gán nhãn 300–500 ảnh ở `/admin/gan-nhan` (SAM hỗ trợ) → đo thân chính xác, kiểm tra "thân bị đổi" thật. ✅ 25/10: 229 ảnh phôi có giấy phép đã vào Gán nhãn kèm nháp miễn phí (tách nền + màu); còn: người sửa nháp + duyệt, thêm ảnh chụp thật | Ảnh phôi + công gán nhãn; GPU thuê vài giờ | ~$5 GPU |
| Q4b | **Máy đoán loài** (CLIP + phân loại, `models/species_clip.json`): 13 loài, đúng ngay 73%, top-3 89% trên tập kiểm tra; worker lưu kết quả cạnh P1 (`progress.species_local`), bộ đo báo tỉ lệ khớp → đủ cao thì thay bước nhận loài bằng API | ✅ không tốn API | 0 đ |
| Q5 | Model chấm dáng từ điểm nghệ nhân + Chọn dáng đẹp | ~1–2 nghìn lượt chấm | sau beta |
| Q6 | Model ảnh riêng (Flux / SDXL + ControlNet + LoRA theo loài) | 1–5 nghìn cặp ảnh trước / sau thật | nhiều tháng sau |

Song song: deploy bản hiện tại (tính năng phụ để Nội bộ), mời beta có **đồng ý dùng ảnh** → nguồn ảnh phôi thật
và nút "Sai ở đâu" cho Q3–Q5.
