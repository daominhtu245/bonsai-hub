"""Đưa ảnh phôi đã lọc (data/web: nhãn "phoi", tách nền đạt, không bị loại tay) vào /admin → Gán nhãn.
Worker tạo mask nháp miễn phí (tách nền + màu); người gán chỉ việc sửa rồi "Duyệt xong".

    .venv/bin/python scripts/dataset/import_labels.py [--base http://127.0.0.1:8080] [--limit 300] [--include-bonsai]

Máy chủ thật: đặt ADMIN_TOKEN. Ảnh đã đưa lên ghi ở data/web/imported_labels.txt (chạy lại không trùng).
"""

from __future__ import annotations

import argparse
import io
import json
import os
import sys
import urllib.request
from pathlib import Path

from PIL import Image

REPO = Path(__file__).resolve().parents[2]
WEB = REPO / "data" / "web"
DONE = WEB / "imported_labels.txt"
sys.path.insert(0, str(REPO / "scripts" / "benchmark"))
from bench import Api, _token  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://127.0.0.1:8080")
    ap.add_argument("--limit", type=int, default=300)
    ap.add_argument("--include-bonsai", action="store_true", help="thêm ảnh bonsai đã thành hình (thân / cành rõ, ít lá che)")
    a = ap.parse_args()
    manifest = {r["uid"]: r for r in map(json.loads, (WEB / "manifest.jsonl").read_text().splitlines())}
    labels: dict[str, dict] = {}
    for line in (WEB / "labels.jsonl").read_text().splitlines():  # dòng sau (duyệt tay) ghi đè dòng trước
        r = json.loads(line)
        labels[r["uid"]] = r
    status = {r["uid"]: r for r in map(json.loads, (WEB / "processed" / "status.jsonl").read_text().splitlines())}
    want = {"phoi", "bonsai"} if a.include_bonsai else {"phoi"}
    done = set(DONE.read_text().split()) if DONE.exists() else set()
    pick = [u for u, lab in labels.items() if lab["label"] in want and status.get(u, {}).get("ok") and u not in done and u in manifest]
    pick.sort(key=lambda u: (not labels[u].get("reviewed"), -labels[u]["score"]))
    pick = pick[: a.limit]
    if not pick:
        sys.exit("Không còn ảnh mới để đưa vào.")
    admin = Api(a.base, _token(a.base, "ADMIN_TOKEN", os.environ.get("BENCH_ADMIN_EMAIL", "qt@test.vn")))
    keys: list[str] = []
    for i, u in enumerate(pick, 1):
        img = Image.open(WEB / manifest[u]["path"]).convert("RGB")
        buf = io.BytesIO()
        img.save(buf, "JPEG", quality=92)
        data = buf.getvalue()
        pre = admin.call("POST", "/uploads/presign", {"content_type": "image/jpeg", "size_bytes": len(data)})
        urllib.request.urlopen(urllib.request.Request(pre["url"], method="PUT", data=data, headers=pre["headers"]), timeout=120).read()
        keys.append(pre["key"])
        if len(keys) == 200 or i == len(pick):
            admin.call("POST", "/admin/labels", {"keys": keys})
            with DONE.open("a") as f:
                f.write("\n".join(pick[i - len(keys):i]) + "\n")
            print(f"{i}/{len(pick)} ảnh đã đưa vào Gán nhãn", flush=True)
            keys = []


if __name__ == "__main__":
    main()
