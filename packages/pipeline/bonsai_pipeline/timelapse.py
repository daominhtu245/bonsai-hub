"""Video tua nhanh phôi → S1 → S2 → S3 → S4 (docs/ideas.md B5): khung đứng 720×1280 cho TikTok / Reels / Zalo, có chữ
giai đoạn + nhãn "Minh họa" + thương hiệu. Dựng trên máy (Pillow), mã hóa MP4 bằng ffmpeg (gói imageio-ffmpeg);
không có ffmpeg thì trả ảnh động WebP. Không tốn API.
"""

from __future__ import annotations

import io
import subprocess

import numpy as np
from PIL import Image, ImageDraw, ImageFont

W, H, FPS = 720, 1280, 30
HOLD_S, FADE_S = 1.2, 0.6


def _font(size: int) -> ImageFont.ImageFont:
    from importlib import resources

    try:
        path = resources.files("bonsai_pipeline").joinpath("assets/fonts/BeVietnamPro-SemiBold.ttf")
        return ImageFont.truetype(str(path), size)
    except Exception:  # noqa: BLE001 — thiếu font thì dùng font mặc định
        return ImageFont.load_default()


def _card(photo: bytes, caption: str, brand: str) -> np.ndarray:
    """Một khung: ảnh vừa khung đứng trên nền mờ của chính nó, chữ giai đoạn phía dưới."""
    img = Image.open(io.BytesIO(photo)).convert("RGB")
    bg = img.copy().resize((W, H))
    from PIL import ImageFilter

    bg = bg.filter(ImageFilter.GaussianBlur(28)).point(lambda v: int(v * 0.55))
    fit = img.copy()
    fit.thumbnail((W, int(H * 0.78)), Image.Resampling.LANCZOS)
    bg.paste(fit, ((W - fit.width) // 2, int(H * 0.08) + (int(H * 0.78) - fit.height) // 2))
    d = ImageDraw.Draw(bg)
    f_big, f_small = _font(46), _font(26)
    tw = d.textlength(caption, font=f_big)
    d.text(((W - tw) / 2, H * 0.89), caption, font=f_big, fill=(255, 255, 255))
    d.rounded_rectangle([24, 24, 24 + d.textlength("Minh họa", font=f_small) + 28, 24 + 44], radius=10, fill=(0, 0, 0))
    d.text((38, 30), "Minh họa", font=f_small, fill=(255, 255, 255))
    bw = d.textlength(brand, font=f_small)
    d.text((W - bw - 28, 32), brand, font=f_small, fill=(255, 255, 255))
    return np.asarray(bg)


def frames(stages: list[tuple[bytes, str]], brand: str = "Bonsai AI"):
    """Sinh từng khung (numpy RGB): giữ mỗi giai đoạn rồi mờ chuyển sang giai đoạn sau."""
    cards = [_card(p, c, brand).astype(np.float32) for p, c in stages]
    hold, fade = int(HOLD_S * FPS), int(FADE_S * FPS)
    for i, card in enumerate(cards):
        for _ in range(hold if i < len(cards) - 1 else hold * 2):
            yield card.astype(np.uint8)
        if i < len(cards) - 1:
            nxt = cards[i + 1]
            for k in range(1, fade + 1):
                a = k / (fade + 1)
                yield (card * (1 - a) + nxt * a).astype(np.uint8)


def _ffmpeg() -> str | None:
    try:
        import imageio_ffmpeg

        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:  # noqa: BLE001
        return None


def render(stages: list[tuple[bytes, str]], brand: str = "Bonsai AI") -> tuple[bytes, str]:
    """Trả (dữ liệu, kiểu): MP4 H.264 nếu có ffmpeg, không thì WebP động."""
    exe = _ffmpeg()
    if exe:
        import os
        import tempfile

        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "out.mp4")  # +faststart cần ghi ra tệp (tua được), không ra pipe
            cmd = [exe, "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                   "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast", "-crf", "24", "-movflags", "+faststart", path]
            proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=subprocess.DEVNULL)
            try:
                for fr in frames(stages, brand):
                    proc.stdin.write(fr.tobytes())
                proc.stdin.close()
                ok = proc.wait(timeout=120) == 0
            except (BrokenPipeError, subprocess.TimeoutExpired):
                proc.kill()
                ok = False
            if ok and os.path.getsize(path) > 0:
                with open(path, "rb") as f:
                    return f.read(), "video/mp4"
    imgs = [Image.fromarray(fr).resize((W // 2, H // 2)) for i, fr in enumerate(frames(stages, brand)) if i % 3 == 0]
    buf = io.BytesIO()
    imgs[0].save(buf, "WEBP", save_all=True, append_images=imgs[1:], duration=int(1000 * 3 / FPS), loop=0, quality=70)
    return buf.getvalue(), "image/webp"
