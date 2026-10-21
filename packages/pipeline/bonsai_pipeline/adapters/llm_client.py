"""Adapter LLM: gọi model, ép JSON theo schema Pydantic, gọi lại khi JSON lỗi, chuyển nhà cung cấp dự phòng.

Quy ước (CLAUDE.md): JSON lỗi → gọi lại tối đa 2 lần kèm thông báo lỗi.
"""

from __future__ import annotations

import json
import re
import time
from dataclasses import dataclass
from collections.abc import Callable
from typing import Generic, TypeVar

from pydantic import BaseModel, ValidationError

from ..config import AISettings, get_ai_settings
from .base import AIError, CallTrace, ImageInput, LLMProvider, ProviderCall, SchemaValidationError, Usage

T = TypeVar("T", bound=BaseModel)

JSON_INSTRUCTION = (
    "\n\nReturn ONLY one JSON object that validates against this JSON Schema. "
    "No markdown fences, no prose.\n{schema}"
)
RETRY_MESSAGE = (
    "Your previous answer was not valid for the required schema.\n"
    "Errors:\n{errors}\n"
    "Return the corrected JSON object only."
)

_FENCE = re.compile(r"^```(?:json)?\s*|\s*```$", re.MULTILINE)


@dataclass
class JSONResult(Generic[T]):
    value: T
    raw: dict
    trace: CallTrace


def extract_json(text: str) -> dict:
    """Lấy object JSON đầu tiên trong câu trả lời (chịu được code fence, chữ thừa)."""
    cleaned = _FENCE.sub("", text.strip())
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        start, end = cleaned.find("{"), cleaned.rfind("}")
        if start == -1 or end <= start:
            raise
        return json.loads(cleaned[start : end + 1])


def _format_validation(err: ValidationError) -> str:
    lines = []
    for e in err.errors()[:20]:
        loc = ".".join(str(p) for p in e["loc"]) or "<root>"
        lines.append(f"- {loc}: {e['msg']}")
    return "\n".join(lines)


class LLMClient:
    def __init__(self, primary: LLMProvider, fallback: LLMProvider | None = None, *, max_retries: int = 2):
        self.primary = primary
        self.fallback = fallback
        self.max_retries = max_retries

    def complete_json(
        self,
        *,
        system: str,
        user: str,
        schema: type[T],
        images: list[ImageInput] | None = None,
        max_tokens: int = 16000,
        hard_rules: Callable[[T], list[str]] | None = None,
    ) -> JSONResult[T]:
        """Trả về object đã kiểm schema. `hard_rules(value) -> list[str]` là luật cứng do code kiểm thêm."""
        trace = CallTrace()
        providers = [self.primary] + ([self.fallback] if self.fallback else [])
        last_error: Exception | None = None
        for provider in providers:
            try:
                return self._run_with_retries(
                    provider, system, user, schema, images or [], max_tokens, hard_rules, trace
                )
            except SchemaValidationError:
                raise
            except AIError as e:
                last_error = e
                continue
        raise AIError(f"all LLM providers failed: {last_error}")

    def _run_with_retries(self, provider, system, user, schema, images, max_tokens, hard_rules, trace):
        schema_json = json.dumps(schema.model_json_schema(), ensure_ascii=False)
        messages: list[dict] = [{"role": "user", "content": user + JSON_INSTRUCTION.format(schema=schema_json)}]
        errors_text = ""
        for _attempt in range(self.max_retries + 1):
            started = time.monotonic()
            try:
                resp = provider.complete(system=system, messages=messages, images=images, max_tokens=max_tokens)
            except AIError as e:
                trace.calls.append(
                    ProviderCall(provider.name, provider.model, Usage(), _ms(started), ok=False, error=str(e))
                )
                raise
            call = ProviderCall(provider.name, provider.model, resp.usage, _ms(started), ok=True)
            trace.calls.append(call)
            try:
                raw = extract_json(resp.text)
                value = schema.model_validate(raw)
                violations = hard_rules(value) if hard_rules else []
                if not violations:
                    return JSONResult(value=value, raw=raw, trace=trace)
                errors_text = "\n".join(f"- {v}" for v in violations)
            except json.JSONDecodeError as e:
                errors_text = f"- not valid JSON: {e}"
            except ValidationError as e:
                errors_text = _format_validation(e)
            call.ok = False
            call.error = errors_text
            messages = messages + [
                {"role": "assistant", "content": resp.text},
                {"role": "user", "content": RETRY_MESSAGE.format(errors=errors_text)},
            ]
        raise SchemaValidationError(f"invalid JSON after {self.max_retries} retries:\n{errors_text}")


def _ms(started: float) -> int:
    return int((time.monotonic() - started) * 1000)


def build_llm_provider(name: str, model: str, settings: AISettings) -> LLMProvider:
    if name == "anthropic":
        from .providers.anthropic_llm import AnthropicLLM

        return AnthropicLLM(model=model, api_key=settings.anthropic_api_key, effort=settings.llm_effort)
    if name == "gemini":
        from .providers.gemini import GeminiLLM

        return GeminiLLM(model=model, api_key=settings.gemini_api_key)
    if name == "fake":
        from .providers.fake import FakeLLM

        return FakeLLM(model=model)
    raise ValueError(f"unknown LLM provider: {name}")


def get_llm_client(settings: AISettings | None = None) -> LLMClient:
    s = settings or get_ai_settings()
    primary = build_llm_provider(s.llm_provider, s.llm_model, s)
    fallback = None
    if s.llm_fallback_provider and s.llm_fallback_model:
        fallback = build_llm_provider(s.llm_fallback_provider, s.llm_fallback_model, s)
    return LLMClient(primary, fallback, max_retries=s.json_max_retries)
