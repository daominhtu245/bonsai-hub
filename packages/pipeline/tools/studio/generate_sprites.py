"""Tạo thư viện chi tiết cây cho màn Tự thiết kế (tầng lá theo kiểu lá, ngọn, chậu, rêu, đá) — ảnh PNG nền trong suốt.

Chạy một lần (hoặc khi muốn làm mới), kết quả lưu vào repo — người dùng không tốn chi phí AI khi dùng thư viện:

    OPENAI_API_KEY=... python packages/pipeline/tools/studio/generate_sprites.py [--only key1,key2] [--quality medium]

Ra: packages/pipeline/bonsai_pipeline/assets/studio/<key>.webp (đã cắt sát viền, cạnh dài ≤ 640 px) + manifest.json,
và bản sao ở apps/web/public/studio/ cho giao diện. Ảnh do AI tạo cho dự án (ghi ở apps/web/public/images/CREDITS.md).
"""

from __future__ import annotations

import argparse
import base64
import io
import json
import os
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
OUT = ROOT / "packages/pipeline/bonsai_pipeline/assets/studio"
WEB = ROOT / "apps/web/public/studio"
MAX_EDGE = 640

PAD = ("one single bonsai foliage pad seen from the side at eye level: {leaf}; {shape}. "
       "Dense, well-ramified like a trained bonsai canopy layer, natural daylight, realistic photo, centered, "
       "fully isolated on a transparent background, no branch, no trunk, no pot, no shadow, no text")
LEAVES = {
    "ficus": ("Lá si / sanh", ["si", "sanh"], "small glossy oval dark-green ficus leaves densely packed"),
    "fine": ("Lá nhỏ li ti", ["mai_chieu_thuy", "linh_sam"], "tiny rounded bright-green leaves on very fine twigs, delicate texture"),
    "needle": ("Lá kim (tùng, thông)", ["other"], "short dense blue-green juniper/pine needle foliage in tufts"),
    "strap": ("Lá dải (tùng la hán)", ["tung_la_han"], "narrow strap-like dark-green podocarpus leaves arranged in tufts"),
}
SHAPES = {
    "wide": ("Tầng rộng", "a wide flat-bottomed cloud-shaped pad, about 2.5 times wider than tall, gently domed top", "pad"),
    "flat": ("Tầng dẹt", "a thin elongated flat layer, about 4 times wider than tall, slightly uneven edges", "pad"),
    "apex": ("Ngọn", "a small rounded crown for the top of the tree, about 1.3 times wider than tall", "pad"),
}
EXTRAS = {
    "pot_rect_brown": ("Chậu chữ nhật nâu", "pot", "a shallow rectangular unglazed dark-brown ceramic bonsai pot with small feet, front view at eye level, empty top edge visible, filled with soil"),
    "pot_oval_brown": ("Chậu bầu dục nâu", "pot", "a shallow oval unglazed reddish-brown ceramic bonsai pot, front view at eye level, filled with soil"),
    "pot_round_blue": ("Chậu tròn men xanh", "pot", "a round glazed blue ceramic bonsai pot, medium depth, front view at eye level, filled with soil"),
    "pot_rect_cream": ("Chậu chữ nhật men kem", "pot", "a shallow rectangular cream-glazed ceramic bonsai pot with small feet, front view at eye level, filled with soil"),
    "pot_cascade": ("Chậu sâu (dáng huyền)", "pot", "a tall deep square unglazed brown cascade bonsai pot, front view at eye level, filled with soil"),
    "moss": ("Rêu", "accent", "a low mound of bright green bonsai cushion moss, about 4 times wider than tall"),
    "rock": ("Đá trang trí", "accent", "a small weathered grey accent rock for bonsai display"),
}
SOIL_Y = {"pot_oval_brown": 0.22, "pot_rect_brown": 0.16, "pot_round_blue": 0.14, "pot_rect_cream": 0.2, "pot_cascade": 0.05}
POT_SHAPE = {"pot_rect_brown": ("rectangle", "unglazed_brown"), "pot_oval_brown": ("oval", "unglazed_brown"),
             "pot_round_blue": ("round", "glazed_blue"), "pot_rect_cream": ("rectangle", "glazed_cream"),
             "pot_cascade": ("cascade_deep", "unglazed_brown")}
EXTRA_PROMPT = "{desc}, realistic photo, natural daylight, centered, fully isolated on a transparent background, no plant, no shadow, no text"


def items() -> list[dict]:
    out = []
    for lk, (lvi, species, ldesc) in LEAVES.items():
        for sk, (svi, sdesc, cat) in SHAPES.items():
            out.append({"key": f"{lk}_{sk}", "label_vi": f"{svi} · {lvi}", "category": "apex" if sk == "apex" else "pad",
                        "leaf": lk, "species": species, "prompt": PAD.format(leaf=ldesc, shape=sdesc)})
    for k, (vi, cat, desc) in EXTRAS.items():
        it = {"key": k, "label_vi": vi, "category": cat, "prompt": EXTRA_PROMPT.format(desc=desc)}
        if k in POT_SHAPE:
            it["pot_shape"], it["pot_color"] = POT_SHAPE[k]
            it["soil_y"] = SOIL_Y[k]  # đo tay trên ảnh đã tạo: mặt đất trong chậu, gốc cây đặt ở đây
        out.append(it)
    return out


def trim(png: bytes) -> "Image.Image":
    from PIL import Image

    im = Image.open(io.BytesIO(png)).convert("RGBA")
    alpha = im.getchannel("A").point(lambda a: 255 if a > 24 else 0)
    box = alpha.getbbox() or (0, 0, im.width, im.height)
    im = im.crop(box)
    scale = MAX_EDGE / max(im.size)
    if scale < 1:
        im = im.resize((round(im.width * scale), round(im.height * scale)), Image.Resampling.LANCZOS)
    return im


def main() -> None:
    import openai

    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="")
    ap.add_argument("--quality", default="medium")
    ap.add_argument("--model", default="gpt-image-1.5")  # gpt-image-2 không hỗ trợ nền trong suốt
    args = ap.parse_args()
    only = {k for k in args.only.split(",") if k}
    OUT.mkdir(parents=True, exist_ok=True)
    client = openai.OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    manifest_path = OUT / "manifest.json"
    manifest = {m["key"]: m for m in json.loads(manifest_path.read_text())} if manifest_path.exists() else {}
    for it in items():
        if only and it["key"] not in only:
            continue
        r = client.images.generate(model=args.model, prompt=it["prompt"], size="1536x1024" if it["category"] in ("pad", "accent") else "1024x1024",
                                   quality=args.quality, background="transparent", output_format="png", n=1)
        im = trim(base64.b64decode(r.data[0].b64_json))
        im.save(OUT / f"{it['key']}.webp", "WEBP", quality=88, method=6)
        meta = {k: v for k, v in it.items() if k != "prompt"}
        meta |= {"file": f"{it['key']}.webp", "aspect": round(im.height / im.width, 3)}
        manifest[it["key"]] = meta
        print("ok", it["key"], im.size)
    manifest_path.write_text(json.dumps(list(manifest.values()), ensure_ascii=False, indent=1))
    WEB.mkdir(parents=True, exist_ok=True)
    for f in OUT.iterdir():
        shutil.copy(f, WEB / f.name)


if __name__ == "__main__":
    main()
