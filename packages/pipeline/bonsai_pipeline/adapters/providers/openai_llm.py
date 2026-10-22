"""OpenAI Chat Completions làm LLM (khi chỉ có khóa OpenAI)."""

from __future__ import annotations

import base64

import openai

from ..base import AIError, ImageInput, TextResponse, Usage

# Model suy luận (gpt-5*, o*) nhận reasoning_effort; model thường (gpt-4.1, gpt-4o) báo lỗi nếu gửi.
_REASONING_PREFIXES = ("gpt-5", "o1", "o3", "o4")


class OpenAILLM:
    name = "openai"

    def __init__(self, model: str, api_key: str | None, effort: str = "medium"):
        self.model = model
        self.effort = effort
        self._client = openai.OpenAI(api_key=api_key) if api_key else openai.OpenAI()

    def complete(self, *, system: str, messages: list[dict], images: list[ImageInput], max_tokens: int) -> TextResponse:
        api_messages: list[dict] = [{"role": "system", "content": system}]
        for i, m in enumerate(messages):
            if i == 0 and images:
                content = [_image_part(img) for img in images] + [{"type": "text", "text": m["content"]}]
            else:
                content = m["content"]
            api_messages.append({"role": m["role"], "content": content})
        extra = {"reasoning_effort": self.effort} if self.model.startswith(_REASONING_PREFIXES) else {}
        try:
            resp = self._client.chat.completions.create(
                model=self.model,
                messages=api_messages,
                max_completion_tokens=max_tokens,
                response_format={"type": "json_object"},
                **extra,
            )
        except openai.RateLimitError as e:
            raise AIError(f"openai rate limited: {e}", retryable=True) from e
        except openai.APIStatusError as e:
            raise AIError(f"openai {e.status_code}: {e}", retryable=e.status_code >= 500) from e
        except openai.APIConnectionError as e:
            raise AIError(f"openai connection error: {e}", retryable=True) from e

        choice = resp.choices[0]
        if choice.finish_reason == "length":
            raise AIError("openai hit max_completion_tokens before finishing")
        if getattr(choice.message, "refusal", None):
            raise AIError(f"openai refused the request: {choice.message.refusal}")
        usage = Usage(
            tokens_in=resp.usage.prompt_tokens if resp.usage else 0,
            tokens_out=resp.usage.completion_tokens if resp.usage else 0,
        )
        return TextResponse(text=choice.message.content or "", usage=usage, provider=self.name, model=resp.model or self.model)


def _image_part(img: ImageInput) -> dict:
    data = base64.standard_b64encode(img.data).decode("ascii")
    return {"type": "image_url", "image_url": {"url": f"data:{img.media_type};base64,{data}", "detail": "high"}}
