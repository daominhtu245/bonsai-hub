# Hướng dẫn test chức năng (dữ liệu thật)

Nhiều trang mới **trống khi mới cài** vì chưa có dữ liệu: chợ chưa có tin, chưa ai là nghệ nhân, chưa có thử thách…
Đó không phải lỗi. Tài liệu này đi theo **đúng thứ tự tạo dữ liệu**: làm bước trước thì trang sau mới có nội dung.

Ký hiệu: ☐ = việc cần làm · ✅ = kết quả đúng phải thấy · ⚠️ = lưu ý.

---

## 0. Chuẩn bị

### 0.1. Tài khoản cần có (5 người)

| Mã | Vai trò | Dùng để |
|---|---|---|
| **QT** | Quản trị | tạo thử thách, chậu đối tác, đổi vai trò, cộng lượt, xem chi phí |
| **A** | Người chơi | luồng chính: chụp phôi → kết quả → nhật ký, sổ cây, hỏi nghệ nhân |
| **B** | Người chơi thứ hai | mua cây (nhận chuyển chủ), bình chọn, chọn dáng |
| **V** | Nhà vườn | đăng tin bán, gói tháng, nhận chăm hộ |
| **N** | Nghệ nhân | trả lời câu hỏi, chấm ảnh, sửa bộ luật |

- **Máy local** (`APP_ENV=dev`, `VITE_DEV_LOGIN=true`): ở màn Đăng nhập có mục **Môi trường dev**, gõ email bất kỳ (vd. `a@test.vn`). Mỗi email là một tài khoản.
- **Server**: đăng nhập Google bằng 5 tài khoản Google khác nhau (hoặc nhờ người quen). Email quản trị phải có trong `ADMIN_EMAILS` ở `.env`.
- Mở mỗi tài khoản ở một **cửa sổ ẩn danh / trình duyệt khác** để không bị đăng xuất lẫn nhau.

### 0.2. Gán vai trò và lượt (tài khoản QT)

☐ QT vào `/admin` → **Khách hàng → Người dùng** → mở từng người:
- V: đổi vai trò **Nhà vườn**.
- N: đổi vai trò **Nghệ nhân**.
- A, B: **Cộng / trừ lượt** mỗi người +10 lượt (để test tạo ảnh, hỏi nghệ nhân).

✅ Người dùng được đổi vai trò thấy nhãn mới ở **Tài khoản** sau khi tải lại trang.

### 0.3. Bật tính năng cần test
☐ QT vào **Hệ thống → Tính năng**. Mỗi tính năng có 3 trạng thái:
- **Mở**: mọi người dùng thấy.
- **Nội bộ**: chỉ quản trị, nghệ nhân và các email trong ô **Người thử** (bên phải) thấy — dùng để test trước khi mở thật.
- **Tắt**: ẩn với tất cả (kể cả quản trị).

✅ Tính năng đang Tắt: mục biến mất khỏi Tiện ích / màn Kết quả; mở thẳng link thì hiện "Tính năng sắp mở".
⚠️ Người dùng thấy thay đổi khi mở lại app. Test xong nhớ chuyển những tính năng chưa muốn công khai về **Nội bộ** hoặc **Tắt**.

### 0.4. Chế độ AI khi chưa nạp tiền API

☐ QT vào **Chế độ AI** → **Trợ lý chăm cây: Tra bảng**.
⚠️ Chưa nạp tiền OpenAI mà để "AI" thì vẫn chạy (tự quay về tra bảng) nhưng log worker báo lỗi 429. Phân tích phôi / tạo ảnh **cần API thật** — nếu chưa nạp, dùng các phiên đã có sẵn trong Vườn.

### 0.5. Hồ sơ cá nhân (để các tiện ích tự điền)

☐ A, B, V: **Tài khoản → Hồ sơ**: tên, số điện thoại (định dạng `0909 123 456`), **Tỉnh, thành**, **Năm sinh**.
✅ Mai kịp Tết, Thời tiết, Cây hợp mệnh tự chọn đúng tỉnh / năm sinh; Chợ phôi tự điền SĐT khi đăng tin.

---

## 1. Luồng chính: phôi → kết quả (A)

| # | Làm | Kết quả đúng |
|---|---|---|
| 1 | Trang chủ → **Phân tích phôi mới**, chụp 1–3 ảnh, nhập loài + chiều cao thật (cm) | Ảnh mờ / tối bị báo chụp lại |
| 2 | Chờ màn **Đang phân tích** | Thấy ảnh đã tách nền; xong chuyển sang **Chọn thế** với 2–3 bản vẽ |
| 3 | (tuỳ chọn) **Tự thiết kế** → Hoàn tất → Lưu | Phương án "Thiết kế của bạn" xuất hiện |
| 4 | Chọn phương án → **Tạo ảnh tương lai** (trừ 1 lượt) | Màn tiến độ 3–5 phút → **Kết quả** S0–S4 + hướng dẫn |

⚠️ **Chiều cao thật** quan trọng: không nhập thì Tính dây, Định giá, Chậu hợp dáng chỉ ước lượng hoặc trống.
⚠️ Lỗi sau khi trừ lượt → tự hoàn lượt (xem **Tài khoản → Lịch sử lượt**).

Ghi lại **mã phiên** (phần cuối URL `/ket-qua/<mã>`) — các bước sau dùng.

---

## 2. Trên màn Kết quả (A)

| Chức năng | Ở đâu | Làm | Kết quả đúng |
|---|---|---|---|
| Kiểu tranh | Nút **Ảnh / Bút chì / Thủy mặc** trên ảnh | Bấm Bút chì, đổi giai đoạn S0…S4 | Lần đầu chờ 1–3 giây, sau đó mỗi giai đoạn hiện tranh |
| Đọc to | Dưới thẻ hướng dẫn | **Đọc to hướng dẫn** | Máy đọc tiếng Việt. Máy không hỗ trợ thì **không có nút** (iPhone cũ, một số trình duyệt máy tính) |
| Tính dây / Ghép cành / Định giá / Chậu hợp dáng | Các mục gập "Công cụ cho cây này" | Mở từng mục | Có bảng dây, giá; **Chậu hợp dáng trống cho tới khi làm bước 5.2** |
| Sổ cây | Mục **Sổ cây (mã QR)** | Mở mục | Hiện mã QR + mã 8 ký tự (xem bước 4) |
| Bản vẽ kỹ thuật | **Làm thêm với cây này** | Mở → In / Lưu PDF | Ảnh phôi có số 1, 2, 3… trùng số trong bảng; cắt màu đỏ, quấn dây vạch chéo |
| Đặt vào phòng | như trên | Chờ "Đang tách cây khỏi nền…" (5–20 giây) → **Chọn ảnh phòng** → kéo, chụm 2 ngón, chọn đế → **Lưu ảnh** | Ảnh ghép có nhãn "Minh họa". Tab **Camera** cần cho phép quyền camera và **https** (trên server) |
| Phiếu tập vẽ | như trên | Mở → In | Phác họa phôi mờ trên lưới ô |
| Hỏi nghệ nhân / Đăng bán | như trên | xem bước 6 và 5 | |
| Chia sẻ → Video | **Chia sẻ ảnh** → **Tạo video tua nhanh** | Bấm, chờ "Đang dựng video…" (5–30 giây) | Nút đổi thành **Chia sẻ video tua nhanh**; điện thoại mở bảng chia sẻ, máy tính tải file MP4 |

⚠️ Ảnh / video dùng link ký sẵn của kho ảnh. Trên server phải truy cập được kho ảnh (R2 hoặc `S3_PORT` qua Nginx như `docs/deploy.md`) — nếu ảnh mới tạo **không hiện**, kiểm tra cấu hình kho ảnh trước.

---

## 3. Nhật ký cây, mốc thưởng, dự đoán và thực tế (A)

| # | Làm | Kết quả đúng |
|---|---|---|
| 1 | Kết quả → **Nhật ký cây** → Thêm ảnh cây hôm nay | Ảnh hiện sau vài giây (đã xóa vị trí GPS) |
| 2 | Xem 3 ô **1 tháng / 3 tháng / 6 tháng** | Hiện ngày mở mốc; mốc đang mở có chữ "Chụp ngay +1 lượt" |
| 3 | Chụp khi mốc đang mở | Báo **"Đúng mốc: +1 lượt"**, ô đổi thành "Đã nhận"; Lịch sử lượt có "Thưởng nhật ký mốc 1 tháng" |
| 4 | Thẻ **Dự đoán và thực tế** dưới nhật ký | So ảnh minh họa giai đoạn với ảnh thật mới nhất, chấm 1–5 |

⚠️ Mốc tính từ ngày làm xong kết quả: mốc 1 tháng mở từ **ngày 23 đến ngày 51**. Muốn test ngay, nhờ người kỹ thuật lùi `finished_at` của phiên (máy local):
`docker exec bonsai-postgres-1 psql -U bonsai -c "update design_jobs set finished_at = now() - interval '30 days' where id = '<mã phiên>'"`

---

## 4. Sổ cây, chuyển chủ, báo mất (A → B)

| # | Ai | Làm | Kết quả đúng |
|---|---|---|---|
| 1 | A | Kết quả → **Sổ cây** → bật **Công khai lịch sử cây** | — |
| 2 | ai cũng được | Quét QR hoặc mở link `…/so-cay/<mã>` (cả khi chưa đăng nhập) | Trang sổ cây: ảnh, các lần thiết kế, ảnh nhật ký; **In tờ hồ sơ** ở cuối |
| 3 | A | **Chuyển cây cho chủ mới** | Hiện **Mã nhận cây** (hết hạn sau 7 ngày) |
| 4 | B | **Vườn** → ô **Mã nhận cây** (cuối trang) → nhập mã → **Nhận cây** | Cây xuất hiện trong vườn B, mở được kết quả cũ; A không còn thấy cây |
| 5 | B | Sổ cây → **Báo mất cây** | Trang sổ hiện khung đỏ "đã được chủ báo mất"; nút chuyển chủ bị khóa |

---

## 5. Chợ phôi, nhà vườn (V, QT, B)

### 5.1. Đăng tin (V)
| # | Làm | Kết quả đúng |
|---|---|---|
| 1 | V chụp một phôi qua luồng 1 (để tin có **dáng tương lai**) | — |
| 2 | Kết quả → **Đăng bán** (hoặc Tiện ích → Chợ phôi → Đăng tin bán) | Form điền sẵn tên cây, SĐT, tỉnh |
| 3 | Nhập giá kiểu `3.000.000`, gốc `10`, chọn ảnh hoặc để ảnh phôi → **Đăng tin** | Tin hiện ở **Tin của tôi** và **Chợ phôi** |
| 4 | Mở tin `…/tin/<mã>` (không cần đăng nhập) | Ảnh, giá, **Dáng có thể tạo** (ảnh kết quả + bản vẽ), nút **Nhắn Zalo / Gọi** |
| 5 | **In thẻ QR treo chậu** | 4 thẻ / trang A4; quét thẻ mở đúng trang tin |
| 6 | Đăng tới tin thứ 4 | Báo hết tin miễn phí (3 tin) |

### 5.2. Gói Nhà vườn tháng
☐ V → **Mua lượt** → gói **Nhà vườn tháng** → chuyển khoản theo VietQR (hoặc QT xác nhận đã trả ở **Thanh toán**).
✅ Tin của tôi hiện "Gói Nhà vườn tháng đến …"; đăng được tin thứ 4; bật **Nổi bật** tối đa 3 tin (tin nổi bật lên đầu Chợ phôi).

### 5.3. Chậu đối tác (QT)
☐ QT → **Chậu đối tác → Thêm chậu**: dáng **Bầu dục**, màu **Nâu mộc**, dài ~2/3 chiều cao cây A (vd. cây 45 cm → 30 cm), link `https://…`.
✅ A mở Kết quả → **Chậu hợp dáng** thấy chậu này (dáng chậu theo thiết kế của phương án đã chọn).

### 5.4. Giá thị trường
⚠️ Cần **ít nhất 5 tin cùng loài có giá và cỡ gốc** (đang bán hoặc đã bán). Ít hơn thì trang báo "Chưa đủ tin đăng" — đúng thiết kế.

### 5.5. Dò cây báo mất
☐ Sau bước 4.5 (cây đã báo mất), V đăng tin dùng **chính ảnh phôi đó** (tải lại cùng file).
✅ B (chủ cây báo mất) nhận thông báo "Có tin đăng giống cây bạn báo mất" (cần **bật thông báo** ở Tài khoản); quản trị nhận Telegram.
⚠️ Chỉ khớp khi ảnh gần giống (cùng góc chụp). Ảnh chụp lại góc khác sẽ không báo — đây là giới hạn đã biết.

---

## 6. Nghệ nhân, hỏi đáp (N, A)

| # | Ai | Làm | Kết quả đúng |
|---|---|---|---|
| 1 | N | **Tài khoản → Trang công khai**: tên trang (vd. `ong-tu`), chuyên môn, giới thiệu → Lưu | **Tiện ích → Hỏi nghệ nhân** hiện N trong danh sách. ⚠️ Chưa lưu trang thì danh sách trống |
| 2 | A | Kết quả → **Hỏi nghệ nhân** (hoặc trang N → Hỏi nghệ nhân) → viết câu hỏi ≥ 10 chữ → Gửi | Trừ 2 lượt; **Câu hỏi của tôi**: "Chờ trả lời" |
| 3 | N | `/admin` → **Hỏi đáp** → **Nhận câu hỏi** → chọn đánh giá → viết lời khuyên ≥ 20 chữ → Gửi | Câu chuyển sang tab "Đã trả lời" |
| 4 | A | Mở câu hỏi | Thấy đánh giá + lời khuyên; chấm sao |
| 5 | — | Câu hỏi để quá **72 giờ** không ai trả lời | Tự hoàn 2 lượt ("Hoàn lượt hỏi nghệ nhân") |

---

## 7. Chăm hộ / nuôi hộ (A, V)

| # | Ai | Làm | Kết quả đúng |
|---|---|---|---|
| 1 | V | Tài khoản → **Trang công khai** (vd. `vuon-ba-la`) → Lưu | Trang `…/nguoi/vuon-ba-la` có nút **Gửi chăm hộ**, tin đang bán, Zalo |
| 2 | A | Tiện ích → **Chăm hộ, nuôi hộ** → **Gửi cây cho nhà vườn** → chọn V trong danh bạ (hoặc mở trang V → Gửi chăm hộ) → chọn Chăm hộ / Nuôi hộ, cây, ngày → Gửi | **Tiện ích → Chăm hộ, nuôi hộ**: "Chờ nhà vườn nhận" |
| 3 | V | Tiện ích → Chăm hộ, nuôi hộ → mở yêu cầu → **Nhận chăm** | Hai bên thấy số điện thoại / Zalo của nhau |
| 4 | V | **Gửi ảnh** + ghi chú | A thấy ảnh trong yêu cầu **và** trong Nhật ký cây |
| 5 | A hoặc V | **Đã xong** | Trạng thái "Đã xong" |

⚠️ Trang công khai chỉ dành cho **Nhà vườn / Nghệ nhân** — người chơi không thấy mục này.

---

## 8. Cộng đồng (QT, A, B)

### 8.1. Chọn dáng đẹp
⚠️ Chỉ lấy phôi **đã chia sẻ công khai** của người **khác**. Chuẩn bị: A vào Kết quả → **Chia sẻ ảnh** (tạo link) cho ít nhất một cây.
☐ B → Tiện ích → **Chọn dáng đẹp** → chạm (hoặc quẹt) về dáng đẹp hơn.
✅ Mỗi lần chọn chuyển sang cặp khác; hết cặp báo "Đã hết cặp để chọn".

### 8.2. Thử thách phôi
| # | Ai | Làm | Kết quả đúng |
|---|---|---|---|
| 1 | QT | Dùng **chính tài khoản QT** chụp + phân tích một phôi (luồng 1, bước 1–2), copy mã phiên ở URL `/chon/<mã>` | ⚠️ Phôi của người chơi bị từ chối (ảnh sẽ công khai) |
| 2 | QT | `/admin` → **Thử thách phôi → Tạo**: tên, mã phiên, giải, bắt đầu sau 0 ngày, kéo dài 21 ngày | Thử thách "Đang mở" |
| 3 | A, B | Tiện ích → **Thử thách phôi** → mở → **Tham gia thiết kế** → thiết kế (bắt đầu trống) → Hoàn tất → **Gửi bài dự thi** | Bài hiện trong danh sách (đang mở: không hiện số phiếu) |
| 4 | A | **Bầu** bài của B (không bầu được bài mình) | Nút đổi "Đã bầu"; bấm bài khác = đổi phiếu |
| 5 | — | Sau ngày kết thúc | Xếp hạng + số phiếu |

### 8.3. Bậc tay nghề
☐ A → Tài khoản: thanh tiến độ tới bậc **Thợ** (3 thiết kế, 5 ảnh nhật ký, 20 lượt chọn dáng).

---

## 9. Trợ lý chăm cây (A)

| Chức năng | Làm | Kết quả đúng |
|---|---|---|
| **Lá có bệnh?** | Chụp gần lá **và/hoặc** chọn dấu hiệu → Xem bệnh gì | Có kết quả ngay (tra bảng); chế độ AI thì vài giây sau cập nhật theo ảnh. Tối đa 5 lần / ngày |
| **Hỏi cách chăm** | Chọn cây (nên chọn để trả lời đúng loài) → bấm micro nói hoặc gõ "Khi nào tuốt lá?" → Gửi | Có câu trả lời ngay + nút **Đọc to**; chế độ AI cập nhật sau. Micro chỉ có trên trình duyệt hỗ trợ (Chrome Android) và cần **https** |
| **Thời tiết** | Chọn tỉnh | 3 ngày tới + cảnh báo nếu có mưa to / nắng nóng / rét / gió mạnh; không có thì "thời tiết bình thường" |
| Thông báo thời tiết | Bật thông báo ở Tài khoản, có tỉnh + ít nhất 1 cây | Nhận lúc **6:30** khi có cảnh báo; mỗi loại chỉ báo 1 lần |
| Mai kịp Tết, Cây hợp mệnh, Cấp cứu cây | Như trước | |

---

## 10. Nghệ nhân sửa bộ luật (N)

☐ N → `/admin` → **Bộ luật & thông số** → tab **Sâu bệnh, thời tiết** → sửa một ngưỡng (vd. mưa to 50 → 40 mm) → ghi chú → Lưu → **Áp dụng**.
✅ Trang Thời tiết / thông báo dùng ngưỡng mới; quay lại bản cũ được.
⚠️ Bảng sâu bệnh có 2 mục (đốm lá, cháy nắng) chưa có nguồn đã kiểm — nhờ nghệ nhân duyệt.

---

## 11. "Ấn vào không thấy gì" — tra nhanh

| Trang | Vì sao trống | Cách có dữ liệu |
|---|---|---|
| Chợ phôi, Giá thị trường | Chưa có tin / chưa đủ 5 tin | Bước 5.1 |
| Hỏi nghệ nhân (danh sách) | Chưa nghệ nhân nào lưu trang công khai | Bước 0.2 + 6.1 |
| Chăm hộ, nuôi hộ | Chưa có yêu cầu; danh bạ trống vì chưa nhà vườn nào lưu trang công khai | Bước 7.1 |
| Mục / trang biến mất, hoặc "Tính năng sắp mở" | Tính năng đang Tắt hoặc Nội bộ | Bước 0.3 |
| Thử thách phôi | Quản trị chưa tạo | Bước 8.2 |
| Chọn dáng đẹp | Chưa ai (khác mình) chia sẻ công khai | Bước 8.1 |
| Chậu hợp dáng | Chưa có chậu đối tác | Bước 5.3 |
| Trang công khai (Tài khoản) | Tài khoản là người chơi | Bước 0.2 |
| Đặt vào phòng: "Đang tách cây…" mãi | Worker chưa chạy / thiếu model tách nền | `docker ps` xem `worker`; log `docker logs bonsai-worker-1` |
| Video: "Đang dựng video…" mãi | Worker không chạy hàng `render` | như trên |
| Ảnh mới tạo không hiện | Kho ảnh không truy cập được | Kiểm tra `S3_*` / R2 trong `.env` (docs/deploy.md) |
| Micro / Camera không có | Trình duyệt không hỗ trợ hoặc không phải https | Dùng Chrome Android trên domain https |
| Không nhận thông báo | Chưa bật thông báo / chưa có VAPID | Tài khoản → Thông báo; `VAPID_*` trong `.env` |

## 12. Kiểm tra phía quản trị sau khi test

- **Báo vi phạm**: tài khoản B mở một tin của A (`/tin/{mã}`) → **Báo vi phạm** → chọn "Nghi lừa đảo" → Gửi. Quản trị: thanh bên mục **Báo vi phạm** có số đỏ, Bảng điều khiển có thẻ "Báo vi phạm chờ xử lý" → mở → **Ẩn nội dung** (nhập lý do) → tin biến mất khỏi chợ, A nhận thông báo, số đỏ mất.
- **Tìm nhanh**: nhấn `/`, gõ email của A → chọn gợi ý → mở hồ sơ A; gõ mã tin, nội dung chuyển khoản (BONSAI…) cũng ra.
- **Hồ sơ người dùng**: tab Cây / Tin đăng / Nghệ nhân & chăm hộ / Bị báo có dữ liệu của A; thử **Ghi chú nội bộ** (lưu, tải lại trang vẫn còn) và **Nhắn riêng** (A nhận thông báo nếu đã bật).
- **Phản hồi**: A bấm "Chưa đúng" ở màn Kết quả → Quản trị → Phản hồi → **Đã xử lý** + ghi đã làm gì → thẻ biến khỏi danh sách "chưa xử lý".

- **Cộng đồng & chợ → Kiểm duyệt & dịch vụ**: ẩn thử một tin (tin biến mất khỏi chợ), gỡ thử một trang công khai; tab Hỏi nghệ nhân xem câu sắp quá hạn, thử **Hoàn lượt ngay**.
- **Cộng đồng & chợ → Trợ lý chăm cây**: bật "Chỉ những lượt chưa trả lời được" → bổ sung bảng ở Bộ luật.
- **Hệ thống → Tính năng**: cột "lượt dùng / 30 ngày" tăng sau khi test.
- **Hệ thống → Cấu hình vận hành → Thông số tính năng**: đổi số lượt hỏi nghệ nhân 2 → 3, kiểm tra nút "Gửi câu hỏi · 3 lượt".

- **Chi phí AI**: các bước mới H1 (đoán bệnh), Q1 (hỏi đáp) có dòng chi phí riêng; chế độ Tra bảng thì không có.
- **Nhật ký quản trị**: có đổi vai trò, tạo thử thách, thêm chậu.
- **Lịch sử lượt** của A: tạo ảnh, thưởng nhật ký, hỏi nghệ nhân (và hoàn lượt nếu có).
