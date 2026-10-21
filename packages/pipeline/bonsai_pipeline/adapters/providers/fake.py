"""Provider giả cho test và chạy local không có khóa API."""

from __future__ import annotations

import io
from collections import deque

from PIL import Image

from ..base import AIError, ImageInput, ImageResponse, TextResponse, Usage


class FakeLLM:
    name = "fake"

    def __init__(self, model: str = "fake", responses: list[str | Exception] | None = None):
        self.model = model
        self.responses: deque[str | Exception] = deque(responses or [])
        self.calls: list[dict] = []

    def complete(self, *, system: str, messages: list[dict], images: list[ImageInput], max_tokens: int) -> TextResponse:
        self.calls.append({"system": system, "messages": list(messages), "images": len(images)})
        if not self.responses:
            raise AIError("fake LLM has no scripted response")
        r = self.responses.popleft()
        if isinstance(r, Exception):
            raise r
        return TextResponse(text=r, usage=Usage(tokens_in=100, tokens_out=50), provider=self.name, model=self.model)


class FakeImage:
    name = "fake"

    def __init__(self, model: str = "fake", fail_times: int = 0):
        self.model = model
        self.fail_times = fail_times
        self.calls = 0

    def edit(self, *, prompt: str, images: list[ImageInput], n: int = 1) -> ImageResponse:
        self.calls += 1
        if self.fail_times > 0:
            self.fail_times -= 1
            raise AIError("fake transient failure", retryable=True)
        size = (64, 64)
        if images:
            size = Image.open(io.BytesIO(images[0].data)).size
        buf = io.BytesIO()
        Image.new("RGB", size, (94, 140, 79)).save(buf, format="PNG")
        return ImageResponse(
            images=[buf.getvalue()] * n, usage=Usage(images_out=n), provider=self.name, model=self.model
        )
