"""Adapter model ảnh: retry backoff khi lỗi tạm thời (tối đa 3 lần), rồi chuyển nhà cung cấp dự phòng."""

from __future__ import annotations

import time
from collections.abc import Callable
from dataclasses import dataclass

from ..config import AISettings, get_ai_settings
from .base import AIError, CallTrace, ImageInput, ImageProvider, ImageResponse, ProviderCall, Usage


@dataclass
class ImageResult:
    response: ImageResponse
    trace: CallTrace


class ImageClient:
    def __init__(
        self,
        primary: ImageProvider,
        fallback: ImageProvider | None = None,
        *,
        max_retries: int = 3,
        base_delay_s: float = 2.0,
        sleep: Callable[[float], None] = time.sleep,
    ):
        self.primary = primary
        self.fallback = fallback
        self.max_retries = max_retries
        self.base_delay_s = base_delay_s
        self._sleep = sleep

    def edit(self, *, prompt: str, images: list[ImageInput], n: int = 1, quality: str | None = None) -> ImageResult:
        trace = CallTrace()
        last: AIError | None = None
        for provider in [self.primary] + ([self.fallback] if self.fallback else []):
            for attempt in range(self.max_retries + 1):
                started = time.monotonic()
                try:
                    resp = provider.edit(prompt=prompt, images=images, n=n, quality=quality)
                except AIError as e:
                    trace.calls.append(ProviderCall(provider.name, provider.model, Usage(), _ms(started), False, str(e)))
                    last = e
                    if not e.retryable or attempt == self.max_retries:
                        break
                    self._sleep(self.base_delay_s * (2**attempt))
                    continue
                trace.calls.append(ProviderCall(provider.name, provider.model, resp.usage, _ms(started), True))
                return ImageResult(response=resp, trace=trace)
        raise AIError(f"all image providers failed: {last}", trace=trace)


def _ms(started: float) -> int:
    return int((time.monotonic() - started) * 1000)


def build_image_provider(name: str, model: str, settings: AISettings) -> ImageProvider:
    if name == "gemini":
        from .providers.gemini import GeminiImage

        return GeminiImage(model=model, api_key=settings.gemini_api_key)
    if name == "openai":
        from .providers.openai_image import OpenAIImage

        return OpenAIImage(model=model, api_key=settings.openai_api_key)
    if name == "demo":
        import os

        if os.environ.get("APP_ENV", "dev") != "dev":
            raise ValueError("demo image provider is only allowed when APP_ENV=dev")
        from .providers.fake import DemoImage

        return DemoImage()
    if name == "fake":
        from .providers.fake import FakeImage

        return FakeImage(model=model)
    raise ValueError(f"unknown image provider: {name}")


def get_image_client(settings: AISettings | None = None) -> ImageClient:
    s = settings or get_ai_settings()
    primary = build_image_provider(s.image_provider, s.image_model, s)
    fallback = None
    from .llm_client import has_key

    if s.image_fallback_provider and s.image_fallback_model and has_key(s.image_fallback_provider, s):
        fallback = build_image_provider(s.image_fallback_provider, s.image_fallback_model, s)
    return ImageClient(primary, fallback, max_retries=s.image_max_retries)
