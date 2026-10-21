"""Kiểu dữ liệu chung cho các adapter AI.

Pipeline chỉ làm việc với các kiểu ở đây; mỗi nhà cung cấp (Anthropic, Gemini, OpenAI…)
được bọc trong một provider riêng, chọn bằng cấu hình.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol


@dataclass(frozen=True)
class ImageInput:
    data: bytes
    media_type: str = "image/webp"


@dataclass
class Usage:
    tokens_in: int = 0
    tokens_out: int = 0
    images_out: int = 0

    def __iadd__(self, other: "Usage") -> "Usage":
        self.tokens_in += other.tokens_in
        self.tokens_out += other.tokens_out
        self.images_out += other.images_out
        return self


@dataclass
class TextResponse:
    text: str
    usage: Usage
    provider: str
    model: str


@dataclass
class ImageResponse:
    images: list[bytes]
    usage: Usage
    provider: str
    model: str
    media_type: str = "image/png"


@dataclass
class ProviderCall:
    """Một lần gọi nhà cung cấp; dùng để ghi chi phí từng lần thử."""

    provider: str
    model: str
    usage: Usage
    latency_ms: int
    ok: bool
    error: str | None = None


@dataclass
class CallTrace:
    calls: list[ProviderCall] = field(default_factory=list)

    @property
    def usage(self) -> Usage:
        total = Usage()
        for c in self.calls:
            total += c.usage
        return total


class AIError(Exception):
    """Lỗi từ nhà cung cấp AI. `trace` (nếu có) chứa các lần gọi đã tốn tiền trước khi lỗi."""

    def __init__(self, message: str, *, retryable: bool = False, trace: CallTrace | None = None):
        super().__init__(message)
        self.retryable = retryable
        self.trace = trace


class SchemaValidationError(AIError):
    """Model trả JSON sai schema sau khi đã gọi lại hết số lần cho phép."""


class LLMProvider(Protocol):
    name: str
    model: str

    def complete(
        self,
        *,
        system: str,
        messages: list[dict],
        images: list[ImageInput],
        max_tokens: int,
    ) -> TextResponse:
        """`messages`: [{"role": "user"|"assistant", "content": str}]; ảnh gắn vào lượt user đầu tiên."""
        ...


class ImageProvider(Protocol):
    name: str
    model: str

    def edit(self, *, prompt: str, images: list[ImageInput], n: int = 1) -> ImageResponse: ...
