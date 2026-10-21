from __future__ import annotations

import base64

import anthropic

from ..base import AIError, ImageInput, TextResponse, Usage

# Sonnet 5.5 trên Claude API: bật chuyển model tự động khi bị từ chối theo chính sách.
_FALLBACK_BETA = "server-side-fallback-2026-07-01"


class AnthropicLLM:
    name = "anthropic"

    def __init__(self, model: str, api_key: str | None, effort: str = "medium"):
        self.model = model
        self.effort = effort
        self._client = anthropic.Anthropic(api_key=api_key) if api_key else anthropic.Anthropic()

    def complete(self, *, system: str, messages: list[dict], images: list[ImageInput], max_tokens: int) -> TextResponse:
        api_messages = []
        for i, m in enumerate(messages):
            if i == 0 and images:
                content = [_image_block(img) for img in images] + [{"type": "text", "text": m["content"]}]
            else:
                content = m["content"]
            api_messages.append({"role": m["role"], "content": content})
        try:
            resp = self._client.beta.messages.create(
                model=self.model,
                max_tokens=max_tokens,
                system=system,
                messages=api_messages,
                thinking={"type": "adaptive"},
                output_config={"effort": self.effort},
                betas=[_FALLBACK_BETA],
                fallbacks="default",
            )
        except anthropic.RateLimitError as e:
            raise AIError(f"anthropic rate limited: {e.message}", retryable=True) from e
        except anthropic.APIStatusError as e:
            raise AIError(f"anthropic {e.status_code}: {e.message}", retryable=e.status_code >= 500) from e
        except anthropic.APIConnectionError as e:
            raise AIError(f"anthropic connection error: {e}", retryable=True) from e

        if resp.stop_reason == "refusal":
            raise AIError("anthropic refused the request")
        if resp.stop_reason == "max_tokens":
            raise AIError("anthropic hit max_tokens before finishing")
        text = "".join(b.text for b in resp.content if b.type == "text")
        usage = Usage(tokens_in=resp.usage.input_tokens, tokens_out=resp.usage.output_tokens)
        return TextResponse(text=text, usage=usage, provider=self.name, model=resp.model or self.model)


def _image_block(img: ImageInput) -> dict:
    return {
        "type": "image",
        "source": {
            "type": "base64",
            "media_type": img.media_type,
            "data": base64.standard_b64encode(img.data).decode("ascii"),
        },
    }
