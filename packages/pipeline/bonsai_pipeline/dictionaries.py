"""Từ điển thế cây và loài (docs/prompt_system.md §0.1, §0.2) — seed vào bảng `styles`, `species`."""

from __future__ import annotations

from contextvars import ContextVar
from functools import lru_cache
from importlib import resources

import yaml

STYLES: list[dict] = [
    {"key": "chokkan", "name_vi": "Trực", "name_jp": "Chokkan",
     "prompt_desc_en": "formal upright: straight vertical trunk, strong taper, apex directly above base"},
    {"key": "moyogi", "name_vi": "Trực uốn", "name_jp": "Moyogi",
     "prompt_desc_en": "informal upright: S-curved trunk, apex above base, branches on outside of curves"},
    {"key": "shakan", "name_vi": "Xiêu", "name_jp": "Shakan",
     "prompt_desc_en": "slanting: trunk leans 60-80°, apex not above base, roots stronger on opposite side"},
    {"key": "kengai", "name_vi": "Huyền", "name_jp": "Kengai",
     "prompt_desc_en": "full cascade: trunk falls below pot rim"},
    {"key": "han_kengai", "name_vi": "Bán huyền", "name_jp": "Han-kengai",
     "prompt_desc_en": "semi-cascade: trunk drops to about pot rim level"},
    {"key": "bunjingi", "name_vi": "Văn nhân", "name_jp": "Bunjingi",
     "prompt_desc_en": "literati: tall thin trunk, few branches, foliage only near top, elegant movement"},
    {"key": "fukinagashi", "name_vi": "Phong xuy", "name_jp": "Fukinagashi",
     "prompt_desc_en": "windswept: all branches swept to one side"},
    {"key": "sokan", "name_vi": "Song thụ", "name_jp": "Sokan",
     "prompt_desc_en": "twin trunk: one thicker taller main trunk + smaller secondary trunk from same base"},
    {"key": "sekijoju", "name_vi": "Bám đá", "name_jp": "Sekijoju",
     "prompt_desc_en": "root-over-rock"},
    {"key": "vn_truc_quan_tu", "name_vi": "Trực quân tử", "name_jp": None,
     "prompt_desc_en": "Vietnamese 'gentleman upright': straight dignified trunk, layered tiers, "
                       "calm symmetry-leaning balance"},
    {"key": "vn_long", "name_vi": "Thế long", "name_jp": None,
     "prompt_desc_en": "Vietnamese dragon style: trunk with strong serpentine twists, dynamic movement, rising apex"},
]

SPECIES: list[dict] = [
    {"key": "si", "name_vi": "Si", "growth_speed": "fast",
     "prompt_desc_en": "ficus with small glossy oval leaves, smooth grey bark, aerial roots possible"},
    {"key": "sanh", "name_vi": "Sanh", "growth_speed": "fast",
     "prompt_desc_en": "ficus with small dense leaves, light grey smooth bark, strong surface roots"},
    {"key": "mai_chieu_thuy", "name_vi": "Mai chiếu thủy", "growth_speed": "medium",
     "prompt_desc_en": "Wrightia religiosa: tiny oval leaves, small white fragrant flowers in clusters, "
                       "slender twiggy branching"},
    {"key": "tung_la_han", "name_vi": "Tùng la hán", "growth_speed": "slow",
     "prompt_desc_en": "Podocarpus macrophyllus: narrow strap-like dark green leaves in tufts, fibrous brown bark"},
    {"key": "linh_sam", "name_vi": "Linh sam", "growth_speed": "slow",
     "prompt_desc_en": "very small rounded leaves, rough dark textured bark, fine dense ramification"},
]

# Tốc độ dày thân tối đa mỗi năm (giả định ban đầu) — mặc định khi bộ luật không có mục growth.
MAX_THICKEN_PCT_PER_YEAR = {"slow": 5, "medium": 10, "fast": 15}
YEARS_TO_FINAL = {"fast": 4, "medium": 5, "slow": 6}

# ---------- bộ luật: file YAML trong gói là bản gốc; bản nghệ nhân chỉnh nằm ở DB (bảng rule_docs) ----------
# Worker nạp bản đang áp dụng từ DB ở đầu mỗi phiên (bonsai_worker/rules_repo.py) rồi gọi use_rules().

RULE_DOCS: dict[str, dict] = {
    "rule_set": {"file": "rule_set.yaml", "title_vi": "Luật tạo dáng & tỉ lệ"},
    "styles_vn": {"file": "styles_vn.yaml", "title_vi": "Dáng & thế Việt Nam"},
    "species": {"file": "species.yaml", "title_vi": "Đặc điểm loài"},
    "judging": {"file": "judging.yaml", "title_vi": "Bảng chấm & ngưỡng kiểm tra"},
}
_override: ContextVar[dict[str, dict] | None] = ContextVar("bonsai_rules_override", default=None)


@lru_cache
def _file_text(name: str) -> str:
    return resources.files("bonsai_pipeline").joinpath(f"rules/{RULE_DOCS[name]['file']}").read_text(encoding="utf-8")


@lru_cache
def default_rule_doc(name: str) -> dict:
    """Bản gốc từ file YAML (seed cho DB)."""
    return yaml.safe_load(_file_text(name))


def ordered_like(value, template):
    """Sắp khóa theo thứ tự của bản gốc (JSONB trong Postgres không giữ thứ tự khóa); khóa mới để cuối."""
    if isinstance(value, dict):
        t = template if isinstance(template, dict) else {}
        keys = [k for k in t if k in value] + [k for k in value if k not in t]
        sample = next(iter(t.values()), None) if t else None
        return {k: ordered_like(value[k], t.get(k, sample if isinstance(sample, dict) else None)) for k in keys}
    return value


def ordered_rule_doc(name: str, content: dict) -> dict:
    return ordered_like(content, default_rule_doc(name))


def use_rules(docs: dict[str, dict] | None) -> None:
    """Dùng bộ luật từ DB cho phiên đang chạy (None → về bản gốc trong file)."""
    _override.set(docs or None)


def rule_doc(name: str) -> dict:
    o = _override.get()
    return (o or {}).get(name) or default_rule_doc(name)


def rule_set_yaml() -> str:
    """Bộ luật dạng YAML để chèn vào prompt P2 / P4."""
    o = _override.get()
    if o and "rule_set" in o:
        return yaml.safe_dump(o["rule_set"], allow_unicode=True, sort_keys=False)
    return _file_text("rule_set")


def rule_set() -> dict:
    return rule_doc("rule_set")


def species_rules() -> dict:
    """Đặc điểm loài có nguồn (rules/species.yaml): cắt tỉa, tuốt lá, dây, thay chậu, gợi ý vẽ."""
    return rule_doc("species")


def styles_vn() -> dict:
    """Dáng và thế cây cảnh Việt Nam (rules/styles_vn.yaml)."""
    return rule_doc("styles_vn")


def judging() -> dict:
    """Bảng chấm ảnh kết quả: lỗi loại thẳng + tiêu chí có trọng số + ngưỡng kiểm tra (rules/judging.yaml)."""
    return rule_doc("judging")


def max_thicken_pct(growth_speed: str) -> float:
    table = (rule_set().get("growth") or {}).get("max_thicken_pct_per_year") or MAX_THICKEN_PCT_PER_YEAR
    return float(table.get(growth_speed, table.get("medium", 10)))


def years_to_final(growth_speed: str) -> int:
    table = (rule_set().get("growth") or {}).get("years_to_final") or YEARS_TO_FINAL
    return int(table.get(growth_speed, table.get("medium", 5)))


def check_param(key: str, default: float) -> float:
    """Ngưỡng kiểm tra ảnh (judging.checks) — nghệ nhân chỉnh được."""
    return float((judging().get("checks") or {}).get(key, default))
