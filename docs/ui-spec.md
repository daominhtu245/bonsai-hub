# Bonsai AI — Đặc tả UX/UI

Phong cách **công cụ chuyên nghiệp** (hệ thiết kế v2, từ 22/10/2026): nền trung tính, một màu nhấn xanh rêu đậm dùng tiết kiệm, một font sans, bo góc nhỏ, icon nét mảnh đồng bộ (Lucide), ảnh thật làm minh họa. Ít chữ: chỉ chức năng và nhãn cần thiết. Mockup v1 (`design/mockups/`) chỉ còn tham chiếu luồng; giao diện theo `design/tokens.json` v2 và trang `/he-thong-thiet-ke`.

## Người dùng
| Nhóm | Đặc điểm | Yêu cầu |
|---|---|---|
| Nhà vườn | 35–60 tuổi, dùng điện thoại ngoài vườn, quen Zalo/Facebook | chữ lớn, tương phản cao, nút to, xuất ảnh bán hàng 1 chạm |
| Người chơi lâu năm | hiểu thuật ngữ, khó tính, nghi ngờ AI | bản vẽ kỹ thuật + lý do thiết kế, đúng tên thế |
| Người mới | mua phôi, chưa biết bắt đầu | giải thích thuật ngữ tại chỗ, từng bước |

## Nguyên tắc
1. Ảnh trước, chữ sau.
2. Một việc mỗi màn hình; 1 nút chính ở vùng ngón cái.
3. Trung thực với AI: nhãn "Minh họa", mốc thời gian trên mọi ảnh tương lai.
4. Chờ có thông tin: hiển thị từng bước đang làm và tiến độ (không chèn mẹo, giải thích dài).
5. Thuật ngữ hai lớp: tên Việt chính, tên Nhật nhỏ bên cạnh.
6. Màu có nghĩa thống nhất ở mọi nơi (bản vẽ, thẻ, chú thích).

## Màn hình (file mockup)
| # | Màn hình | File | Ghi chú triển khai |
|---|---|---|---|
| 01 | Trang chủ | Main.dc.html | thanh trượt trước/sau thật (kéo được) |
| 02 | Chụp ảnh có hướng dẫn | Capture.dc.html | `getUserMedia`; kiểm tra mờ/tối trên máy (Laplacian variance, độ sáng trung bình); đếm 4 mặt; cho chọn ảnh có sẵn |
| 03 | Thông tin cây | TreeInfo.dc.html | chọn mặt tiền, loài (hoặc AI nhận diện), chiều cao, tên — đều tùy chọn trừ ảnh |
| 04 | Đang phân tích | Analyzing.dc.html | danh sách bước qua SSE; mẹo ngẫu nhiên; báo xong qua Web Push/Zalo |
| 05 | Chọn phương án | Choose.dc.html | thẻ phương án có bản vẽ SVG, bật/tắt lớp, phóng to; CTA trừ lượt |
| 06 | Kết quả + lộ trình | Result.dc.html | timeline S0–S4 đổi ảnh + thẻ hướng dẫn; checkbox việc cần làm lưu theo cây; phản hồi Hợp lý/Chưa đúng |
| 07 | Chia sẻ | Share.dc.html | ghép ảnh 9:16 và 1:1 phía server (Pillow), watermark con dấu, logo + SĐT vườn |
| 08 | Vườn của tôi | Garden.dc.html | thẻ cây, tiến độ giai đoạn, việc cần làm tháng này; thanh điều hướng dưới |
| 09 | Mua lượt | Buy.dc.html | 3 gói, VietQR, trạng thái tự cập nhật qua SSE |
| — | Hệ thống thiết kế | Tokens.dc.html | màu, chữ, ký hiệu bản vẽ, component |

## Ký hiệu bản vẽ (thống nhất với P2 sketch)
| Ý nghĩa | Màu | Nét |
|---|---|---|
| Cành cắt bỏ | seal #B23A2B | đứt + dấu ✕ |
| Cành giữ lại | leaf #5E8C4F | liền, tán dự kiến nét đứt |
| Cành cần nuôi mới | brass #B08D57 | liền + mũi tên |
| Khung tán | ink #1F2421 | đứt mảnh, tam giác không cân |
| Ngọn | ink | chấm tròn + nhãn "Ngọn mới" |

## Trạng thái và vi điểm
- Mỗi màn hình có 4 trạng thái: đang tải (skeleton cùng bố cục), rỗng, lỗi (nói rõ việc cần làm), bình thường.
- Lỗi sau khi trừ lượt luôn kèm "Đã hoàn lượt cho bạn".
- Ảnh có cảnh báo từ P4: nhãn nghệ "Độ tin cậy thấp".
- Giọng văn: xưng "bạn", ngắn, như nghệ nhân chỉ việc; không dùng tiếng Anh trên giao diện.
- Trợ năng: alt cho ảnh, cỡ chữ hệ thống 200% không vỡ, không dùng màu là tín hiệu duy nhất, tương phản WCAG AA.
- Chuyển động 150–220 ms ease-out; tôn trọng `prefers-reduced-motion`.

## Chữ và lưới
- Be Vietnam Pro 400/500/600: hiển thị 28, tiêu đề 22 / 17, thân 16, phụ 14, nhãn 12 (nhãn mục viết hoa, giãn chữ). Số dùng tabular.
- Lưới 8; lề 16; cột nội dung tối đa 560 (admin 960).
- Bo: thẻ 10, nút 8, ảnh 8, nhãn 6. Viền 1 px `line` + bóng rất nhẹ (`shadow-card`).
- Vùng chạm ≥ 44; nút chính 48 cao, rộng hết cột. Công tắc trượt cho cài đặt bật/tắt.
- Icon: Lucide, nét 1,75.
