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
| **Xem kiểu tranh**: Ảnh / Bút chì / Thủy mặc cho cả 5 giai đoạn | Kết quả (nút trên ảnh) | Dựng trên máy chủ, không tốn lượt, lưu lại cho lần sau |
| **Video tua nhanh** phôi → dáng hoàn chỉnh (720×1280, ~10 giây, MP4) | Chia sẻ → Tạo video tua nhanh | Worker dựng bằng ffmpeg, không tốn API; không có ffmpeg thì ra ảnh động WebP |
| **Bản vẽ kỹ thuật** (đánh số cành, chỗ quấn dây, mũi tên uốn, bảng cỡ dây + ô đánh dấu) | Kết quả → Bản vẽ kỹ thuật | In / Lưu PDF, mang ra vườn |
| **Phiếu tập vẽ** (phác họa phôi mờ trên lưới ô) | Kết quả → Phiếu tập vẽ | In ra vẽ tay. Đọc nét vẽ tay bằng AI: chờ API |
| **Đặt vào phòng / xem qua camera**: cây tương lai đã tách nền đặt lên ảnh phòng, sân hoặc camera trực tiếp; kéo, chụm hai ngón đổi cỡ; đế đôn gỗ / kệ đá; lưu ảnh | Kết quả → Đặt vào phòng | Tách nền trên worker (ISNet), ghép trên điện thoại |
| **Mốc nhật ký có thưởng** 1 / 3 / 6 tháng (chụp sớm 1 tuần – muộn 3 tuần vẫn tính) | Kết quả → Nhật ký cây | Mỗi mốc tặng một lần, số lượt chỉnh ở Cấu hình vận hành |
| **Dự đoán và thực tế**: ảnh giai đoạn lẽ ra đang tới cạnh ảnh cây thật mới nhất, chấm độ giống 1–5 | Kết quả → Nhật ký cây | Điểm lưu theo phiên — thước đo chất lượng AI theo thời gian |
| **Chọn dáng đẹp**: chạm / quẹt chọn một trong hai phương án của cùng một phôi | Tiện ích → Chọn dáng đẹp | Chỉ dùng phôi chủ đã chia sẻ công khai; không chấm phôi của mình |
| **Thử thách phôi**: cùng một phôi, tự thiết kế bài dự thi (bắt đầu trống), bầu một phiếu (đổi được), đang mở thì ẩn số phiếu | Tiện ích → Thử thách phôi | Quản trị tạo ở Thử thách phôi; phôi phải do quản trị / nghệ nhân tải lên |
| **Bậc tay nghề** Học trò → Thợ → Nghệ nhân | Tài khoản | Tính từ số thiết kế, ảnh nhật ký, lượt chọn dáng, phiếu thử thách |
| **Sổ cây**: mã QR, trang công khai lịch sử (bật / tắt), chuyển chủ bằng mã nhận cây (7 ngày), báo mất | Kết quả → Sổ cây; nhận cây ở Vườn | Chủ mới nhận cả ảnh, lộ trình, nhật ký; cây báo mất không chuyển được, trang sổ hiện cảnh báo |
| **Chợ phôi**: tin đăng kèm dáng tương lai (ảnh S4 + bản vẽ các phương án), lọc loài / tỉnh / loại, tìm kiếm; liên hệ Zalo / gọi | Tiện ích → Chợ phôi; Kết quả → Đăng bán | Không giữ tiền (chỉ kết nối). Chưa có gói: tối đa 3 tin đang hiện. Tin mới có ảnh được so dấu vân thân với cây báo mất |
| **Thẻ QR treo chậu** (4 thẻ / A4) | Tin của tôi → Thẻ QR; trang tin | Quét ra trang tin công khai `/tin/{mã}` |
| **Gói Nhà vườn tháng** (690.000 đ / 30 ngày, 20 lượt) | Mua lượt | Đăng tin không giới hạn, 3 tin nổi bật, xem thử AI 10 lần / phiên; giá, số lượt, số tin chỉnh ở quản trị |
| **Chậu hợp dáng** từ xưởng đối tác | Kết quả → Chậu hợp dáng | Cùng dáng chậu thiết kế, dài ≈ 2/3 chiều cao cây; link mua có mã giới thiệu |
| **Giá thị trường**: giá mỗi cm gốc theo loài, cả nước và từng miền | Tiện ích → Giá thị trường | Chỉ công bố khi ≥ 5 tin (tránh lộ giá một người bán) |
| **Hỏi nghệ nhân**: chọn cây, hỏi đích danh hoặc ai rảnh, trả 2 lượt; nhận đánh giá (ổn / sửa / làm lại) + lời khuyên; chấm 1–5 sao | Kết quả → Hỏi nghệ nhân; Tiện ích | Quá 72 giờ chưa trả lời: tự hoàn lượt (worker, mỗi giờ) |
| **Trang công khai** nhà vườn / nghệ nhân `/nguoi/{tên}`: giới thiệu, chuyên môn, tin đang bán, Zalo, số lần góp ý + điểm | Tài khoản → Trang công khai | Chỉ nhà vườn, nghệ nhân |
| **Chăm hộ / nuôi hộ**: gửi cây cho một nhà vườn; nhà vườn nhận, gửi ảnh + ghi chú; ảnh vào nhật ký cây | Trang nhà vườn → Gửi chăm hộ; Tiện ích → Chăm hộ, nuôi hộ | Số điện thoại hai bên chỉ hiện sau khi nhà vườn nhận. Tiền công tự thỏa thuận |
| **Lá có bệnh?** chụp gần lá + chọn dấu hiệu → sâu bệnh có thể gặp, xử lý ngay, phòng lần sau | Tiện ích → Lá có bệnh? | Kết quả tra bảng có ngay; AI xem ảnh rồi cập nhật nhưng chỉ được chọn trong bảng sâu bệnh (cách xử lý lấy từ bảng). 5 lần / ngày |
| **Hỏi cách chăm** bằng giọng nói hoặc gõ; nghe đọc to câu trả lời | Tiện ích → Hỏi cách chăm | Trả lời ngay từ bảng loài; AI (model rẻ) trả lời theo cây, 20 câu / ngày. Nhận giọng nói + đọc to dùng sẵn của trình duyệt (miễn phí) |
| **Đọc to hướng dẫn** giai đoạn | Kết quả, dưới thẻ hướng dẫn | Ẩn nếu máy không hỗ trợ |
| **Thời tiết & việc cần làm** 3 ngày theo tỉnh; **thông báo 6:30** khi sắp mưa to / nắng nóng / rét / gió mạnh | Tiện ích → Thời tiết | Dự báo Open-Meteo (miễn phí); mỗi tỉnh, ngày, loại chỉ báo một lần; ngưỡng ở bộ luật "Sâu bệnh, thời tiết" |
| **Tờ hồ sơ cây** in làm quà (ảnh, lịch sử, mã QR) | Trang sổ cây → In tờ hồ sơ | |
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
| **Thử thách phôi** (tạo, xóa) · **Chậu đối tác** (thêm, bật / tắt, xóa) | Quản trị → Khách hàng | Thao tác ghi nhật ký quản trị |
| **Hỏi đáp** (nghệ nhân): nhận câu hỏi, xem ảnh phôi + bản vẽ, trả lời | Quản trị → nhóm Nghệ nhân | Nghệ nhân chỉ thấy câu chưa ai nhận hoặc đã nhận |
| **Bộ luật Sâu bệnh, thời tiết** (sửa trên giao diện) · **Trợ lý chăm cây: AI / Tra bảng** | Bộ luật & thông số; Chế độ AI | Tra bảng: không tốn API |
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
- Đấu giá (C8): cần tìm hiểu pháp lý đấu giá trực tuyến trước.
- Zalo Mini App (F2): cần đăng ký và duyệt trên Zalo.
- Phiếu tập vẽ (A3): phần AI đọc nét vẽ tay đang chờ (đã có phần in).
- Dịch vụ in đặt hàng (F4): cần đối tác in; hiện có trang in tờ hồ sơ, tranh, bản vẽ.
- Bảng sâu bệnh: đốm lá, cháy nắng chưa có nguồn đã kiểm — nghệ nhân duyệt (xem `rules/SOURCES.md`).
