"""Nhận diện loài từ ảnh (miễn phí, chạy trên máy): đặc trưng CLIP (ONNX) + lớp phân loại softmax huấn luyện trên ảnh có
giấy phép ở data/web. Ghi models/species_clip.json (lớp, trọng số) — worker dùng làm gợi ý loài khi người dùng chưa chọn.

    .venv/bin/python scripts/dataset/species_clip.py            # tính đặc trưng (đệm), huấn luyện, đánh giá, lưu
"""

from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path

import numpy as np

REPO = Path(__file__).resolve().parents[2]
WEB = REPO / "data" / "web"
CACHE = WEB / "clip_embeds.npz"
OUT = REPO / "models" / "species_clip.json"
MIN_IMAGES = 60
sys.path.insert(0, str(REPO / "scripts" / "dataset"))
from classify_web import _session, pixels  # noqa: E402


def embeddings(rows: list[dict]) -> dict[str, np.ndarray]:
    have: dict[str, np.ndarray] = {}
    if CACHE.exists():
        z = np.load(CACHE)
        have = dict(zip(z["uids"].tolist(), z["vecs"]))
    todo = [r for r in rows if r["uid"] not in have]
    if todo:
        vis = _session("vision_model_quantized")
        for i in range(0, len(todo), 16):
            b = todo[i:i + 16]
            e = vis.run(None, {"pixel_values": np.stack([pixels(WEB / r["path"]) for r in b]).astype(np.float32)})[0]
            for r, v in zip(b, e / np.linalg.norm(e, axis=1, keepdims=True)):
                have[r["uid"]] = v.astype(np.float32)
            print(f"đặc trưng {min(i + 16, len(todo))}/{len(todo)}", flush=True)
        np.savez_compressed(CACHE, uids=np.array(list(have)), vecs=np.stack(list(have.values())))
    return have


def train(X: np.ndarray, y: np.ndarray, k: int, epochs: int = 300, lr: float = 0.5, l2: float = 1e-2) -> tuple[np.ndarray, np.ndarray]:
    """Hồi quy softmax trên đặc trưng ĐÃ CHUẨN HÓA (không chuẩn hóa: 47% → có: 73% trên tập kiểm tra 25/10/2026)."""
    W = np.zeros((X.shape[1], k), np.float32)
    b = np.zeros(k, np.float32)
    Y = np.eye(k, dtype=np.float32)[y]
    cw = (len(y) / (k * np.bincount(y, minlength=k).clip(1))).astype(np.float32)[y][:, None]  # cân bằng lớp
    for _ in range(epochs):
        z = X @ W + b
        p = np.exp(z - z.max(1, keepdims=True))
        p /= p.sum(1, keepdims=True)
        g = (p - Y) * cw / len(y)
        W -= lr * (X.T @ g + l2 * W)
        b -= lr * g.sum(0)
    return W, b


def main() -> None:
    manifest = {r["uid"]: r for r in map(json.loads, (WEB / "manifest.jsonl").read_text().splitlines())}
    labels: dict[str, dict] = {}
    for line in (WEB / "labels.jsonl").read_text().splitlines():
        r = json.loads(line)
        labels[r["uid"]] = r
    rows = [manifest[u] for u, lab in labels.items() if lab["label"] != "loai_bo" and u in manifest and manifest[u]["species"] != "_chung"]
    n = Counter(r["species"] for r in rows)
    classes = sorted(s for s, c in n.items() if c >= MIN_IMAGES)
    rows = [r for r in rows if r["species"] in classes]
    emb = embeddings(rows)
    X = np.stack([emb[r["uid"]] for r in rows])
    mu, sd = X.mean(0), X.std(0) + 1e-6
    X = (X - mu) / sd
    y = np.array([classes.index(r["species"]) for r in rows])
    rng = np.random.default_rng(7)
    test = np.zeros(len(y), bool)
    for c in range(len(classes)):  # 20% mỗi loài để kiểm tra
        idx = np.where(y == c)[0]
        test[rng.choice(idx, max(1, len(idx) // 5), replace=False)] = True
    W, b = train(X[~test], y[~test], len(classes))
    pred = (X[test] @ W + b).argmax(1)
    acc = float((pred == y[test]).mean())
    top3 = float(np.mean([y[test][i] in np.argsort(-(X[test][i] @ W + b))[:3] for i in range(test.sum())]))
    print(f"\nĐộ chính xác trên ảnh kiểm tra ({test.sum()} ảnh, {len(classes)} loài): đúng ngay {acc:.0%} · nằm trong 3 gợi ý đầu {top3:.0%}")
    for c, name in enumerate(classes):
        m = y[test] == c
        wrong = Counter(classes[p] for p in pred[m] if p != c).most_common(2)
        print(f"  {name:16s} {float((pred[m] == c).mean()):.0%}  ({m.sum()} ảnh)" + (f"  hay nhầm: {wrong}" if wrong else ""))
    W, b = train(X, y, len(classes))  # bản dùng thật: học trên toàn bộ
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"version": 1, "model": "clip-vit-base-patch32 (quantized)", "classes": classes, "mean": mu.round(6).tolist(), "std": sd.round(6).tolist(),
                               "W": W.round(5).tolist(), "b": b.round(5).tolist(), "test_accuracy": round(acc, 3), "test_top3": round(top3, 3),
                               "images": {c: n[c] for c in classes}}))
    print("Đã lưu", OUT.relative_to(REPO))


if __name__ == "__main__":
    main()
