"""Từ điển thế cây và loài (docs/prompt_system.md §0.1, §0.2) — seed vào bảng `styles`, `species`."""

from __future__ import annotations

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

# Tốc độ dày thân tối đa mỗi năm (giả định ban đầu, hiệu chỉnh bằng dữ liệu thật).
MAX_THICKEN_PCT_PER_YEAR = {"slow": 5, "medium": 10, "fast": 15}


@lru_cache
def rule_set_yaml() -> str:
    return resources.files("bonsai_pipeline").joinpath("rules/rule_set.yaml").read_text(encoding="utf-8")


@lru_cache
def rule_set() -> dict:
    return yaml.safe_load(rule_set_yaml())
