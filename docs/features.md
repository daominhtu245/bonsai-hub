# Danh sách chức năng (cập nhật 25/10/2026)

Nguyên tắc: **người dùng** là người chơi cây, ít dùng công nghệ → mỗi chức năng là một nút bấm, chữ rõ, không cần
cấu hình. **Quản trị** có nhiều công cụ hơn để vận hành và điều chỉnh hệ thống.

## Người dùng (app điện thoại, PWA)

| Chức năng | Ở đâu | Ghi chú |
|---|---|---|
| Chụp / chọn ảnh phôi, nhập loài và chiều cao | Trang chủ → Phân tích phôi mới | Ảnh mờ / tối bị báo chụp lại ngay, không tốn API |
| Phân tích phôi + 2–3 thế kèm bản vẽ cắt / giữ / nuôi cành | Màn Chọn thế | Miễn phí. Trước khi gửi AI: **tách nền trên máy** (chỉ giữ phôi, bỏ tay / cây khác / logo) + **phác họa nét** thân, cành, rễ; màn Đang phân tích hiện ảnh đã tách |
| **Tự thiết kế**: chạm cành để Giữ / Cắt; màn chỉnh ảnh không cuộn, 5 chế độ (Cành / Tầng lá / Chậu / Rêu, đá / Hoàn tất), núm đổi cỡ + xoay, hai ngón phóng to; ghép từ **thư viện chi tiết cây thật** (tầng lá, ngọn theo 4 kiểu lá, 5 chậu, rêu, đá) — kéo, to / nhỏ, nghiêng, lật, đổi kiểu; cành mới, điểm ngọn; "Xem như thật"; bắt đầu từ mẫu AI; hoàn tác; gợi ý theo luật (không bắt buộc) | Chọn thế → Tự thiết kế | Lưu miễn phí; "Tạo ảnh tương lai" dùng 1 lượt, model ảnh đặt tầng lá đúng các vị trí người dùng ghép |
| **Xem thử nhanh bằng AI** | Tự thiết kế | Miễn phí 2 lần / phiên, ảnh nháp |
| **Nhờ góp ý** (link ảnh thiết kế gửi Zalo / Facebook) | Tự thiết kế | Trang công khai `/tk/…` |
| Giao diện Sáng (mặc định) / Tối / Theo máy | Tài khoản → Giao diện | |
| Ảnh tương lai + 3 ảnh giai đoạn + hướng dẫn từng giai đoạn | Màn Kết quả | Trả 1 lượt; lỗi tự hoàn lượt. Thân + nền giữ đúng ảnh gốc, tầng lá theo bố cục thiết kế, tự kiểm tra trước khi giao |
| **Đánh giá "Chưa đúng" kèm lý do** (thân khác, tầng lá sai, cành cắt còn, sai lá, già quá, chậu, trông giả) | Màn Kết quả | Lý do dùng chung mã với bảng chấm nghệ nhân |
| Đánh dấu việc đã làm theo giai đoạn | Màn Kết quả | |
| **Thêm nhắc việc vào lịch điện thoại** (.ics) | Kết quả → Lưu & nhắc việc | Mốc từng giai đoạn + nhắc kiểm tra dây uốn 3/6/10 tuần, báo trước 1 ngày |
| **Tải lịch chăm sóc (Excel)** | Kết quả → Lưu & nhắc việc | Mỗi việc một dòng, cột "Đã làm" để in ra đánh dấu |
| **In hướng dẫn / Lưu PDF** | Kết quả → Lưu & nhắc việc | Trang in chữ to, luôn nền sáng, không ngắt giữa giai đoạn |
| **Nhật ký cây** (ảnh tiến độ theo ngày) | Kết quả → Nhật ký cây | Ảnh được xóa vị trí GPS, không dùng để phân tích lại |
| **Tự nhắc khi đến giai đoạn mới** | Thông báo điện thoại (8 giờ sáng) | Cần bật thông báo ở Tài khoản; mỗi mốc nhắc 1 lần |
| Chia sẻ ảnh 9:16 / 1:1, link công khai | Kết quả → Chia sẻ ảnh | Nhà vườn có logo + SĐT |
| Vườn của tôi | Thanh dưới → Vườn | |
| Mua lượt (VietQR) | Tài khoản → Mua lượt | Gói, giá do quản trị chỉnh |
| **Nhập mã quà tặng** | Tài khoản, Mua lượt | |
| **Lịch sử lượt** (mua / dùng / hoàn / tặng) | Tài khoản → Lịch sử lượt | |
| **Thông báo chung** (khuyến mãi, bảo trì) | Trang chủ | Quản trị bật / tắt |
| Thông báo khi xong (Web Push, Zalo) | Tài khoản → Thông báo | |
| Quyền riêng tư: đồng ý dùng ảnh, xóa tài khoản (xóa mềm) | Tài khoản | |

## Nghệ nhân (`/admin`, vai trò `artisan` — admin gán ở Người dùng)

| Trang | Chức năng |
|---|---|
| Chấm điểm | Ảnh kết quả (ảnh gốc · bố cục thiết kế · ảnh AI) và phương án thiết kế (bản vẽ): chấm 1–10 từng tiêu chí, lỗi loại thẳng, nhận xét, Đạt / Không đạt / Bỏ qua; điểm AI hiện sau khi chấm |
| Bộ luật & thông số | 4 bộ: luật tạo dáng & tỉ lệ, dáng & thế Việt, loài cây, bảng chấm & ngưỡng — sửa bằng form tiếng Việt, kiểm hợp lệ ngay, lưu bản mới kèm ghi chú, áp dụng / quay lại bản cũ |
| Thống kê chấm | Tỉ lệ đạt ảnh (Cổng 2 ≥ 70%) và thiết kế (Cổng 1), điểm theo tiêu chí, lỗi hay gặp, độ khớp với AI chấm |

## Quản trị (`/admin`, tối ưu máy tính, co về điện thoại)

| Nhóm | Trang | Chức năng |
|---|---|---|
| Tổng quan | Bảng điều khiển | 12 chỉ số so kỳ trước, biểu đồ phiên / doanh thu–chi phí, phễu, phiên lỗi |
| Vận hành | Phiên thiết kế | Lọc, tìm (mã phiên, email, mã lỗi), chi tiết pipeline / ảnh (kể cả ảnh xem thử) / phương án, chạy lại miễn phí, hoàn lượt, dừng phiên treo, **xuất Excel** |
| | Phản hồi | Đánh giá của người dùng, link tới phiên |
| Khách hàng | Người dùng | Hồ sơ, sổ lượt, thanh toán, đổi vai trò, cộng/trừ lượt có lý do, khóa, tặng lượt hàng loạt, **xuất Excel** |
| | Thanh toán | Đối soát, xác nhận tay theo mã sao kê, hủy đơn, **xuất Excel** |
| | **Mã quà tặng** | Tạo mã (tự sinh hoặc đặt tên), số lượt, giới hạn người dùng, hạn dùng, bật/tắt, xem ai đã dùng |
| | **Gửi thông báo** | Web Push theo nhóm: tất cả, nhà vườn, đã mua, chưa mua, không dùng 30 ngày, hết lượt; xem trước, lịch sử gửi |
| AI | Chế độ AI | Chi phí (Tiêu chuẩn / Tiết kiệm), phân tích (model riêng / API), **tách nền trước khi phân tích (bật / tắt)**, **ảnh giai đoạn (AI / dựng từ ảnh kết quả)**, thiết kế (API / bộ luật); chi tiết phiên có ảnh đã tách + phác họa + ảnh ghép S4 |
| | Chi phí AI | Theo ngày, theo bước, tỉ trọng |
| | Prompt | Phiên bản, kích hoạt, hiệu quả từng phiên bản |
| | Gán nhãn | Bộ dữ liệu YOLO-seg 3 lớp, cọ / tẩy / khoanh vùng |
| | Danh mục loài & thế | Sửa tên, tốc độ lớn, mô tả cho model; ảnh tham chiếu loài |
| Hệ thống | **Cấu hình vận hành** | **Tạm dừng** phân tích / tạo ảnh + câu thông báo, **thông báo chung** trang chủ, lượt tặng khi đăng ký, giới hạn phân tích/ngày, tỉ giá; **gói bán** (giá, lượt, mô tả, bật/tắt) |
| | Sức khỏe hệ thống | Worker, hàng đợi, phiên treo, lỗi & độ trễ 24 giờ, cấu hình AI thực tế |
| | Nhật ký quản trị | Mọi thao tác thay đổi dữ liệu, không sửa / xóa được |

## Chưa làm (cần quyết định hoặc dữ liệu)
- Model riêng YOLO-seg: cần 300–500 ảnh phôi đã gán nhãn (`packages/pipeline/tools/seg/README.md`).
- Thư viện hướng dẫn chăm (`rules/care_guide.yaml`) và bộ thiết kế bằng luật: cần nghệ nhân duyệt.
- Zalo ZNS cho nhắc việc / thông báo hàng loạt: ZNS chỉ dùng mẫu tin giao dịch đã duyệt, cần đăng ký thêm mẫu.
