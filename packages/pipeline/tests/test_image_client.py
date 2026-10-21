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
