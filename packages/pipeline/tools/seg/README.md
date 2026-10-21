# YOLO-seg thân cây (A2)

Mục tiêu tuần 2: ~200 ảnh phôi có mask thân → model `trunk` cho bước A2 và IoU ở P4.
Khi chưa có trọng số, worker dùng số đo P1 (`cv_fallback=true`) — pipeline vẫn chạy.

```bash
pip install -e "packages/pipeline[cv]"                 # ultralytics + opencv (cần torch)

# 1. Lấy ảnh + điểm gốc/ngọn từ các phiên A đã chạy (hoặc tự viết manifest.json)
python packages/pipeline/tools/seg/export_from_db.py data/seg --limit 300

# 2. SAM sinh mask từ các điểm trên thân → DUYỆT BẰNG MẮT, sửa mask sai
python packages/pipeline/tools/seg/label_with_sam.py data/seg/manifest.json data/seg/masks

# 3. Đổi sang nhãn YOLO-seg (polygon), chia train/val
python -c "from pathlib import Path; from bonsai_pipeline.seg_dataset import build_dataset; \
print(build_dataset(Path('data/seg/images'), Path('data/seg/masks'), Path('data/seg/yolo')))"

# 4. Huấn luyện
yolo segment train data=data/seg/yolo/dataset.yaml model=yolo11s-seg.pt imgsz=1024 epochs=150 patience=30

# 5. Dùng ở worker
TRUNK_SEG_WEIGHTS=/models/trunk-seg.pt   # mount vào container worker; tên lớp phải là "trunk"
```

Lưu ý: si/sanh có rễ khí dễ làm mask lan ra rễ — gán nhãn rễ khí là nền, chỉ giữ thân chính.
