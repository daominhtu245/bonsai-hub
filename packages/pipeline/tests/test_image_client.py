import io

import pytest
from PIL import Image

from bonsai_pipeline.adapters.base import AIError, ImageInput
from bonsai_pipeline.adapters.image_client import ImageClient
from bonsai_pipeline.adapters.providers.fake import FakeImage


def _png(w=40, h=30):
    buf = io.BytesIO()
    Image.new("RGB", (w, h)).save(buf, format="PNG")
    return ImageInput(buf.getvalue(), "image/png")


def test_backoff_then_success():
    delays = []
    provider = FakeImage(fail_times=2)
    res = ImageClient(provider, max_retries=3, sleep=delays.append).edit(prompt="p", images=[_png()], n=3)
    assert len(res.response.images) == 3
    assert delays == [2.0, 4.0]
    assert Image.open(io.BytesIO(res.response.images[0])).size == (40, 30)


def test_falls_back_after_exhausting_retries():
    primary = FakeImage(fail_times=10)
    fallback = FakeImage(model="gpt-image-1")
    res = ImageClient(primary, fallback, max_retries=3, sleep=lambda _: None).edit(prompt="p", images=[_png()])
    assert res.response.model == "gpt-image-1"
    assert primary.calls == 4


def test_all_fail():
    with pytest.raises(AIError):
        ImageClient(FakeImage(fail_times=10), max_retries=1, sleep=lambda _: None).edit(prompt="p", images=[])


def test_openai_mask_matches_sent_image_size():
    import io

    from PIL import Image

    from bonsai_pipeline.adapters.providers.openai_image import _content_box, openai_mask, pick_size

    def png(size, color=255):
        buf = io.BytesIO()
        Image.new("L", size, color).save(buf, "PNG")
        return buf.getvalue()

    # ảnh vuông 720×720: không đệm lề → mặt nạ cỡ 720×720 (OpenAI báo lỗi nếu khác cỡ ảnh)
    src = (720, 720)
    size = pick_size(*src)
    padded = _content_box(src, size) != (0, 0, *size)
    m = Image.open(io.BytesIO(openai_mask(png(src), src, size if padded else src)))
    assert not padded and m.size == src and m.mode == "RGBA" and m.getpixel((10, 10))[3] == 0  # trắng → trong suốt (được sửa)
    # ảnh 1000×1500: đệm lề vào 1024×1536 → mặt nạ cỡ khung, lề giữ nguyên (không trong suốt)
    src = (1000, 1600)
    size = pick_size(*src)
    m = Image.open(io.BytesIO(openai_mask(png(src), src, size)))
    assert m.size == size and m.getpixel((0, 0))[3] == 255 and m.getpixel((size[0] // 2, size[1] // 2))[3] == 0


def test_out_of_credit_is_not_retried():
    from bonsai_pipeline.adapters.base import out_of_credit

    assert out_of_credit(Exception("Error code: 429 - {'code': 'credit_balance_exhausted'}"))
    assert out_of_credit(Exception("You exceeded your current quota, please check your plan and billing details."))
    assert not out_of_credit(Exception("Rate limit reached for requests per min. Please try again in 2s."))
