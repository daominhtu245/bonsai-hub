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

## Chưa làm (cố ý)
- Thông báo Web Push / Zalo khi phân tích xong (để sau theo yêu cầu).
- Xóa tài khoản (đã có xóa cây kèm ảnh; xóa tài khoản cần quy định giữ sổ lượt/thanh toán, Nghị định 13/2023).
- P3b bản vẽ phong cách nghệ nhân, video timelapse, theo dõi tiến độ cây thật (sau MVP theo §1).
