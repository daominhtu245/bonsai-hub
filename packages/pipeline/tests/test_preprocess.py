import io

import pytest
from PIL import Image

from bonsai_pipeline.preprocess import InvalidImageError, prepare_upload


def _jpeg_with_gps(w, h, orientation=1):
    img = Image.new("RGB", (w, h), (120, 80, 40))
    exif = Image.Exif()
    exif[0x0112] = orientation  # Orientation
    exif[0x010F] = "PhoneMaker"
    exif.get_ifd(0x8825)[2] = (10.0, 45.0, 0.0)  # GPSLatitude
    buf = io.BytesIO()
    img.save(buf, format="JPEG", exif=exif)
    return buf.getvalue()


def test_resizes_long_edge_and_strips_metadata():
    out = prepare_upload(_jpeg_with_gps(4000, 3000))
    img = Image.open(io.BytesIO(out.data))
    assert img.format == "WEBP"
    assert max(img.size) == 1536 and img.size == (1536, 1152)
    assert not img.getexif()
    assert "exif" not in img.info and "xmp" not in img.info


def test_applies_exif_rotation():
    out = prepare_upload(_jpeg_with_gps(3000, 2000, orientation=6))
    assert (out.width, out.height) == (1024, 1536)


def test_small_images_not_upscaled():
    out = prepare_upload(_jpeg_with_gps(800, 600))
    assert (out.width, out.height) == (800, 600)


def test_rejects_garbage():
    with pytest.raises(InvalidImageError):
        prepare_upload(b"definitely not an image")
