"""Xuất ảnh mặt tiền + số đo P1 của các phiên A đã chạy thành manifest cho label_with_sam.py.

    DATABASE_URL=... R2_...=... python tools/seg/export_from_db.py out/ --limit 300
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from sqlalchemy import select

from bonsai_api import storage
from bonsai_api.db.models import DesignJob, TreePhoto
from bonsai_api.db.session import get_sessionmaker


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("out_dir", type=Path)
    ap.add_argument("--limit", type=int, default=300)
    args = ap.parse_args()
    (args.out_dir / "images").mkdir(parents=True, exist_ok=True)
    manifest = []
    with get_sessionmaker()() as db:
        jobs = db.execute(
            select(DesignJob).where(DesignJob.analysis.isnot(None), DesignJob.front_photo_id.isnot(None))
            .order_by(DesignJob.created_at.desc()).limit(args.limit)
        ).scalars()
        for job in jobs:
            trunk = (job.analysis or {}).get("trunk")
            photo = db.get(TreePhoto, job.front_photo_id)
            if not trunk or photo is None or photo.storage_key.startswith("uploads/"):
                continue
            name = f"{job.id}"
            path = args.out_dir / "images" / f"{name}.webp"
            path.write_bytes(storage.get_bytes(photo.storage_key))
            manifest.append({"name": name, "image": str(path), **{k: trunk[k] for k in ("base_point_px", "apex_point_px", "base_diameter_px")}})
    (args.out_dir / "manifest.json").write_text(json.dumps(manifest, indent=1))
    print(f"exported {len(manifest)} images")


if __name__ == "__main__":
    main()
