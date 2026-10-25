# Tình trạng dự án (25/10/2026)

Ước tính chung **~65–70%**: phần xây dựng (code, giao diện, quản trị) ~90%, nhưng phần quyết định — **ảnh kết quả đúng phôi** — mới ~40% và chưa có số đo.

| Hạng mục | Mức độ | Còn thiếu |
|---|---|---|
| Nền tảng (đăng nhập, lưu ảnh, DB, hàng đợi, deploy) | ~95% | — |
| Luồng chính: chụp → phân tích → bản vẽ → ảnh tương lai → lộ trình | ~85% | — |
| **Chất lượng ảnh "đúng phôi"** | **~40%** | Khóa thân / dựng bố cục / tự kiểm tra mới thử 2 phiên; chưa đo Cổng 2 (≥ 70% đạt ngay lần đầu); chưa có YOLO-seg riêng |
| Bộ luật tạo dáng, thư viện chăm | ~50% | Bản nháp từ nguồn công khai, **chưa nghệ nhân duyệt** |
| Thanh toán, lượt, mã quà tặng | ~90% | Chạy thật với ngân hàng + webhook SePay / Casso trên VPS |
| Tính năng mở rộng (26 tiện ích, chợ, nghệ nhân, cộng đồng) | ~90% | Cần người dùng thật để có nội dung |
| Giao diện người dùng (sáng / tối) | ~90% | — |
| Quản trị | ~90% | — |
| Beta thật (20–30 người, đo số liệu) | ~20% | Mời người dùng, khóa Sentry / Uptime Kuma thật |

## Quyết định 25/10/2026: dừng thêm tính năng, tập trung chất lượng
Các phần khác đủ dùng; chỉ sửa lỗi khi phát sinh. Mọi công sức dồn vào **ảnh đúng phôi + bộ luật tạo dáng**,
theo thứ tự trong [quality-plan.md](quality-plan.md) → mục "Giai đoạn tập trung chất lượng".
