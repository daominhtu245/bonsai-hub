from __future__ import annotations

import base64
import io

import openai
from PIL import Image

from ..base import AIError, ImageInput, ImageResponse, Usage

_EXT = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp"}
_FORMAT = {"image/png": "PNG", "image/jpeg": "JPEG", "image/webp": "WEBP"}
# gpt-image-* chỉ xuất 3 khổ; ảnh phôi khổ khác (16:9, 4:3…) được đệm lề cho khớp rồi cắt lại sau khi sinh,
# để ảnh ra giữ đúng tỉ lệ ảnh gốc (không thì kiểm tra CV "aspect_changed" loại ảnh và phải sinh lại, tốn tiền).
SIZES = [(1024, 1024), (1536, 1024), (1024, 1536)]


def pick_size(w: int, h: int) -> tuple[int, int]:
    ar = w / h
    return min(SIZES, key=lambda s: abs(s[0] / s[1] - ar) / ar)


def _content_box(src: tuple[int, int], canvas: tuple[int, int]) -> tuple[int, int, int, int]:
    """Vị trí ảnh gốc (giữ tỉ lệ, căn giữa) trong khung `canvas`."""
    scale = min(canvas[0] / src[0], canvas[1] / src[1])
    w, h = round(src[0] * scale), round(src[1] * scale)
    left, top = (canvas[0] - w) // 2, (canvas[1] - h) // 2
    return left, top, left + w, top + h


def pad_to(img: ImageInput, canvas: tuple[int, int]) -> ImageInput:
    """Đệm ảnh vào khung `canvas` bằng màu viền trung bình (gần nền ảnh, model dễ hiểu là phần nền kéo dài)."""
    im = Image.open(io.BytesIO(img.data)).convert("RGB")
    box = _content_box(im.size, canvas)
    border = im.resize((1, 1), Image.Resampling.BOX, box=(0, 0, im.width, max(1, im.height // 20))).getpixel((0, 0))
    out = Image.new("RGB", canvas, border)
    out.paste(im.resize((box[2] - box[0], box[3] - box[1]), Image.Resampling.LANCZOS), box[:2])
    buf = io.BytesIO()
    out.save(buf, format=_FORMAT.get(img.media_type, "PNG"))
    return ImageInput(buf.getvalue(), img.media_type if img.media_type in _FORMAT else "image/png")


def crop_back(data: bytes, src: tuple[int, int]) -> bytes:
    im = Image.open(io.BytesIO(data)).convert("RGB")
    box = _content_box(src, im.size)
    if box == (0, 0, im.width, im.height):
        return data
    buf = io.BytesIO()
    im.crop(box).save(buf, format="PNG")
    return buf.getvalue()


class OpenAIImage:
    name = "openai"

    def __init__(self, model: str, api_key: str | None, quality: str = "medium"):
        self.model = model
        self.quality = quality
        self._client = openai.OpenAI(api_key=api_key) if api_key else openai.OpenAI()

    def edit(self, *, prompt: str, images: list[ImageInput], n: int = 1, quality: str | None = None) -> ImageResponse:
        src = Image.open(io.BytesIO(images[0].data)).size if images else (1024, 1024)
        size = pick_size(*src)
        padded = _content_box(src, size) != (0, 0, *size)
        inputs = [pad_to(img, size) for img in images] if padded else images
        # (tên, dữ liệu, mimetype): SDK không tự đoán mimetype từ BytesIO → API báo application/octet-stream.
        files = [(f"input_{i}.{_EXT.get(img.media_type, 'png')}", img.data, img.media_type) for i, img in enumerate(inputs)]
        try:
            resp = self._client.images.edit(
                model=self.model, image=files, prompt=prompt, n=n, quality=quality or self.quality, size=f"{size[0]}x{size[1]}"
            )
        except openai.RateLimitError as e:
            raise AIError(f"openai rate limited: {e}", retryable=True) from e
        except openai.APIStatusError as e:
            raise AIError(f"openai {e.status_code}: {e}", retryable=e.status_code >= 500) from e
        except openai.APIConnectionError as e:
            raise AIError(f"openai connection error: {e}", retryable=True) from e
        out = [base64.b64decode(d.b64_json) for d in resp.data or [] if d.b64_json]
        if not out:
            raise AIError("openai returned no image", retryable=True)
        if padded:
            out = [crop_back(o, src) for o in out]
        # gpt-image-* tính tiền theo token (cả token ảnh ra), không theo số ảnh.
        tokens_in = resp.usage.input_tokens if resp.usage else 0
        tokens_out = resp.usage.output_tokens if resp.usage else 0
        return ImageResponse(
            images=out,
            usage=Usage(tokens_in=tokens_in, tokens_out=tokens_out, images_out=len(out)),
            provider=self.name,
            model=self.model,
        )
