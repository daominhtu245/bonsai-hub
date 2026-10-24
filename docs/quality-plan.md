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
| 0 | Gom 5–10 phiên bị chê + bảng chấm "đúng chuẩn" (~10 tiêu chí) cùng nghệ nhân | Không | 1–2 buổi |
| 1 | Nghệ nhân chấm thiết kế P2 trên bản vẽ (Cổng 1) trước khi bàn tới ảnh | Không | công cụ chấm: 1–2 ngày |
| 2 | **Khóa phần không được đổi**: dùng mặt nạ (tách nền + thân) giữ nguyên pixel thân, gốc, chậu, nền; model chỉ được vẽ vùng tán (inpaint có mask) | Không | 3–4 ngày |
| 3 | **Dựng bố cục trước, AI chỉ làm thật**: ghép tầng lá đúng vị trí thiết kế + xóa cành cắt (dùng lại `studio_compose`) → AI chỉ tinh chỉnh cho giống ảnh thật trong vùng tán | Không | 3–4 ngày |
| 4 | **Tự kiểm tra trước khi giao**: đo thân có bị đổi, số / vị trí tầng lá, tỉ lệ tán theo luật, cành cắt có mọc lại, ngọn đúng chỗ + AI chấm theo bảng chấm; không đạt → sửa / vẽ lại; vẫn không đạt → báo độ tin cậy thấp hoặc hoàn lượt | Không | 3–5 ngày |
| 5 | S1–S3 suy ra từ S4 (gỡ dần tán theo mặt nạ) thay vì vẽ độc lập | Không | 2–3 ngày |
| 6 | Nút "Sai ở đâu" (thân bị đổi / sai số tầng / cành cắt còn / sai loài lá / quá già…) → dữ liệu chỉnh prompt, luật, model | Không | 1–2 ngày |
| 7 | Train YOLO-seg thân / cành / rễ (300–500 ảnh) → đo và kiểm tra chính xác hơn | Có | khi đủ ảnh |
| 8 | Train model chấm dáng từ điểm nghệ nhân + quẹt chọn (B6) → lọc ảnh xấu tự động | Có | ~1–2 nghìn lượt chấm |
| 9 | Tự huấn luyện model tạo ảnh mã nguồn mở (Flux / SDXL + ControlNet + LoRA theo loài), chạy GPU thuê | Có | cần 1–5 nghìn cặp ảnh trước/sau thật |

Chi phí thêm dự kiến cho bước 2–5: khoảng +$0,02–0,05 mỗi lượt (chấm ảnh, sửa ảnh). GPT Image / Gemini không cho tự huấn luyện;
huấn luyện chỉ áp dụng cho model riêng (bước 7–9).

## Cách đo đã cải thiện
Bộ 20 phôi cố định; mỗi thay đổi chạy lại cả bộ, nghệ nhân chấm theo bảng chấm; so tỉ lệ đạt trước / sau.
Mục tiêu Cổng 2: ≥ 70% ảnh đạt ngay lần đầu.
