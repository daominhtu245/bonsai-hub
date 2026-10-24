"""Gemini: LLM dự phòng (Flash) và model ảnh mặc định (Nano Banana)."""

from __future__ import annotations

from google import genai
from google.genai import errors as genai_errors
from google.genai import types

from ..base import AIError, ImageInput, ImageResponse, TextResponse, Usage


def _client(api_key: str | None) -> genai.Client:
    return genai.Client(api_key=api_key) if api_key else genai.Client()


def _wrap(e: genai_errors.APIError) -> AIError:
    code = getattr(e, "code", 0) or 0
    return AIError(f"gemini {code}: {e}", retryable=code == 429 or code >= 500)


def _usage(resp) -> tuple[int, int]:
    meta = resp.usage_metadata
    if not meta:
        return 0, 0
    return meta.prompt_token_count or 0, meta.candidates_token_count or 0


class GeminiLLM:
    name = "gemini"

    def __init__(self, model: str, api_key: str | None):
        self.model = model
        self._client = _client(api_key)

    def complete(self, *, system: str, messages: list[dict], images: list[ImageInput], max_tokens: int) -> TextResponse:
        contents = []
        for i, m in enumerate(messages):
            parts = []
            if i == 0:
                parts += [types.Part.from_bytes(data=img.data, mime_type=img.media_type) for img in images]
            parts.append(types.Part.from_text(text=m["content"]))
            contents.append(types.Content(role="model" if m["role"] == "assistant" else "user", parts=parts))
        try:
            resp = self._client.models.generate_content(
                model=self.model,
                contents=contents,
                config=types.GenerateContentConfig(
                    system_instruction=system,
                    max_output_tokens=max_tokens,
                    response_mime_type="application/json",
                ),
            )
        except genai_errors.APIError as e:
            raise _wrap(e) from e
        tin, tout = _usage(resp)
        return TextResponse(text=resp.text or "", usage=Usage(tin, tout), provider=self.name, model=self.model)


class GeminiImage:
    name = "gemini"

    def __init__(self, model: str, api_key: str | None):
        self.model = model
        self._client = _client(api_key)

    def edit(self, *, prompt: str, images: list[ImageInput], n: int = 1, quality: str | None = None, mask: bytes | None = None) -> ImageResponse:
        parts = [types.Part.from_bytes(data=img.data, mime_type=img.media_type) for img in images]
        parts.append(types.Part.from_text(text=prompt))
        out: list[bytes] = []
        usage = Usage()
        media_type = "image/png"
        for _ in range(n):
            try:
                resp = self._client.models.generate_content(
                    model=self.model,
                    contents=[types.Content(role="user", parts=parts)],
                    config=types.GenerateContentConfig(response_modalities=["IMAGE"]),
                )
            except genai_errors.APIError as e:
                raise _wrap(e) from e
            tin, tout = _usage(resp)
            usage.tokens_in += tin
            for cand in resp.candidates or []:
                for part in (cand.content.parts if cand.content else None) or []:
                    if part.inline_data and part.inline_data.data:
                        out.append(part.inline_data.data)
                        media_type = part.inline_data.mime_type or media_type
        if not out:
            raise AIError("gemini returned no image", retryable=True)
        usage.images_out = len(out)
        return ImageResponse(images=out, usage=usage, provider=self.name, model=self.model, media_type=media_type)
