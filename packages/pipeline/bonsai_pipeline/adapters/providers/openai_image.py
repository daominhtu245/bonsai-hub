from __future__ import annotations

import base64

import openai

from ..base import AIError, ImageInput, ImageResponse, Usage

_EXT = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp"}


class OpenAIImage:
    name = "openai"

    def __init__(self, model: str, api_key: str | None, quality: str = "medium"):
        self.model = model
        self.quality = quality
        self._client = openai.OpenAI(api_key=api_key) if api_key else openai.OpenAI()

    def edit(self, *, prompt: str, images: list[ImageInput], n: int = 1) -> ImageResponse:
        # (tên, dữ liệu, mimetype): SDK không tự đoán mimetype từ BytesIO → API báo application/octet-stream.
        files = [
            (f"input_{i}.{_EXT.get(img.media_type, 'png')}", img.data, img.media_type) for i, img in enumerate(images)
        ]
        try:
            resp = self._client.images.edit(model=self.model, image=files, prompt=prompt, n=n, quality=self.quality)
        except openai.RateLimitError as e:
            raise AIError(f"openai rate limited: {e}", retryable=True) from e
        except openai.APIStatusError as e:
            raise AIError(f"openai {e.status_code}: {e}", retryable=e.status_code >= 500) from e
        except openai.APIConnectionError as e:
            raise AIError(f"openai connection error: {e}", retryable=True) from e
        out = [base64.b64decode(d.b64_json) for d in resp.data or [] if d.b64_json]
        if not out:
            raise AIError("openai returned no image", retryable=True)
        # gpt-image-* tính tiền theo token (cả token ảnh ra), không theo số ảnh.
        tokens_in = resp.usage.input_tokens if resp.usage else 0
        tokens_out = resp.usage.output_tokens if resp.usage else 0
        return ImageResponse(
            images=out,
            usage=Usage(tokens_in=tokens_in, tokens_out=tokens_out, images_out=len(out)),
            provider=self.name,
            model=self.model,
        )
