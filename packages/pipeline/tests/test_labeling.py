

def test_local_drafts_without_api():
    """Nháp miễn phí: tách được thân (gỗ chạm gốc) khỏi chậu và tán lá trên ảnh tổng hợp."""
    import io

    import numpy as np
    from PIL import Image, ImageDraw

    from bonsai_pipeline.labeling import find_ground, local_drafts

    img = Image.new("RGB", (400, 600), (235, 235, 235))
    d = ImageDraw.Draw(img)
    d.rectangle([120, 470, 280, 580], fill=(150, 80, 50))  # chậu
    d.rectangle([188, 200, 212, 470], fill=(110, 75, 50))  # thân
    d.line([200, 300, 300, 260], fill=(110, 75, 50), width=8)  # cành
    d.ellipse([110, 120, 300, 230], fill=(60, 140, 60))  # tán
    d.ellipse([270, 230, 340, 270], fill=(60, 140, 60))
    buf = io.BytesIO()
    img.save(buf, "PNG")
    rgb = np.asarray(img)

    class Remover:  # thay model tách nền: mọi thứ không phải nền xám
        def alpha(self, im):
            return (np.abs(rgb.astype(int) - 235).sum(2) > 30).astype(float)

    obj = Remover().alpha(img) > 0.5
    assert 460 <= find_ground(obj, 120, 580) <= 475  # mặt chậu
    objs = {o.id: o for o in local_drafts(buf.getvalue(), Remover())}
    trunk = objs["trunk"].mask
    assert trunk[350, 200] and not trunk[520, 150] and not trunk[170, 200]  # thân, không dính chậu / lá
    assert any(o.cls == "branch" and o.mask[276, 260] for o in objs.values()) or trunk[276, 260]
