"""Bản ghi một bước pipeline — worker lưu thành 1 dòng `pipeline_steps`."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .adapters.base import CallTrace
from .pricing import cost_usd


@dataclass
class StepRecord:
    step_code: str
    provider: str
    model: str
    prompt_version: str | None
    tokens_in: int
    tokens_out: int
    images_out: int
    cost_usd: float
    latency_ms: int
    ok: bool
    output: dict[str, Any] | None = None
    error: str | None = None
    attempts: int = 1
    extra: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_trace(
        cls,
        step_code: str,
        trace: CallTrace,
        *,
        prompt_version: str | None,
        ok: bool,
        output: dict[str, Any] | None = None,
        error: str | None = None,
    ) -> "StepRecord":
        calls = trace.calls
        last = calls[-1] if calls else None
        usage = trace.usage
        return cls(
            step_code=step_code,
            provider=last.provider if last else "none",
            model=last.model if last else "none",
            prompt_version=prompt_version,
            tokens_in=usage.tokens_in,
            tokens_out=usage.tokens_out,
            images_out=usage.images_out,
            cost_usd=round(sum(cost_usd(c.model, c.usage) for c in calls), 6),
            latency_ms=sum(c.latency_ms for c in calls),
            ok=ok,
            output=output,
            error=error,
            attempts=len(calls),
        )
