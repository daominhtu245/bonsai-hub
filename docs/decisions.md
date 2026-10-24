# Quyết định khi triển khai (lệch hoặc bổ sung so với tài liệu gốc)

Tài liệu kỹ thuật vẫn là nguồn chính. Đây là những chỗ code chọn khác, hoặc tài liệu chưa nói, kèm lý do.

## Pipeline
| # | Quyết định | Lý do |
|---|---|---|
| 1 | Mọi tọa độ px tính trên **ảnh mặt tiền người dùng chọn**; mặt AI gợi ý chỉ đề xuất, người dùng bấm "Phân tích lại với mặt này" (miễn phí) | Bản vẽ, P3 và kiểm tra CV cần chung một hệ tọa độ |
| 2 | P1 thêm `end_px` cho cành, lỗi `not_a_tree`; P4 bỏ `total` (code tính theo trọng số), thêm `summary_en` | Vẽ cành cần điểm cuối; điểm tổng không để model tự cộng; P2b cần mô tả ảnh cuối |
| 3 | Rule engine kiểm luật cứng P2: thế khả thi theo dáng thân, mọi cành phải giữ/cắt, không cành đối, cành 1 ở 0,25–0,4 (± 0,12) chiều cao **mục tiêu** | Luật bonsai do code đảm bảo, không để LLM tự do |
| 4 | P4 chỉ gọi VLM cho ảnh qua kiểm tra CV; nền lệch khi ≥ 2/4 góc ảnh vượt 0,12 | Tiết kiệm chi phí; tán mới có thể che 1 góc |
| 5 | P3c sinh **1 ảnh**/vòng, tối đa 2 vòng; vẫn chưa đạt → trả ảnh tốt nhất + "Độ tin cậy thấp" | Khớp chi phí §6 (P3c ≈ 1 ảnh) |
| 6 | **P2b chạy sau khi chọn S4** (không song song B1–B2) | Prompt P2b cần mô tả ảnh cuối từ P4 |
| 7 | Kiểm tra "cành đã cắt mọc lại" mới **ghi số liệu** (`cut_region_change`), chưa dùng để loại | Tán mới mọc gần làm vùng này đổi; cần ảnh thật để chọn ngưỡng |
| 8 | Giai đoạn S1–S3 hỏng sau 2 lần sinh lại → hiển thị bản vẽ thay ảnh (`plan.fallback = "sketch"`) | Theo bảng rủi ro §8 |
| 9 | Vùng khí hậu hỏi ở màn 03 (không bắt buộc), mặc định miền Nam | P2b cần vùng; chưa có trong mockup |
| 10 | Khi chưa có trọng số YOLO-seg: A2 dùng số đo P1 (`cv_fallback`), tắt kiểm tra IoU thân / diện tích thân | Theo §3 (mask rỗng → số đo P1) |

## Lượt và thanh toán
| # | Quyết định | Lý do |
|---|---|---|
| 11 | Mọi lỗi sau khi trừ lượt (kể cả phần lộ trình khi S4 đã có) → hoàn lượt | Quy ước CLAUDE.md |
| 12 | Thử lại sau lỗi phiên B: trừ lượt mới với `ref_id = <job>#n`, hoàn đúng lần trừ đó (`design_jobs.charge_ref`) | Sổ lượt chỉ ghi thêm, idempotent theo (user, lý do, ref) |
| 13 | Mã chuyển khoản `BONSAI XXXXX` (bỏ ký tự dễ nhầm); khớp được cả khi ngân hàng bỏ dấu cách/thêm chữ | Nội dung CK từ ngân hàng không chuẩn |
| 14 | Chuyển thiếu tiền: không cộng lượt, lưu `payments.raw`, đơn vẫn chờ (admin xử lý) | Tránh cộng sai |
| 15 | Mua gói nhà vườn tự nâng vai trò `nursery` (được in tên vườn + SĐT lên ảnh chia sẻ) | Mockup Buy/Share |

## Vận hành
| # | Quyết định | Lý do |
|---|---|---|
| 16 | Prompt sửa file mà phiên bản **đã dùng** ở staging/prod → seed không ghi đè, cảnh báo; phải tạo `vN+1` | Kết quả cũ phải truy được đúng prompt |
| 17 | Provider `demo` (LLM + ảnh) chỉ chạy khi `APP_ENV=dev` | Chạy thử giao diện khi chưa có key, không lọt lên prod |
| 18 | S3 local dùng SeaweedFS (MinIO đã ngừng phát hành image) | Phát triển không cần R2 |
| 19 | Giới hạn theo IP qua Redis, lỗi Redis thì cho qua; chỉ tin `CF-Connecting-IP` khi `TRUST_CLOUDFLARE=true` | Chống lạm dụng phiên A nhưng không chặn nhầm; header có thể bị giả |
| 20 | Cảnh báo tỉ lệ lỗi không tính `unusable_photo` | Ảnh xấu là lỗi người dùng, không phải hệ thống |

| 21 | Xóa tài khoản = **xóa mềm** (`users.deleted_at`): chặn đăng nhập, vô hiệu token, ẩn trang chia sẻ, gỡ đăng ký push; dữ liệu giữ nguyên, admin khôi phục (`/admin/users/restore`) | Yêu cầu: chỉ xóa mềm, vẫn giữ |
| 22 | Đồng ý dùng ảnh huấn luyện là **tùy chọn, mặc định tắt**, theo tài khoản; rút lại được | Dữ liệu cá nhân (NĐ 13/2023) |
| 23 | Thông báo chỉ gửi ở các mốc người dùng cần quay lại (bản vẽ xong, ảnh xong, lỗi); chạy task riêng sau mỗi phiên | Lỗi gửi không ảnh hưởng kết quả |
| 24 | Zalo ZNS gửi theo số điện thoại hồ sơ, chỉ khi người dùng bật; refresh token OA xoay vòng lưu trong Redis | Token Zalo OA hết hạn ~25 giờ, refresh token dùng 1 lần |
| 25 | Zoom 200%: timeline S0–S4 cuộn ngang thay vì thu nút dưới 44 px; bảng admin cuộn ngang | Giữ vùng chạm tối thiểu (ui-spec) |
| 26 | Hình minh họa giữ màu bảng sáng ở chế độ tối (`.theme-light`) | Đóng vai ảnh chụp |

| 27 | **Thiết kế lại v2** (22/10/2026): kiểu công cụ chuyên nghiệp — trung tính + một màu nhấn, chỉ Be Vietnam Pro, icon Lucide, bo nhỏ; bỏ hình vẽ hoạt hình, chip tròn, mẹo/chú thích dài; ảnh thật Unsplash; trang chủ = giới thiệu (khách) / bảng điều khiển (đã đăng nhập) | Yêu cầu sản phẩm chuyên nghiệp, ít chữ |
| 28 | Ảnh chia sẻ server cũng theo v2 (nền sáng, chữ sans, biểu tượng thương hiệu); màu nét bản vẽ đồng bộ token v2 | Nhất quán thương hiệu |

| 29 | **Chế độ chi phí AI** (24/10/2026), admin chọn ở `/admin` → Chế độ AI (bảng `app_settings`, áp dụng cho job mới): **Tiêu chuẩn** (mặc định) — LLM chỉ làm P1 + P2 (mức suy nghĩ thấp); 1 ảnh kết quả `medium`, 3 ảnh giai đoạn `low`; bỏ P4 VLM (chỉ kiểm tra CV, sửa tối đa 1 vòng); P2b/P6/P5 thay bằng bộ luật + thư viện `rules/care_guide.yaml`. **Tiết kiệm** — như trên, mọi ảnh `low`, LLM = `LLM_ECONOMY_MODEL`, không sinh lại. Quy trình đầy đủ cũ giữ trong code (`full`) nhưng không mở ở admin | Chạy thử thật: quy trình đầy đủ ≈ $1,23/lượt (14 lời gọi). Hướng dẫn chăm viết sẵn rẻ và đáng tin hơn để LLM viết mỗi lần; **thư viện là bản nháp, cần nghệ nhân duyệt** |
| 30 | P1 và P2 vẫn là 2 lời gọi (không gộp) | Rule engine + segment thân chạy giữa P1 và P2 để tính khung tỉ lệ cho P2 |
| 32 | **Giảm phụ thuộc API ở phiên A** (24/10/2026): kiểm tra chất lượng ảnh trên máy (độ nét, sáng, tương phản, kích thước) trước P1; **model riêng** YOLO-seg 3 lớp (thân / từng cành / rễ) → `local_analysis` dựng `Analysis` cùng schema P1, chưa chắc thì gọi P1; **bộ thiết kế bằng luật** (`rule_designer`) thay P2, luôn qua `validate_design`. Admin chọn: Phân tích (API / Model riêng + API dự phòng — mặc định), Thiết kế (API — mặc định / Bộ luật) | Phiên A miễn phí với người dùng nhưng tốn $0,14–0,21/ảnh. Thử bộ luật trên 5 phân tích thật: thế xếp hạng 1 trùng GPT 5/5, cành giữ trùng 2/5, gần trùng 1/5. Bộ luật cần nghệ nhân duyệt (Cổng 1) trước khi làm mặc định |
| 34 | **Gán nhãn trong app** (`/admin` → Gán nhãn, bảng `seg_labels`) thay CVAT: tải ảnh lên / lấy ảnh phiên đã chạy (có đồng ý) → worker đọc ảnh bằng model chữ rẻ (bước `L1`) → mask nháp SAM hoặc hình học → sửa bằng cọ / tẩy / khoanh vùng → duyệt → `tools/seg/export_labels.py`. Mask tải qua api (cùng origin) để canvas xuất lại được | Không phải cài, học CVAT; dữ liệu nằm cùng hệ thống, xuất lại được khi người dùng rút đồng ý |
| 35 | **Bảng điều khiển quản trị** (25/10/2026) thay trang tab: bố cục máy tính (thanh bên nhóm Tổng quan / Vận hành / Khách hàng / AI / Hệ thống, tìm nhanh mã phiên / email), co về ngăn kéo trên điện thoại. Mục: tổng quan (KPI so kỳ trước, biểu đồ, phễu), phiên (lọc, chi tiết pipeline / ảnh / phương án, chạy lại miễn phí, hoàn lượt, dừng phiên treo), người dùng (hồ sơ, sổ lượt, đổi vai trò, cộng/trừ lượt có lý do, khóa, tặng lượt hàng loạt), thanh toán (đối soát, xác nhận tay theo mã sao kê, hủy), sức khỏe hệ thống, nhật ký quản trị (`admin_audit`), danh mục loài & thế (sửa được, seed không ghi đè), hiệu quả prompt | Vận hành beta cần tra cứu & xử lý sự cố nhanh; mọi thao tác thay đổi dữ liệu đều có dấu vết |
| 36 | Biểu đồ admin dùng 3 màu `chart-1..3` riêng (lục lam, cam, xanh dương) thay vì màu thương hiệu | Màu thương hiệu (xanh rêu + đồng) không qua kiểm tra mù màu khi đặt cạnh nhau; luôn kèm chú thích, nhãn trực tiếp và chế độ xem bảng |
| 37 | **Tính năng người dùng bổ sung** (25/10/2026): lịch chăm sóc Excel, nhắc việc .ics, trang in / PDF, nhật ký ảnh cây (`tree_photos.source = progress`, không dùng cho phân tích), mã quà tặng, lịch sử lượt, thông báo chung, tự nhắc giai đoạn (beat 8:00). Ngày đến hạn tính từ `time_from_start` của lộ trình (`services/care_calendar.py`) — dùng chung cho Excel, .ics và nhắc việc | Giữ người dùng quay lại theo đúng nhịp chăm cây (theo năm), không cần thêm thao tác |
| 38 | Link tải Excel / .ics là **link ký sẵn 1 giờ** (HMAC), không cần header đăng nhập | Thẻ `<a>` và ứng dụng Lịch của iPhone mở URL trực tiếp |
| 39 | **Cấu hình vận hành & gói bán đổi lúc chạy** (`app_settings` "ops", "packages"); đơn thanh toán chốt số lượt lúc tạo (`payments.credits`) | Đổi giá / khuyến mãi / bảo trì không cần triển khai lại; đổi gói không ảnh hưởng đơn đã tạo |
| 40 | Gửi thông báo hàng loạt **chỉ qua Web Push** | Zalo ZNS chỉ cho tin giao dịch theo mẫu đã duyệt |
| 33 | ultralytics/torch chỉ cài vào worker khi `WORKER_WITH_CV=true` | Nặng ~1 GB; chưa có trọng số thì không cần |
| 31 | OpenAI ảnh: đệm lề ảnh vào vào khổ gần nhất (1024², 1536×1024, 1024×1536) rồi cắt ảnh ra về đúng tỉ lệ gốc | Không thì CV loại vì sai tỉ lệ → sinh lại, tốn tiền |

## Chưa làm (cố ý)
- Xóa tài khoản (đã có xóa cây kèm ảnh; xóa tài khoản cần quy định giữ sổ lượt/thanh toán, Nghị định 13/2023).
- P3b bản vẽ phong cách nghệ nhân, video timelapse, theo dõi tiến độ cây thật (sau MVP theo §1).
