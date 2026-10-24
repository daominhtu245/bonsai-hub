"""Tách nền + phác họa nét trên máy (không tốn API) trước khi gửi ảnh mặt tiền cho P1.

1. Model tách vật thể chính (ONNX) → mặt nạ alpha. Mặc định ISNet (~0,8 GB RAM, ~2 s CPU). BiRefNet-lite tách đẹp
   hơn nhưng cần > 4 GB RAM lúc chạy — chỉ dùng trên máy nhiều RAM (`CUTOUT_MODEL`).
2. Chỉ giữ **khối chính** (phôi + bầu đất / chậu dính liền): bỏ bàn tay, logo, cây khác… là các khối rời,
   nhặt lại lá / ngọn rời nằm sát khối chính.
3. Kiểm tra mặt nạ (phôi phải chạm nửa dưới ảnh, đủ cao) — sai thì bỏ qua, P1 dùng ảnh gốc.
4. Cắt sát quanh phôi (chừa lề) → ảnh nền trắng + bản phác họa nét (viền đậm + nét vỏ, cành, rễ) + ảnh gốc cùng khung
   (để P1 đối chiếu nếu bản tách lỡ xóa mất cành mảnh).
   Tọa độ P1 trả về theo ảnh đã cắt → `shift_analysis` cộng lại độ lệch, nên mọi bước sau vẫn dùng ảnh gốc.

Model không có / lỗi / mặt nạ bất thường → `Cutout.ok=False`, P1 dùng ảnh gốc như trước.
"""

from __future__ import annotations

import fcntl
import importlib.util
import io
import logging
import os
import subprocess
import sys
import tempfile
import time
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

import numpy as np
from PIL import Image

from .schemas import Analysis

log = logging.getLogger(__name__)

DEFAULT_MODEL = "/opt/models/isnet-general-use.onnx"
INPUT = 1024
MIN_FG, MAX_FG = 0.01, 0.95  # tỉ lệ diện tích phôi hợp lệ
MIN_BOTTOM = 0.7  # đáy phôi (gốc / bầu đất / chậu) phải xuống tới ít nhất 70% chiều cao ảnh
MIN_HEIGHT = 0.25  # phôi cao ít nhất 25% chiều cao ảnh
PIECE = 0.03  # mảnh rời nhỏ hơn 3% khối chính (lá, ngọn) nằm sát thì nhặt lại; khối lớn (bàn tay…) thì không
PAD = 0.06  # lề khi cắt sát, theo cạnh dài ảnh
TIMEOUT_S = 240
_LOCK = Path(tempfile.gettempdir()) / "bonsai-cutout.lock"  # một lần suy luận mỗi máy (nặng RAM/CPU)


@dataclass
class Cutout:
    ok: bool
    reason: str | None = None
    box: tuple[int, int, int, int] = (0, 0, 0, 0)  # x0, y0, x1, y1 trên ảnh gốc
    image_jpeg: bytes | None = None  # phôi trên nền trắng, đã cắt sát
    sketch_png: bytes | None = None  # phác họa nét, cùng khung với image_jpeg
    crop_jpeg: bytes | None = None  # ảnh gốc (không tách nền), cùng khung với image_jpeg
    mask_png: bytes | None = None  # mặt nạ khối chính, cỡ ảnh gốc (dataset về sau)
    metrics: dict = field(default_factory=dict)

    @property
    def size(self) -> tuple[int, int]:
        return self.box[2] - self.box[0], self.box[3] - self.box[1]


class BackgroundRemover:
    """Suy luận chạy trong **tiến trình con** (python -m bonsai_pipeline.cutout): BiRefNet cần ~2,8 GB RAM lúc chạy,
    tiến trình con thoát là trả lại hết — worker không giữ RAM giữa các phiên. Khóa file: mỗi máy 1 lần một lúc."""

    def __init__(self, path: str):
        self.path = path
        self.name = Path(path).stem

    def alpha(self, img: Image.Image) -> np.ndarray:
        with tempfile.TemporaryDirectory() as d:
            src, dst = Path(d) / "in.png", Path(d) / "alpha.npy"
            img.convert("RGB").save(src)
            with open(_LOCK, "w") as lock:
                fcntl.flock(lock, fcntl.LOCK_EX)
                r = subprocess.run([sys.executable, "-m", "bonsai_pipeline.cutout", self.path, str(src), str(dst)],
                                   capture_output=True, timeout=TIMEOUT_S)
            if r.returncode != 0:
                raise RuntimeError(r.stderr.decode(errors="replace")[-500:])
            return np.load(dst)


def _infer(path: str, img: Image.Image) -> np.ndarray:
    """Chạy model ONNX → alpha [0..1] cỡ ảnh gốc (gọi trong tiến trình con)."""
    import cv2
    import onnxruntime as ort

    so = ort.SessionOptions()
    so.intra_op_num_threads = int(os.environ.get("CUTOUT_THREADS") or os.cpu_count() or 4)
    session = ort.InferenceSession(path, so, providers=["CPUExecutionProvider"])
    # ISNet (rembg): chuẩn hóa 0.5/1, đầu ra đã là xác suất; BiRefNet: chuẩn ImageNet, đầu ra logit.
    isnet = "isnet" in Path(path).stem
    mean = np.array((0.5, 0.5, 0.5) if isnet else (0.485, 0.456, 0.406), np.float32)
    std = np.array((1.0, 1.0, 1.0) if isnet else (0.229, 0.224, 0.225), np.float32)
    im = np.asarray(img.convert("RGB").resize((INPUT, INPUT), Image.BILINEAR), np.float32) / 255.0
    x = ((im - mean) / std).transpose(2, 0, 1)[None].astype(np.float32)
    out = session.run(None, {session.get_inputs()[0].name: x})[0][0][0]
    if not isnet:
        out = 1.0 / (1.0 + np.exp(-out))
    out = (out - out.min()) / (out.max() - out.min() + 1e-8)
    return cv2.resize(out.astype(np.float32), img.size, interpolation=cv2.INTER_LINEAR)


@lru_cache(maxsize=1)
def get_remover() -> BackgroundRemover | None:
    path = os.environ.get("CUTOUT_MODEL", DEFAULT_MODEL)
    if not path or not Path(path).is_file() or importlib.util.find_spec("onnxruntime") is None:
        return None
    return BackgroundRemover(path)


def main_object(alpha: np.ndarray, threshold: float = 0.5) -> np.ndarray:
    """Khối chính: khối lớn, gần giữa ảnh, không phải vật ló vào từ mép trái/phải; cộng các mảnh nhỏ nằm sát nó."""
    import cv2

    h, w = alpha.shape
    m = (alpha > threshold).astype(np.uint8)
    n, lab, st, cen = cv2.connectedComponentsWithStats(m, 8)
    if n <= 1:
        return m.astype(bool)
    best, score = 0, -1.0
    for i in range(1, n):
        x, _, bw, _, area = st[i]
        central = 1 - min(abs(cen[i][0] / w - 0.5) * 1.4, 0.9)
        from_edge = (x == 0 or x + bw >= w) and bw < w * 0.8
        s = area * central * (0.5 if from_edge else 1.0)
        if s > score:
            best, score = i, s
    keep = lab == best
    small = {i for i in range(1, n) if st[i][4] < PIECE * st[best][4]}
    r = max(3, int(0.02 * np.hypot(w, h)))
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1))
    for _ in range(3):
        near = cv2.dilate(keep.astype(np.uint8), k).astype(bool)
        add = [i for i in np.unique(lab[near & (lab > 0)]) if i in small]
        grown = keep | np.isin(lab, add)
        if grown.sum() == keep.sum():
            break
        keep = grown
    return keep


def line_sketch(rgb: np.ndarray, keep: np.ndarray) -> np.ndarray:
    """Nền trắng, bóng phôi xám nhạt, nét chi tiết (Canny trong phôi) xám, viền ngoài đậm."""
    import cv2

    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    g = cv2.bilateralFilter(gray, 7, 40, 7)
    med = float(np.median(g[keep])) if keep.any() else 128.0
    edges = cv2.Canny(g, int(max(0, 0.66 * med)), int(min(255, 1.33 * med)))
    inner = cv2.erode(keep.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool)
    out = np.full(gray.shape, 255, np.uint8)
    out[keep] = 236
    out[(edges > 0) & inner] = 150
    contours, _ = cv2.findContours(keep.astype(np.uint8), cv2.RETR_LIST, cv2.CHAIN_APPROX_NONE)
    cv2.drawContours(out, contours, -1, 30, max(1, round(min(gray.shape) / 400)) + 1)
    return out


def _encode(arr: np.ndarray, fmt: str, **kw) -> bytes:
    buf = io.BytesIO()
    Image.fromarray(arr).save(buf, fmt, **kw)
    return buf.getvalue()


def make_cutout(photo: bytes, remover: BackgroundRemover) -> Cutout:
    started = time.monotonic()
    img = Image.open(io.BytesIO(photo)).convert("RGB")
    rgb = np.asarray(img)
    try:
        alpha = remover.alpha(img)
    except Exception as e:  # noqa: BLE001 — model lỗi không được làm hỏng phiên A
        log.exception("cutout inference failed")
        return Cutout(False, f"error: {e}", metrics={"model": remover.name})
    keep = main_object(alpha)
    fg_raw, fg = float((alpha > 0.5).mean()), float(keep.mean())
    metrics = {"model": remover.name, "fg_raw": round(fg_raw, 3), "fg": round(fg, 3),
               "ms": int((time.monotonic() - started) * 1000)}
    if not MIN_FG <= fg <= MAX_FG:
        return Cutout(False, "mask_too_small" if fg < MIN_FG else "mask_too_large", metrics=metrics)
    h, w = keep.shape
    ys, xs = np.where(keep)
    if ys.max() < MIN_BOTTOM * h or (ys.max() - ys.min()) < MIN_HEIGHT * h:
        return Cutout(False, "missing_base", metrics=metrics)  # thường là model chỉ giữ ngọn / lá, mất thân
    pad = int(PAD * max(w, h))
    box = (max(0, int(xs.min()) - pad), max(0, int(ys.min()) - pad), min(w, int(xs.max()) + pad + 1), min(h, int(ys.max()) + pad + 1))
    a = np.where(keep, alpha, 0.0)[..., None]
    white = (rgb * a + 255 * (1 - a)).astype(np.uint8)
    sketch = line_sketch(rgb, keep)
    x0, y0, x1, y1 = box
    metrics["box"] = list(box)
    return Cutout(
        True, None, box,
        image_jpeg=_encode(white[y0:y1, x0:x1], "JPEG", quality=90),
        sketch_png=_encode(sketch[y0:y1, x0:x1], "PNG", optimize=True),
        crop_jpeg=_encode(rgb[y0:y1, x0:x1], "JPEG", quality=88),
        mask_png=_encode((keep * 255).astype(np.uint8), "PNG", optimize=True),
        metrics=metrics,
    )


def shift_analysis(analysis: Analysis, dx: int, dy: int) -> Analysis:
    """Đổi tọa độ P1 từ ảnh đã cắt sát về ảnh gốc."""
    if not dx and not dy:
        return analysis
    data = analysis.model_dump(mode="json")

    def mv(p):
        return [p[0] + dx, p[1] + dy] if p else p

    if data.get("trunk"):
        data["trunk"]["base_point_px"] = mv(data["trunk"]["base_point_px"])
        data["trunk"]["apex_point_px"] = mv(data["trunk"]["apex_point_px"])
    for b in data.get("branches") or []:
        b["start_px"] = mv(b["start_px"])
        b["end_px"] = mv(b.get("end_px"))
    return Analysis.model_validate(data)


PREPROCESS_FLAG = "cutout_sketch"  # giá trị biến {{preprocess}} của P1.v2 khi đã tách nền + phác họa


if __name__ == "__main__":  # tiến trình con: python -m bonsai_pipeline.cutout <model.onnx> <in.png> <out.npy>
    model, src, dst = sys.argv[1:4]
    np.save(dst, _infer(model, Image.open(src)))
