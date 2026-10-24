"""Xuất các ảnh đã duyệt ở /admin → Gán nhãn thành thư mục cho seg_dataset.build_dataset.

    DATABASE_URL=... R2_...=... python packages/pipeline/tools/seg/export_labels.py data/seg

Ra: data/seg/images/<id>.webp và data/seg/masks/<id>/{trunk,branch_*,root}.png (chỉ đối tượng đánh dấu "đúng").
Ảnh lấy từ phiên của người dùng: chỉ xuất khi người đó VẪN đồng ý cho dùng ảnh huấn luyện và chưa xóa
tài khoản / cây (rút lại đồng ý → không vào bộ dữ liệu mới).
Sau đó: build_dataset(Path('data/seg/images'), Path('data/seg/masks'), Path('data/seg/yolo')) — xem README.md.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from sqlalchemy import select

from bonsai_api import storage
from bonsai_api.db.models import DesignJob, SegLabel, SegLabelStatus, User, UserRole
from bonsai_api.db.session import get_sessionmaker


def allowed(db, label: SegLabel) -> bool:
    if label.source != "job":
        return True
    if label.job_id is None:  # phiên đã bị xóa
        return False
    job = db.get(DesignJob, label.job_id)
    user = db.get(User, job.user_id) if job else None
    return bool(user and user.deleted_at is None and (user.consent_training or user.role == UserRole.admin))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("out_dir", type=Path)
    args = ap.parse_args()
    (args.out_dir / "images").mkdir(parents=True, exist_ok=True)
    n, skipped = 0, 0
    with get_sessionmaker()() as db:
        for label in db.execute(select(SegLabel).where(SegLabel.status == SegLabelStatus.reviewed)).scalars():
            if not allowed(db, label):
                skipped += 1
                continue
            try:
                image = storage.get_bytes(label.image_key)
            except Exception:  # ảnh gốc đã bị xóa cùng cây
                skipped += 1
                continue
            (args.out_dir / "images" / f"{label.id}.webp").write_bytes(image)
            target = args.out_dir / "masks" / str(label.id)
            target.mkdir(parents=True, exist_ok=True)
            for o in label.objects or []:
                if o.get("accepted"):
                    (target / f"{o['id']}.png").write_bytes(storage.get_bytes(o["key"]))
            n += 1
    print(f"exported {n} images, skipped {skipped}")


if __name__ == "__main__":
    main()
