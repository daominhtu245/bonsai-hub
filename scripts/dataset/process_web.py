"""Tách nền hàng loạt ảnh trong data/web/raw (nhóm phoi, bonsai) bằng đúng model + luật "khối chính" của pipeline
(bonsai_pipeline.cutout) → data/web/processed/<loài>/<nhóm>/<mã>.png (nền trong suốt, cắt sát) + <mã>_trang.jpg (nền trắng).

Ảnh tách không đạt (nhiều cây, mất gốc, mặt nạ quá to / nhỏ) không bị xóa — ghi lý do vào processed/status.jsonl để xem lại.
Xong thì dựng data/web/index.html (bảng ảnh để duyệt bằng mắt).

    .venv/bin/python scripts/dataset/process_web.py [--model data/models/isnet-general-use.onnx]
"""

from __future__ import annotations

import argparse
import html
import json
import os
from pathlib import Path

import numpy as np
from PIL import Image

from bonsai_pipeline import cutout as C

ROOT = Path(__file__).resolve().parents[2] / "data" / "web"
OUT = ROOT / "processed"
STATUS = OUT / "status.jsonl"
GROUPS = ("phoi", "bonsai")  # nhãn CLIP (classify_web.py) cần tách nền
LABELS = ROOT / "labels.jsonl"


def labels() -> dict[str, str]:
    """uid → nhãn sau phân loại (thiếu nhãn thì theo nhóm lúc tìm)."""
    if not LABELS.exists():
        return {}
    from classify_web import MIN_SCORE

    out = {}
    for line in LABELS.read_text().splitlines():
        r = json.loads(line)
        out[r["uid"]] = r["label"] if r["score"] >= MIN_SCORE else "_can_xem"
    return out


class Session:
    """Giữ một phiên ONNX cho cả lô (pipeline mở tiến trình con mỗi ảnh để trả RAM — ở đây không cần)."""

    def __init__(self, path: str):
        import onnxruntime as ort

        so = ort.SessionOptions()
        so.intra_op_num_threads = os.cpu_count() or 4
        self.s = ort.InferenceSession(path, so, providers=["CPUExecutionProvider"])
        self.name = self.s.get_inputs()[0].name

    def alpha(self, img: Image.Image) -> np.ndarray:
        import cv2

        im = np.asarray(img.resize((C.INPUT, C.INPUT), Image.BILINEAR), np.float32) / 255.0
        x = (im - 0.5).transpose(2, 0, 1)[None].astype(np.float32)  # ISNet: chuẩn hóa 0.5 / 1
        out = self.s.run(None, {self.name: x})[0][0][0]
        out = (out - out.min()) / (out.max() - out.min() + 1e-8)
        return cv2.resize(out.astype(np.float32), img.size, interpolation=cv2.INTER_LINEAR)


def process(sess: Session, src: Path, dst_dir: Path) -> dict:
    img = Image.open(src).convert("RGB")
    rgb = np.asarray(img)
    alpha = sess.alpha(img)
    keep = C.main_object(alpha)
    fg = float(keep.mean())
    h, w = keep.shape
    r = {"fg": round(fg, 3), "fg_raw": round(float((alpha > 0.5).mean()), 3), "pieces_dropped": round(float((alpha > 0.5).mean()) - fg, 3)}
    if not C.MIN_FG <= fg <= C.MAX_FG:
        return {**r, "ok": False, "reason": "mask_too_small" if fg < C.MIN_FG else "mask_too_large"}
    ys, xs = np.where(keep)
    if ys.max() < C.MIN_BOTTOM * h or (ys.max() - ys.min()) < C.MIN_HEIGHT * h:
        return {**r, "ok": False, "reason": "missing_base"}
    pad = int(C.PAD * max(w, h))
    x0, y0, x1, y1 = max(0, xs.min() - pad), max(0, ys.min() - pad), min(w, xs.max() + pad + 1), min(h, ys.max() + pad + 1)
    a = np.where(keep, alpha, 0.0)
    rgba = np.dstack([rgb, (a * 255).astype(np.uint8)])[y0:y1, x0:x1]
    white = (rgb * a[..., None] + 255 * (1 - a[..., None])).astype(np.uint8)[y0:y1, x0:x1]
    dst_dir.mkdir(parents=True, exist_ok=True)
    Image.fromarray(rgba, "RGBA").save(dst_dir / f"{src.stem}.png", optimize=True)
    Image.fromarray(white).save(dst_dir / f"{src.stem}_trang.jpg", quality=88)
    # nhiều mảnh lớn bị bỏ = ảnh có thể có nhiều cây / logo / người → nên xem lại
    return {**r, "ok": True, "reason": "check_multi" if r["pieces_dropped"] > 0.08 else None, "box": [int(x0), int(y0), int(x1), int(y1)]}


def build_index() -> None:
    rows = [json.loads(x) for x in (ROOT / "manifest.jsonl").read_text().splitlines()]
    status = {}
    if STATUS.exists():
        for line in STATUS.read_text().splitlines():
            s = json.loads(line)
            status[s["uid"]] = s
    lab = labels()
    by: dict[tuple[str, str], list[dict]] = {}
    for r in rows:
        r["label"] = lab.get(r["uid"], r["group"])
        by.setdefault((r["species"], r["label"]), []).append(r)
    parts = ["<!doctype html><meta charset=utf-8><title>Ảnh phôi / bonsai</title><style>body{font:14px system-ui;margin:16px;background:#f6f6f4}"
             "h2{margin:24px 0 8px}.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px}"
             "figure{margin:0;background:#fff;border:1px solid #ddd;border-radius:8px;overflow:hidden;font-size:11px}"
             "figure img{width:100%;height:150px;object-fit:contain;background:#eee;display:block}.bad{outline:2px solid #c23b2b}"
             ".warn{outline:2px solid #b7791f}figcaption{padding:4px 6px;color:#555;word-break:break-all}"
             ".pair{display:grid;grid-template-columns:1fr 1fr}nav a{margin-right:10px}</style>",
             f"<h1>Ảnh có giấy phép mở — {len(rows)} ảnh</h1><p>Viền đỏ: tách nền không đạt · viền vàng: có thể nhiều cây / vật thừa · "
             "nhấn ảnh để mở trang nguồn (tác giả, giấy phép).</p><nav>"]
    keys = sorted(by)
    parts += [f"<a href='#{s}-{g}'>{s}/{g} ({len(by[(s, g)])})</a>" for s, g in keys]
    parts.append("</nav>")
    for s, g in keys:
        parts.append(f"<h2 id='{s}-{g}'>{s} / {g} — {len(by[(s, g)])}</h2><div class=g>")
        for r in by[(s, g)]:
            st = status.get(r["uid"])
            cls = "" if not st else "bad" if not st["ok"] else "warn" if st.get("reason") else ""
            raw = html.escape(r["path"])
            proc = f"processed/{s}/{st.get('label', g) if st else g}/{r['uid']}_trang.jpg"
            imgs = f"<div class=pair><img loading=lazy src='{raw}'><img loading=lazy src='{proc}'></div>" if st and st["ok"] else f"<img loading=lazy src='{raw}'>"
            cap = html.escape(f"{r['license']} · {(r.get('author') or '')[:40]}" + (f" · {st['reason']}" if st and st.get('reason') else ""))
            parts.append(f"<figure class='{cls}'><a href='{html.escape(r.get('page_url') or '#')}' target=_blank>{imgs}</a><figcaption>{cap}</figcaption></figure>")
        parts.append("</div>")
    (ROOT / "index.html").write_text("".join(parts))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default=str(Path(__file__).resolve().parents[2] / "models" / "isnet-general-use.onnx"))
    ap.add_argument("--index-only", action="store_true")
    a = ap.parse_args()
    if not a.index_only:
        done = set()
        if STATUS.exists():
            done = {json.loads(x)["uid"] for x in STATUS.read_text().splitlines()}
        sess = Session(a.model)
        OUT.mkdir(parents=True, exist_ok=True)
        rows = [json.loads(x) for x in (ROOT / "manifest.jsonl").read_text().splitlines()]
        lab = labels()
        for r in rows:
            r["label"] = lab.get(r["uid"], r["group"])
        todo = [r for r in rows if r["label"] in GROUPS and r["uid"] not in done]
        ok = 0
        for i, r in enumerate(todo, 1):
            try:
                res = process(sess, ROOT / r["path"], OUT / r["species"] / r["label"])
            except Exception as e:  # noqa: BLE001
                res = {"ok": False, "reason": f"error: {e}"[:200]}
            ok += res["ok"]
            with STATUS.open("a") as f:
                f.write(json.dumps({"uid": r["uid"], "species": r["species"], "label": r["label"], **res}) + "\n")
            if i % 25 == 0 or i == len(todo):
                print(f"{i}/{len(todo)} · đạt {ok}", flush=True)
    build_index()
    print("Xong:", ROOT / "index.html")


if __name__ == "__main__":
    main()
