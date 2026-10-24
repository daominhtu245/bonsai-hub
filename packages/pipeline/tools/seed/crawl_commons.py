"""Thu thập ảnh bonsai tham chiếu theo thế (và ảnh phôi) từ Wikimedia Commons — chỉ ảnh giấy phép mở.

    python packages/pipeline/tools/seed/crawl_commons.py --max-per-group 40 --download

Ra:
- data/seed/commons_refs.jsonl — danh sách (commit được): nhóm, tên file, URL trang, URL ảnh, cỡ, giấy phép, tác giả.
- data/seed/refs/<nhóm>/<file>.jpg — ảnh thu nhỏ cạnh dài 1024 px (không commit; tải lại bằng --download).

Dùng cho: ảnh tham chiếu thế / loài trong P3a – P4, bộ ảnh phôi thử Cổng 1, dữ liệu huấn luyện model chấm dáng.
Khi hiển thị cho người dùng phải ghi tác giả + giấy phép (cột `credit`).
"""

from __future__ import annotations

import argparse
import html
import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

API = "https://commons.wikimedia.org/w/api.php"
UA = "BonsaiAI-seed/0.1 (dataset of openly licensed bonsai references; https://commons.wikimedia.org/wiki/Commons:Reusing_content)"
ROOT = Path(__file__).resolve().parents[4]
OUT = ROOT / "data" / "seed"

# nhóm → danh mục Commons (khóa thế trùng bonsai_pipeline.dictionaries.STYLES; "prebonsai" = ảnh phôi)
GROUPS: dict[str, list[str]] = {
    "chokkan": ["Formal upright style bonsai"],
    "moyogi": ["Informal upright style bonsai"],
    "shakan": ["Slanting style bonsai"],
    "kengai": ["Cascade style bonsai"],
    "han_kengai": ["Semi cascade style bonsai"],
    "bunjingi": ["Literati style bonsai"],
    "fukinagashi": ["Windswept bonsai"],
    "sekijoju": ["Root over rock bonsai"],
    "hokidachi": ["Broom style bonsai"],
    "kabudachi": ["Kabudachi style bonsai"],
    "yose_ue": ["Forest style bonsai", "Group style bonsai"],
    "banyan": ["Banyan style bonsai"],
    "deadwood": ["Sharimiki style bonsai", "Sabamiki style bonsai"],
    "prebonsai": ["Pre-bonsai"],
    "ficus": ["Ficus microcarpa bonsai", "Ficus bonsai"],
    "podocarpus": ["Podocarpus bonsai"],
}
OPEN_LICENSE = re.compile(r"^(CC0|CC BY(-SA)? [0-9.]+|CC BY(-SA)?|Public domain|PD\b)", re.I)
MIN_EDGE = 600


def api(params: dict) -> dict:
    url = API + "?" + urllib.parse.urlencode({**params, "format": "json", "formatversion": 2})
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def files_in(category: str, limit: int) -> list[str]:
    """File trong danh mục + danh mục con 1 cấp."""
    titles: list[str] = []
    cats = [f"Category:{category}"]
    sub = api({"action": "query", "list": "categorymembers", "cmtitle": cats[0], "cmtype": "subcat", "cmlimit": 50})
    cats += [c["title"] for c in sub.get("query", {}).get("categorymembers", [])]
    for cat in cats:
        cont: dict = {}
        while len(titles) < limit * 3:
            res = api({"action": "query", "list": "categorymembers", "cmtitle": cat, "cmtype": "file", "cmlimit": 200, **cont})
            titles += [m["title"] for m in res.get("query", {}).get("categorymembers", [])]
            if "continue" not in res:
                break
            cont = res["continue"]
            time.sleep(0.2)
    return list(dict.fromkeys(titles))


def _plain(s: str | None) -> str:
    return html.unescape(re.sub(r"<[^>]+>", "", s or "")).strip()


def describe(titles: list[str]) -> list[dict]:
    out = []
    for i in range(0, len(titles), 40):
        res = api({"action": "query", "titles": "|".join(titles[i:i + 40]), "prop": "imageinfo",
                   "iiprop": "url|size|mime|extmetadata", "iiurlwidth": 1024})
        for page in res.get("query", {}).get("pages", []):
            info = (page.get("imageinfo") or [None])[0]
            if not info or info.get("mime") not in ("image/jpeg", "image/png", "image/webp"):
                continue
            meta = info.get("extmetadata", {})
            lic = _plain(meta.get("LicenseShortName", {}).get("value"))
            if not OPEN_LICENSE.match(lic) or min(info["width"], info["height"]) < MIN_EDGE:
                continue
            artist = _plain(meta.get("Artist", {}).get("value")) or "Unknown"
            out.append({
                "title": page["title"], "page_url": info["descriptionurl"], "image_url": info.get("thumburl") or info["url"],
                "width": info["width"], "height": info["height"], "license": lic,
                "license_url": _plain(meta.get("LicenseUrl", {}).get("value")) or None, "artist": artist,
                "description": _plain(meta.get("ImageDescription", {}).get("value"))[:300],
                "credit": f"{artist} — {lic}, via Wikimedia Commons",
            })
        time.sleep(0.2)
    return out


def slug(title: str) -> str:
    name = title.removeprefix("File:").rsplit(".", 1)[0]
    return re.sub(r"[^A-Za-z0-9._-]+", "_", name)[:80]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-per-group", type=int, default=40)
    ap.add_argument("--download", action="store_true")
    ap.add_argument("--groups", nargs="*", default=list(GROUPS))
    a = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    rows: list[dict] = []
    seen: set[str] = set()
    for group in a.groups:
        titles: list[str] = []
        for cat in GROUPS[group]:
            try:
                titles += files_in(cat, a.max_per_group)
            except Exception as e:  # noqa: BLE001 — danh mục không tồn tại / mạng lỗi: bỏ qua nhóm đó
                print(f"  {group}: {cat}: {e}")
        picked = [r for r in describe([t for t in dict.fromkeys(titles) if t not in seen]) if r["title"] not in seen][: a.max_per_group]
        for r in picked:
            seen.add(r["title"])
            r["group"] = group
            r["file"] = f"refs/{group}/{slug(r['title'])}.jpg"
        rows += picked
        print(f"{group:12s} {len(picked):3d} ảnh (từ {len(titles)} file)")
    with open(OUT / "commons_refs.jsonl", "w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    print(f"tổng {len(rows)} ảnh → {OUT / 'commons_refs.jsonl'}")
    if a.download:
        for r in rows:
            dst = OUT / r["file"]
            if dst.exists():
                continue
            dst.parent.mkdir(parents=True, exist_ok=True)
            req = urllib.request.Request(r["image_url"], headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as resp:
                dst.write_bytes(resp.read())
            time.sleep(0.1)
        print("đã tải ảnh vào", OUT / "refs")


if __name__ == "__main__":
    main()
