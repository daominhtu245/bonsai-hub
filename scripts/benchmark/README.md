# Bộ đo chất lượng (Q0)

Dữ liệu ở `data/benchmark/` (không đưa lên git):

```
data/benchmark/
  cases.yaml            # danh sách phôi cố định
  photos/<mã>/front.jpg # ảnh từng phôi (thêm left.jpg, right.jpg, back.jpg nếu có)
  runs/<ngày>_<nhãn>/   # mỗi lần chạy: results.jsonl, report.html, summary.json
```

`cases.yaml`:

```yaml
version: 1
cases:
  - id: si_vuon_01
    photos: [si_vuon_01/front.jpg, si_vuon_01/left.jpg]
    species_key: si          # si | sanh | mai_chieu_thuy | tung_la_han | linh_sam | other
    height_cm: 45
    style: null              # để trống = hệ thống tự đề xuất
    note: thân cong chữ S, gốc to
```

Thêm ảnh chụp thật: tạo thư mục trong `photos/`, thêm một mục vào `cases.yaml` (hướng dẫn chụp: `docs/huong-dan-chup-phoi.md`).

Quy trình mỗi lần sửa prompt / luật / khóa vùng:
1. `bench.py check` — ảnh đủ chuẩn (không tốn tiền).
2. `bench.py run --label <tên-thay-đổi> --yes` — chạy cả bộ (tốn tiền, có ước tính trước).
3. Nghệ nhân chấm ở `/admin/cham-diem` (các phiên có tên cây `BENCH …`).
4. `bench.py report runs/<lần này> --compare runs/<lần trước>` — chỉ giữ thay đổi làm tăng tỉ lệ đạt.

Mục tiêu Cổng 2: **≥ 70%** ảnh được nghệ nhân chấm đạt ngay lần đầu.
