# Model riêng phân tích phôi — YOLO-seg 3 lớp (thân, cành, rễ)

Model này thay bước P1 (API đọc ảnh) khi đủ tin cậy: worker tách thân / từng cành / rễ, rồi
`bonsai_pipeline/local_analysis.py` tính ra cùng dữ liệu như P1 (độ cao, gốc, thuôn, dáng thân, nghiêng,
vị trí – hướng – độ to từng cành, độ xòe rễ). Chưa chắc (model thiếu lớp cành, độ tin thân thấp, thân quá nhỏ
trong khung…) thì tự gọi P1. Bật ở `/admin` → Chế độ AI → Phân tích phôi: "Model riêng, API dự phòng".
Không có trọng số → luôn dùng API (pipeline vẫn chạy).

Lớp: `0 trunk` (thân chính đến ngọn), `1 branch` (mỗi cành một đối tượng), `2 root` (rễ nổi / nebari).

## 0. Ảnh có sẵn (không tốn API)
`scripts/dataset/` gom ảnh có giấy phép → phân loại CLIP → tách nền; `scripts/dataset/import_labels.py` đưa ảnh phôi đã lọc
vào Gán nhãn. Ảnh tải lên được tạo **nháp miễn phí trên máy** (`labeling.local_drafts`: tách nền ISNet → bỏ lá theo màu →
bỏ chậu theo hình khối → gỗ dày = thân, nhánh mảnh = cành, loe sát đất = rễ). Thô: ~½ ảnh dùng được ngay, còn lại sửa
nhiều; không tách được thân thì mới gọi AI (L1) như dưới.

## 1–2. Gom ảnh và gán nhãn ngay trong app — `/admin` → Gán nhãn
- **Tải ảnh lên** (tối đa 200 ảnh/lần) hoặc **Lấy ảnh từ phiên đã chạy** (chỉ người dùng đồng ý cho dùng ảnh huấn luyện,
  và cây của admin). Worker xóa EXIF, đọc ảnh bằng model chữ rẻ (~$0,002/ảnh, bước `L1` trong Chi phí) để lấy tọa độ
  thân / cành / rễ, rồi tạo mask nháp: **SAM** nếu worker có (`WORKER_WITH_CV=true`, `SAM_WEIGHTS=/models/sam2.1_b.pt`),
  không thì **hình học** (thô — dải thân, nét cành, vệt rễ).
- Mở từng ảnh: chọn đối tượng → **Cọ / Tẩy / Khoanh tô / Khoanh xóa** (phím B, E, L, K; [ ] đổi cỡ; giữ H xem ảnh gốc),
  bỏ chọn "Đúng" cho mask sai, **+ Cành** cho cành bị sót. **Duyệt xong** → sang ảnh tiếp. Ảnh không dùng được → **Bỏ ảnh**.
- Lưu ý si/sanh có rễ khí — không tính vào thân; mỗi cành là một đối tượng riêng.

Cách khác (không qua app): `tools/seg/export_from_db.py` → `tools/seg/label_with_sam.py` (dòng lệnh, cần SAM).

## 3. Xuất và đổi sang nhãn YOLO, chia train/val
```bash
# trong container api (có DATABASE_URL, R2_*), hoặc máy có cùng biến môi trường
python packages/pipeline/tools/seg/export_labels.py data/seg     # chỉ ảnh "Đã duyệt", đối tượng "Đúng"
python -c "from pathlib import Path; from bonsai_pipeline.seg_dataset import build_dataset; \
print(build_dataset(Path('data/seg/images'), Path('data/seg/masks'), Path('data/seg/yolo')))"
```
Ảnh từ phiên người dùng chỉ được xuất khi người đó **vẫn** đồng ý và chưa xóa tài khoản / cây.

## 4. Huấn luyện
```bash
yolo segment train data=data/seg/yolo/dataset.yaml model=yolo11s-seg.pt imgsz=1024 epochs=150 patience=30
```
Mac M-series: thêm `device=mps`; hoặc Google Colab (GPU miễn phí). 300 ảnh ~1–3 giờ.
Mục tiêu tham khảo: mask mAP50 thân ≥ 0.85, cành ≥ 0.6 trước khi bật cho người dùng.

## 5. Dùng ở worker
```bash
cp runs/segment/train/weights/best.pt models/bonsai-seg.pt
# .env
TRUNK_SEG_WEIGHTS=/models/bonsai-seg.pt
WORKER_WITH_CV=true        # build worker có ultralytics + torch CPU (~1 GB)
make up
```
`/admin` → Chế độ AI hiện "đã có model" khi worker nạp được trọng số. Theo dõi `/admin` → Chi phí:
bước A1 ghi `provider=code` khi model riêng làm được, kèm lý do khi phải gọi P1 (`pipeline_steps.output.reasons`).

## 6. So sánh trước khi tin model
Chạy cùng một bộ ảnh ở 2 chế độ (API / model riêng) và so số cành, độ cao, dáng thân; nghệ nhân xem bản vẽ.
Ngưỡng trong `local_analysis.py` (dáng thân, độ thuôn, độ to cành, độ xòe rễ) là giả định ban đầu — chỉnh theo dữ liệu.
