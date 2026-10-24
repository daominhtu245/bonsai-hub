from types import SimpleNamespace

from bonsai_pipeline.adapters.base import ImageInput
from bonsai_pipeline.adapters.providers.openai_llm import OpenAILLM


class _Completions:
    def __init__(self):
        self.kwargs = None

    def create(self, **kwargs):
        self.kwargs = kwargs
        msg = SimpleNamespace(content='{"ok": true}', refusal=None)
        return SimpleNamespace(
            choices=[SimpleNamespace(message=msg, finish_reason="stop")],
            usage=SimpleNamespace(prompt_tokens=120, completion_tokens=30),
            model="gpt-5-mini-2025-08-07",
        )


def _provider(model: str) -> tuple[OpenAILLM, _Completions]:
    p = OpenAILLM(model=model, api_key="test")
    comp = _Completions()
    p._client = SimpleNamespace(chat=SimpleNamespace(completions=comp))
    return p, comp


def test_sends_system_images_and_json_mode():
    p, comp = _provider("gpt-5-mini")
    resp = p.complete(system="sys", messages=[{"role": "user", "content": "hi"}],
                      images=[ImageInput(b"abc", "image/webp")], max_tokens=500)
    assert resp.text == '{"ok": true}' and resp.usage.tokens_in == 120 and resp.usage.tokens_out == 30
    k = comp.kwargs
    assert k["messages"][0] == {"role": "system", "content": "sys"}
    parts = k["messages"][1]["content"]
    assert parts[0]["image_url"]["url"].startswith("data:image/webp;base64,")
    assert parts[1] == {"type": "text", "text": "hi"}
    assert k["response_format"] == {"type": "json_object"} and k["max_completion_tokens"] == 500
    assert k["reasoning_effort"] == "medium"


def test_non_reasoning_model_omits_effort():
    p, comp = _provider("gpt-4.1")
    p.complete(system="s", messages=[{"role": "user", "content": "x"}], images=[], max_tokens=10)
    assert "reasoning_effort" not in comp.kwargs


def _img(size, fmt="WEBP") -> bytes:
    import io

    from PIL import Image

    buf = io.BytesIO()
    Image.new("RGB", size, (200, 220, 200)).save(buf, format=fmt)
    return buf.getvalue()


def _fake_openai_image(out_size):
    import base64

    from bonsai_pipeline.adapters.providers.openai_image import OpenAIImage

    sent = {}

    def edit(**kwargs):
        sent.update(kwargs)
        return SimpleNamespace(data=[SimpleNamespace(b64_json=base64.b64encode(_img(out_size, "PNG")).decode())],
                               usage=SimpleNamespace(input_tokens=10, output_tokens=200))

    p = OpenAIImage(model="gpt-image-2", api_key="test")
    p._client = SimpleNamespace(images=SimpleNamespace(edit=edit))
    return p, sent


def test_image_edit_sends_mimetype_quality_and_size():
    p, sent = _fake_openai_image((1024, 1024))
    resp = p.edit(prompt="x", images=[ImageInput(_img((512, 512)), "image/webp")], quality="low")
    name, data, mime = sent["image"][0]
    assert (name, mime) == ("input_0.webp", "image/webp")
    assert sent["quality"] == "low" and sent["size"] == "1024x1024"
    assert resp.usage.tokens_out == 200 and resp.usage.images_out == 1


def test_image_edit_keeps_original_aspect():
    import io

    from PIL import Image

    # 16:9 → khổ gần nhất 1536x1024; ảnh vào được đệm lề, ảnh ra cắt về 16:9.
    p, sent = _fake_openai_image((1536, 1024))
    resp = p.edit(prompt="x", images=[ImageInput(_img((1600, 900)), "image/webp")])
    assert sent["size"] == "1536x1024" and sent["quality"] == "medium"
    assert Image.open(io.BytesIO(sent["image"][0][1])).size == (1536, 1024)
    w, h = Image.open(io.BytesIO(resp.images[0])).size
    assert abs(w / h - 16 / 9) < 0.01
