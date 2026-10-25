# Token mỗi lần chạy (đo thật, 25/10/2026)

Nguồn: bảng `pipeline_steps` (mỗi lần gọi AI ghi token vào / ra, số ảnh). Mẫu nhỏ: **11 phiên thật bằng OpenAI**
(gpt-5.5 chữ, gpt-image-2 ảnh), chế độ Tiêu chuẩn. Đổi sang Claude / Gemini thì số token lệch khoảng ±20–30%
(mỗi hãng đếm token khác nhau), cùng thứ tự độ lớn. Xem số mới nhất: `/admin` → Chi phí AI.

## Từng bước (trung bình mỗi lần gọi)
| Bước | Việc | Token vào | Token ra | Ảnh tạo |
|---|---|---:|---:|---:|
| P1 | Đọc ảnh phôi (loài, thân, cành, rễ) | 2.400 | 1.100 | — |
| P2 | Thiết kế 2–3 phương án | 4.600 | 4.000 | — |
| P2b | Lộ trình giai đoạn | 2.800 | 4.500 | — |
| PV | Ảnh xem thử (nếu bật) | 3.500 | 160 | 1 |
| P3a | Ảnh kết quả S4 | 2.700 | 1.300 | 1 |
| P3c | Vẽ sửa khi chưa đạt | 4.100 | 1.500 | 1 |
| P3d | Ảnh giai đoạn S1–S3 (mỗi ảnh) | 2.300 | 380 | 1 |
| P4 | AI chấm ảnh | 2.400 | 650 | — |
| P5 | Hướng dẫn chăm | 2.500 | 800 | — |
| P6 | Báo cáo / nhận xét | 5.100 | 3.500 | — |
| L1 | Gán nhãn (đọc tọa độ, model rẻ) | 2.200 | 940 | — |

Token ra của bước chữ gồm cả phần model "suy nghĩ" (tính tiền như token ra). Token của bước ảnh là token ảnh
(OpenAI tính theo token ảnh; Gemini tính theo số ảnh, ~1.290 token ra / ảnh). Ảnh đưa vào cũng tính là token vào
(ảnh 1536 px ≈ 1.500–2.000 token).

## Mỗi phiên
| Loại phiên | Token vào | Token ra | Ảnh tạo |
|---|---:|---:|---:|
| Chỉ phân tích + bản vẽ (miễn phí cho người dùng) | ~7.000 | ~5.000 | 0 (1 nếu bật ảnh xem thử) |
| Phiên trả lượt đầy đủ (phân tích + ảnh kết quả + 3 ảnh giai đoạn + chấm + hướng dẫn) | ~25.000 | ~11.000 | ~5 (S4, sửa, S1–S3) |
| Phiên đắt nhất đã gặp (nhiều lần vẽ sửa) | ~45.000 | ~18.000 | ~8 |

Cách tính nhanh: **N phiên trả lượt ≈ N × 25.000 token vào + N × 11.000 token ra + N × 5 ảnh**.
- Bộ đo 20 phôi: ≈ 500.000 vào + 220.000 ra + ~100 ảnh.
- 1.000 người dùng thử, mỗi người 2 lần phân tích + 1 lần tạo ảnh: ≈ 2.000 × 7.000 + 1.000 × 25.000 ≈ 39 triệu vào,
  ≈ 2.000 × 5.000 + 1.000 × 11.000 ≈ 21 triệu ra, ~5.000 ảnh.

Giảm token: chế độ Tiết kiệm (model rẻ, ảnh chất lượng thấp), ảnh giai đoạn "Dựng từ ảnh kết quả" (bỏ 3 ảnh P3d),
tắt AI chấm (P4), trợ lý chăm cây "Tra bảng" — đều ở `/admin` → Chế độ AI.
