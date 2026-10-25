"""Phân loại lại ảnh đã tải bằng CLIP (ONNX, chạy trên máy, không tốn API): từ khóa tìm kiếm không đủ tin
("pre-bonsai" vẫn ra cây đã thành hình, tranh vẽ…).

Ghi data/web/labels.jsonl {uid, label, score, probs} và dựng data/web/sorted/<loài>/<nhãn>/ bằng liên kết cứng
(không tốn thêm ổ đĩa). Điểm thấp → nhãn "_can_xem" để người duyệt.

    .venv/bin/python scripts/dataset/classify_web.py
"""

from __future__ import annotations

import json
import os
import shutil
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2] / "data" / "web"
MODELS = Path(__file__).resolve().parents[2] / "data" / "models" / "clip"
LABELS = ROOT / "labels.jsonl"
SORTED = ROOT / "sorted"
MIN_SCORE = 0.45  # dưới ngưỡng → _can_xem

# nhãn → các câu mô tả (trung bình embedding). Thứ tự nhãn cố định.
CLASSES: dict[str, list[str]] = {
    "phoi": [
        "a photo of an untrained young tree in a black plastic nursery pot",
        "a photo of raw bonsai material before styling, wild unpruned branches",
        "a photo of a freshly collected tree stump with few branches in a training box",
        "a photo of a thick trunk sapling growing in a nursery container",
        "a photo of pre-bonsai nursery stock",
    ],
    "bonsai": [
        "a photo of a styled bonsai tree in a ceramic bonsai pot",
        "a photo of a refined bonsai tree with shaped foliage pads",
        "a photo of a bonsai tree on display at an exhibition",
    ],
    "tu_nhien": [
        "a photo of a tree growing in the ground outdoors",
        "a photo of a large tree in a park or forest",
        "a photo of a shrub or hedge in a garden",
        "a photo of a trimmed hedge or bush planted in the ground",
    ],
    "la_hoa": [
        "a close-up photo of leaves",
        "a close-up photo of flowers or fruits on a branch",
        "a close-up photo of tree bark",
    ],
    "nhieu_cay": [
        "a photo of many potted plants in a row at a nursery",
        "a photo of a collection of many bonsai trees on benches",
    ],
    "loai_bo": [
        "a painting or drawing of a tree",
        "an old printed illustration or woodblock print",
        "a photo of people, a building or a street",
        "a photo with large text, a poster or a logo",
        "a diagram or screenshot",
        "a black and white or sepia vintage photograph",
    ],
}


def _session(name: str):
    import onnxruntime as ort

    so = ort.SessionOptions()
    so.intra_op_num_threads = os.cpu_count() or 4
    # phần ảnh dùng chung file với worker (models/, máy đoán loài) — không giữ 2 bản
    path = MODELS.parents[2] / "models" / "clip-vit-b32-vision-q.onnx" if name == "vision_model_quantized" else MODELS / f"{name}.onnx"
    return ort.InferenceSession(str(path), so, providers=["CPUExecutionProvider"])


def text_embeddings() -> np.ndarray:
    from tokenizers import Tokenizer

    tok = Tokenizer.from_file(str(MODELS / "tokenizer.json"))
    sess = _session("text_model_quantized")
    out = []
    for prompts in CLASSES.values():
        vecs = []
        for p in prompts:
            ids = np.array([tok.encode(p).ids], dtype=np.int64)
            v = sess.run(None, {"input_ids": ids})[0][0]
            vecs.append(v / np.linalg.norm(v))
        m = np.mean(vecs, axis=0)
        out.append(m / np.linalg.norm(m))
    return np.stack(out)


MEAN = np.array([0.48145466, 0.4578275, 0.40821073], np.float32)
STD = np.array([0.26862954, 0.26130258, 0.27577711], np.float32)


def pixels(path: Path) -> np.ndarray:
    img = Image.open(path).convert("RGB")
    w, h = img.size
    s = 224 / min(w, h)
    img = img.resize((max(224, round(w * s)), max(224, round(h * s))), Image.BICUBIC)
    w, h = img.size
    l, t = (w - 224) // 2, (h - 224) // 2
    x = (np.asarray(img.crop((l, t, l + 224, t + 224)), np.float32) / 255.0 - MEAN) / STD
    return x.transpose(2, 0, 1)


def main() -> None:
    rows = [json.loads(x) for x in (ROOT / "manifest.jsonl").read_text().splitlines()]
    done = {}
    if LABELS.exists():
        done = {json.loads(x)["uid"]: json.loads(x) for x in LABELS.read_text().splitlines()}
    todo = [r for r in rows if r["uid"] not in done]
    if todo:
        T = text_embeddings()
        vis = _session("vision_model_quantized")
        names = list(CLASSES)
        with LABELS.open("a") as f:
            for i in range(0, len(todo), 16):
                batch = todo[i:i + 16]
                x = np.stack([pixels(ROOT / r["path"]) for r in batch]).astype(np.float32)
                emb = vis.run(None, {"pixel_values": x})[0]
                emb = emb / np.linalg.norm(emb, axis=1, keepdims=True)
                logits = 100.0 * emb @ T.T
                probs = np.exp(logits - logits.max(1, keepdims=True))
                probs /= probs.sum(1, keepdims=True)
                for r, p in zip(batch, probs):
                    k = int(p.argmax())
                    rec = {"uid": r["uid"], "label": names[k], "score": round(float(p[k]), 3),
                           "probs": {n: round(float(v), 3) for n, v in zip(names, p)}}
                    done[r["uid"]] = rec
                    f.write(json.dumps(rec) + "\n")
                print(f"{min(i + 16, len(todo))}/{len(todo)}", flush=True)
    # dựng lại thư mục đã phân loại (liên kết cứng)
    if SORTED.exists():
        shutil.rmtree(SORTED)
    counts: dict[str, int] = {}
    for r in rows:
        lab = done.get(r["uid"])
        if not lab:
            continue
        label = lab["label"] if lab["score"] >= MIN_SCORE else "_can_xem"
        d = SORTED / r["species"] / label
        d.mkdir(parents=True, exist_ok=True)
        src = ROOT / r["path"]
        try:
            os.link(src, d / src.name)
        except FileExistsError:
            pass
        counts[f"{r['species']}/{label}"] = counts.get(f"{r['species']}/{label}", 0) + 1
    print(json.dumps(dict(sorted(counts.items())), ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
