"""Gom ảnh phôi / bonsai / cây tự nhiên có giấy phép mở từ Wikimedia Commons, Openverse (Flickr CC…) và iNaturalist.

Chỉ lấy giấy phép cho phép dùng thương mại + chỉnh sửa (CC0, PDM, CC BY, CC BY-SA) — dùng được để huấn luyện / đo.
Mỗi ảnh ghi nguồn, tác giả, giấy phép vào data/web/manifest.jsonl. Chạy lại được (bỏ qua ảnh đã có, đệm kết quả tìm).

    .venv/bin/python scripts/dataset/collect_web.py [--only si,sanh] [--max-per-folder 250]

Thư mục: data/web/raw/<loài>/<nhóm>/<nguồn>_<mã>.jpg — nhóm: phoi (cây thô, trước tạo dáng), bonsai (đã thành hình),
trong_chau (cây trồng chậu / vườn ươm — iNaturalist "captive"), tu_nhien (cây ngoài tự nhiên, nhận loài). Loài "_chung" = phôi chưa rõ loài.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[2] / "data" / "web"
RAW = ROOT / "raw"
CACHE = ROOT / ".cache"
MANIFEST = ROOT / "manifest.jsonl"
UA = "BonsaiAI-dataset/1.0 (research; contact via project owner)"
MAX_SIDE = 1280
MIN_SIDE = 400

# key → (tên Việt, tên khoa học, tên tiếng Anh thường gặp). 5 loài đầu có trong bộ luật; còn lại phổ biến ở Việt Nam.
SPECIES: dict[str, tuple[str, list[str], list[str]]] = {
    "si": ("Si", ["Ficus microcarpa"], ["chinese banyan", "ginseng ficus", "tiger bark ficus"]),
    "sanh": ("Sanh", ["Ficus benjamina"], ["weeping fig"]),
    "mai_chieu_thuy": ("Mai chiếu thủy", ["Wrightia religiosa"], ["water jasmine"]),
    "tung_la_han": ("Tùng la hán", ["Podocarpus macrophyllus"], ["buddhist pine", "yew plum pine", "podocarpus"]),
    "linh_sam": ("Linh sam", ["Desmodium unifoliatum", "Trifidacanthus unifoliolatus"], []),
    "bo_de": ("Bồ đề", ["Ficus religiosa"], ["sacred fig", "bodhi tree"]),
    "nguyet_que": ("Nguyệt quế", ["Murraya paniculata"], ["orange jasmine", "murraya"]),
    "tung_bach_xa": ("Tùng (bách xù)", ["Juniperus chinensis", "Juniperus procumbens"], ["chinese juniper", "procumbens nana"]),
    "mai_vang": ("Mai vàng", ["Ochna integerrima"], ["ochna"]),
    "duoi": ("Duối", ["Streblus asper"], ["siamese rough bush", "streblus"]),
    "can_thang": ("Cần thăng", ["Feroniella lucida"], []),
    "khe": ("Khế", ["Averrhoa carambola"], ["star fruit"]),
    "bach_tuyet_mai": ("Bạch tuyết mai", ["Serissa japonica", "Serissa foetida"], ["serissa", "snow rose"]),
    "me": ("Me", ["Tamarindus indica"], ["tamarind"]),
    "loc_vung": ("Lộc vừng", ["Barringtonia acutangula"], ["barringtonia"]),
    "kim_quyt": ("Kim quýt", ["Triphasia trifolia", "Fortunella"], ["limeberry", "kumquat"]),
}
GENERIC_PHOI = ["pre-bonsai", "pre bonsai", "prebonsai", "bonsai stock", "bonsai raw material", "yamadori", "bonsai before styling",
                "bonsai nursery stock", "bonsai material", "collected tree bonsai", "bonsai first styling", "bonsai trunk chop"]
OK_LICENSES = {"cc0", "pdm", "by", "by-sa", "cc-by", "cc-by-sa", "public domain", "cc by 4.0", "cc by-sa 4.0", "cc by 3.0", "cc by-sa 3.0",
               "cc by 2.0", "cc by-sa 2.0", "cc by 2.5", "cc by-sa 2.5", "cc0 1.0", "public domain mark"}


def _get(url: str, *, raw: bool = False, retries: int = 3):
    for i in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=40) as r:
                data = r.read()
            return data if raw else json.loads(data)
        except urllib.error.HTTPError as e:
            if e.code == 429:
                print("  429 — hết lượt tìm hôm nay ở nguồn này", flush=True)
                return None
            if e.code in (403, 404, 410):
                return None
            time.sleep(3)
        except Exception:  # noqa: BLE001 mạng chập chờn
            time.sleep(3)
    return None


def _cached(key: str, url: str):
    CACHE.mkdir(parents=True, exist_ok=True)
    f = CACHE / (hashlib.sha1(key.encode()).hexdigest() + ".json")
    if f.exists():
        return json.loads(f.read_text())
    d = _get(url)
    if d is not None:
        f.write_text(json.dumps(d))
    return d


def _license_ok(lic: str | None) -> bool:
    return bool(lic) and lic.strip().lower() in OK_LICENSES


# ---------- nguồn ----------

def commons(query: str, limit: int) -> list[dict]:
    out, offset = [], 0
    while len(out) < limit and offset < 500:
        url = ("https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode({
            "action": "query", "format": "json", "generator": "search", "gsrsearch": f"{query} filetype:bitmap", "gsrnamespace": 6,
            "gsrlimit": 50, "gsroffset": offset, "prop": "imageinfo", "iiprop": "url|size|extmetadata", "iiurlwidth": MAX_SIDE}))
        d = _cached("commons:" + url, url)
        pages = (d or {}).get("query", {}).get("pages", {})
        if not pages:
            break
        for p in pages.values():
            ii = (p.get("imageinfo") or [{}])[0]
            meta = ii.get("extmetadata", {})
            lic = meta.get("LicenseShortName", {}).get("value")
            if not _license_ok(lic):
                continue
            artist = meta.get("Artist", {}).get("value", "")
            out.append({"source": "commons", "id": str(p["pageid"]), "title": p["title"], "page_url": ii.get("descriptionurl"),
                        "image_url": ii.get("thumburl") or ii.get("url"), "license": lic, "license_url": meta.get("LicenseUrl", {}).get("value"),
                        "author": _strip_html(artist)})
        if "continue" not in (d or {}):
            break
        offset += 50
    return out[:limit]


def openverse(query: str, limit: int) -> list[dict]:
    out, page = [], 1
    while len(out) < limit and page <= 4:
        url = "https://api.openverse.org/v1/images/?" + urllib.parse.urlencode({
            "q": query, "license_type": "commercial,modification", "page_size": 20, "page": page, "mature": "false"})
        d = _cached("ov:" + url, url)
        res = (d or {}).get("results") or []
        for r in res:
            out.append({"source": "openverse-" + (r.get("source") or "x"), "id": r["id"], "title": r.get("title"), "page_url": r.get("foreign_landing_url"),
                        "image_url": r.get("url"), "license": f"cc {r.get('license')} {r.get('license_version') or ''}".strip(),
                        "license_url": r.get("license_url"), "author": r.get("creator")})
        if len(res) < 20:
            break
        page += 1
        time.sleep(1.5)
    return out[:limit]


def inaturalist(taxon: str, limit: int, captive: bool = False) -> list[dict]:
    """captive=True: cây trồng (chậu, vườn ươm) — gần với phôi; False: cây mọc tự nhiên (nhận loài)."""
    out, page = [], 1
    while len(out) < limit and page <= 5:
        q = {"taxon_name": taxon, "photo_license": "cc-by,cc-by-sa,cc0", "per_page": 50, "page": page, "order_by": "votes"}
        q.update({"captive": "true"} if captive else {"quality_grade": "research"})
        url = "https://api.inaturalist.org/v1/observations?" + urllib.parse.urlencode(q)
        d = _cached("inat:" + url, url)
        res = (d or {}).get("results") or []
        for o in res:
            for ph in (o.get("photos") or [])[:1]:  # ảnh đầu của mỗi quan sát thường là toàn cây
                if not _license_ok(ph.get("license_code")):
                    continue
                out.append({"source": "inaturalist", "id": str(ph["id"]), "title": f"{taxon} — {o.get('place_guess') or ''}".strip(" —"),
                            "page_url": f"https://www.inaturalist.org/observations/{o['id']}", "image_url": ph["url"].replace("square", "large"),
                            "license": ph.get("license_code"), "license_url": None, "author": ph.get("attribution")})
        if len(res) < 50:
            break
        page += 1
        time.sleep(1)
    return out[:limit]


def _strip_html(s: str) -> str:
    import re
    return re.sub(r"<[^>]+>", "", s or "").strip()[:200]


# ---------- tải + chuẩn hóa ----------

def dhash(img: Image.Image) -> int:
    g = img.convert("L").resize((9, 8), Image.LANCZOS)
    px = list(g.tobytes())
    return sum(1 << i for i in range(64) if px[(i // 8) * 9 + i % 8] > px[(i // 8) * 9 + i % 8 + 1])


def load_manifest() -> tuple[dict[str, dict], list[int]]:
    rows: dict[str, dict] = {}
    if MANIFEST.exists():
        for line in MANIFEST.read_text().splitlines():
            r = json.loads(line)
            rows[r["uid"]] = r
    return rows, [r["dhash"] for r in rows.values() if r.get("dhash") is not None]


def save(item: dict, species: str, group: str, query: str, seen: dict, hashes: list[int]) -> str:
    """'ok' | 'skip' (đã có) | 'dup' | 'small' | 'fail'."""
    uid = f"{item['source'].split('-')[0]}_{item['id']}"
    if uid in seen:
        return "skip"
    time.sleep(0.3)  # nhẹ tay với máy chủ ảnh (Commons trả 429 khi tải dồn)
    data = _get(item["image_url"], raw=True) if item.get("image_url") else None
    if not data:
        return "fail"
    try:
        img = ImageOps.exif_transpose(Image.open(io.BytesIO(data))).convert("RGB")
    except Exception:  # noqa: BLE001
        return "fail"
    if min(img.size) < MIN_SIDE:
        return "small"
    h = dhash(img)
    if any(bin(h ^ x).count("1") <= 4 for x in hashes):
        return "dup"
    img.thumbnail((MAX_SIDE, MAX_SIDE), Image.LANCZOS)
    folder = RAW / species / group
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"{uid}.jpg"
    img.save(path, "JPEG", quality=85, optimize=True)  # lưu lại = bỏ EXIF / GPS
    row = {**item, "uid": uid, "species": species, "group": group, "query": query, "path": str(path.relative_to(ROOT)),
           "width": img.width, "height": img.height, "dhash": h}
    with MANIFEST.open("a") as f:
        f.write(json.dumps(row, ensure_ascii=False) + "\n")
    seen[uid] = row
    hashes.append(h)
    return "ok"


def plan(only: set[str] | None) -> list[tuple[str, str, str, str]]:
    """(loài, nhóm, nguồn, câu tìm). Openverse giới hạn lượt / ngày cho khách → chỉ dùng cho câu có kết quả
    (phôi chung, bonsai theo loài); "phôi + tên loài" gần như không có ảnh giấy phép mở nên bỏ."""
    jobs: list[tuple[str, str, str, str]] = []
    for q in GENERIC_PHOI:
        jobs += [("_chung", "phoi", "openverse", q), ("_chung", "phoi", "commons", q)]
    for key, (_vi, sci, common) in SPECIES.items():
        for s in sci:
            jobs += [(key, "trong_chau", "inaturalist_captive", s), (key, "bonsai", "commons", f"{s} bonsai"), (key, "bonsai", "openverse", f"{s} bonsai")]
        for n in common:
            jobs += [(key, "bonsai", "commons", f"{n} bonsai"), (key, "bonsai", "openverse", f"{n} bonsai")]
        for s in sci:
            jobs.append((key, "tu_nhien", "inaturalist", s))
    if only:
        jobs = [j for j in jobs if j[0] in only]
    return jobs


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="")
    ap.add_argument("--max-per-folder", type=int, default=250)
    ap.add_argument("--per-query", type=int, default=60)
    ap.add_argument("--inat", type=int, default=120)
    a = ap.parse_args()
    only = {x for x in a.only.split(",") if x} or None
    seen, hashes = load_manifest()
    count: dict[tuple[str, str], int] = {}
    for r in seen.values():
        count[(r["species"], r["group"])] = count.get((r["species"], r["group"]), 0) + 1
    for species, group, source, query in plan(only):
        if count.get((species, group), 0) >= a.max_per_folder:
            continue
        items = (openverse(query, a.per_query) if source == "openverse" else commons(query, a.per_query) if source == "commons"
                 else inaturalist(query, a.inat, captive=source.endswith("captive")))
        stats: dict[str, int] = {}
        for it in items:
            if count.get((species, group), 0) >= a.max_per_folder:
                break
            r = save(it, species, group, query, seen, hashes)
            stats[r] = stats.get(r, 0) + 1
            if r == "ok":
                count[(species, group)] = count.get((species, group), 0) + 1
        print(f"{species}/{group} [{source}] “{query}”: {len(items)} kết quả · {stats}", flush=True)
    total = {}
    for r in seen.values():
        total[f"{r['species']}/{r['group']}"] = total.get(f"{r['species']}/{r['group']}", 0) + 1
    print(json.dumps(dict(sorted(total.items())), ensure_ascii=False, indent=1))
    print("Tổng:", len(seen))


if __name__ == "__main__":
    sys.exit(main())
