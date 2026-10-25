"""Máy đoán loài (miễn phí, chạy trên máy): đặc trưng ảnh CLIP (ONNX) + lớp phân loại học từ ảnh có giấy phép
(scripts/dataset/species_clip.py → models/species_clip.json). Chỉ để GỢI Ý / đối chiếu với P1 — đo trên tập kiểm tra
25/10/2026: đúng ngay 73%, nằm trong 3 gợi ý đầu 89%; si ↔ sanh hay nhầm.

Thiếu file → `get_guesser()` trả None (pipeline chạy như cũ).
"""

from __future__ import annotations

import io
import json
import os
from functools import lru_cache
from pathlib import Path

import numpy as np
from PIL import Image

MEAN = np.array([0.48145466, 0.4578275, 0.40821073], np.float32)
STD = np.array([0.26862954, 0.26130258, 0.27577711], np.float32)


def clip_pixels(img: Image.Image) -> np.ndarray:
    img = img.convert("RGB")
    w, h = img.size
    s = 224 / min(w, h)
    img = img.resize((max(224, round(w * s)), max(224, round(h * s))), Image.BICUBIC)
    w, h = img.size
    left, top = (w - 224) // 2, (h - 224) // 2
    x = (np.asarray(img.crop((left, top, left + 224, top + 224)), np.float32) / 255.0 - MEAN) / STD
    return x.transpose(2, 0, 1)


class SpeciesGuesser:
    def __init__(self, head_path: str, vision_path: str):
        import onnxruntime as ort

        head = json.loads(Path(head_path).read_text())
        self.classes: list[str] = head["classes"]
        self.W = np.array(head["W"], np.float32)
        self.b = np.array(head["b"], np.float32)
        self.mu = np.array(head["mean"], np.float32)
        self.sd = np.array(head["std"], np.float32)
        so = ort.SessionOptions()
        so.intra_op_num_threads = 2
        self.session = ort.InferenceSession(vision_path, so, providers=["CPUExecutionProvider"])

    def guess(self, image_bytes: bytes, top: int = 3) -> list[tuple[str, float]]:
        x = clip_pixels(Image.open(io.BytesIO(image_bytes)))[None].astype(np.float32)
        e = self.session.run(None, {"pixel_values": x})[0][0]
        e = (e / np.linalg.norm(e) - self.mu) / self.sd
        z = e @ self.W + self.b
        p = np.exp(z - z.max())
        p /= p.sum()
        order = np.argsort(-p)[:top]
        return [(self.classes[i], round(float(p[i]), 3)) for i in order]


@lru_cache(maxsize=1)
def get_guesser() -> SpeciesGuesser | None:
    root = Path(os.environ.get("MODELS_DIR", "/models"))
    head, vision = root / "species_clip.json", root / "clip-vit-b32-vision-q.onnx"
    if not head.is_file() or not vision.is_file():
        return None
    try:
        return SpeciesGuesser(str(head), str(vision))
    except Exception:  # noqa: BLE001 — thiếu onnxruntime / file hỏng: bỏ qua, không làm hỏng phiên
        return None
