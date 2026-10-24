"""Kiểm tra bộ luật trước khi lưu (nghệ nhân chỉnh trên giao diện) — chặn thay đổi làm hỏng pipeline.

Trả danh sách lỗi tiếng Việt; rỗng = hợp lệ. Chỉ kiểm phần code đọc tới; phần còn lại là mô tả, để tự do.
"""

from __future__ import annotations

from numbers import Real

from .dictionaries import RULE_DOCS, SPECIES, STYLES

SPEEDS = ("slow", "medium", "fast")
_PROPORTIONS = ("height_to_base_diameter", "first_branch_height_ratio", "pot_length_to_tree_height", "pot_depth_to_base_diameter")
_CHECKS = ("pad_cover_min", "pads_missing_max", "outside_foliage_max", "removed_same_max", "apex_off_max")


def _num(v) -> bool:
    return isinstance(v, Real) and not isinstance(v, bool)


def _range(v) -> bool:
    return isinstance(v, list) and len(v) == 2 and all(_num(x) for x in v) and 0 <= v[0] < v[1]


def validate_rule_doc(name: str, doc) -> list[str]:
    if name not in RULE_DOCS:
        return [f"Không có bộ luật tên {name}."]
    if not isinstance(doc, dict):
        return ["Nội dung phải là một bảng (mapping)."]
    return {"rule_set": _rule_set, "judging": _judging, "species": _species, "styles_vn": _styles_vn, "pests": _pests}[name](doc)


def _pests(d: dict) -> list[str]:
    err: list[str] = []
    sym, items = d.get("symptoms"), d.get("items")
    if not isinstance(sym, dict) or not sym:
        return ["Cần bảng «symptoms» (mã → mô tả)."]
    if not isinstance(items, dict) or not items:
        return ["Cần danh sách «items»."]
    for key, it in items.items():
        if not isinstance(it, dict) or not it.get("name_vi"):
            err.append(f"«{key}»: thiếu tên.")
            continue
        bad = [s for s in it.get("symptoms") or [] if s not in sym]
        if not it.get("symptoms") or bad:
            err.append(f"«{key}»: dấu hiệu không có trong bảng: {', '.join(bad) or 'trống'}.")
        if not isinstance(it.get("treat_now_vi"), list) or not it["treat_now_vi"]:
            err.append(f"«{key}»: cần ít nhất một việc xử lý ngay.")
    return err


def _rule_set(d: dict) -> list[str]:
    err: list[str] = []
    p = d.get("proportions")
    if not isinstance(p, dict):
        return ["Thiếu mục tỉ lệ (proportions)."]
    for k in _PROPORTIONS:
        if not _range(p.get(k)):
            err.append(f"Tỉ lệ «{k}» phải là khoảng [từ, đến] với 0 ≤ từ < đến.")
    for k in ("first_branch_height_ratio",):
        if _range(p.get(k)) and p[k][1] > 1:
            err.append("Chiều cao cành đầu là tỉ lệ theo chiều cao cây — không vượt quá 1.")
    if "branch_to_trunk_caliper_max" in p and not (_num(p["branch_to_trunk_caliper_max"]) and 0 < p["branch_to_trunk_caliper_max"] <= 1):
        err.append("Cành / thân tối đa phải trong (0, 1].")
    g = d.get("growth") or {}
    for table, lo, hi in (("max_thicken_pct_per_year", 0, 50), ("years_to_final", 1, 30)):
        t = g.get(table)
        if t is None:
            continue
        if not isinstance(t, dict) or set(t) != set(SPEEDS) or not all(_num(t[s]) and lo <= t[s] <= hi for s in SPEEDS):
            err.append(f"«{table}» cần đủ chậm / vừa / nhanh, mỗi giá trị trong [{lo}, {hi}].")
    shapes = (d.get("pot") or {}).get("shape_by_style") or {}
    unknown = set(shapes) - {s["key"] for s in STYLES} - {"massive_trunk"}
    if unknown:
        err.append(f"Chậu theo thế: thế không tồn tại {sorted(unknown)}.")
    return err


def _judging(d: dict) -> list[str]:
    err: list[str] = []
    crit = d.get("criteria")
    if not isinstance(crit, dict) or not crit:
        return ["Thiếu tiêu chí chấm (criteria)."]
    weights = [c.get("weight") if isinstance(c, dict) else None for c in crit.values()]
    if not all(_num(w) and w >= 0 for w in weights):
        err.append("Mỗi tiêu chí cần trọng số là số ≥ 0.")
    elif sum(weights) != 100:
        err.append(f"Tổng trọng số phải bằng 100 (đang là {sum(weights)}).")
    ps = d.get("pass_score")
    if not (_num(ps) and 0 < ps <= 100):
        err.append("Điểm đạt phải trong (0, 100].")
    if not isinstance(d.get("fidelity_hard_fail"), list):
        err.append("Thiếu danh sách lỗi loại thẳng (fidelity_hard_fail).")
    checks = d.get("checks") or {}
    for k in _CHECKS:
        if k in checks and not (_num(checks[k]) and 0 <= checks[k] <= 5):
            err.append(f"Ngưỡng «{k}» phải là số trong [0, 5].")
    return err


def _species(d: dict) -> list[str]:
    err = [f"Thiếu loài «{s['key']}»." for s in SPECIES if s["key"] not in d]
    for key, sp in d.items():
        if key == "version":
            continue
        if not isinstance(sp, dict) or not sp.get("name_vi"):
            err.append(f"Loài «{key}» cần tên tiếng Việt.")
        elif sp.get("growth") not in (None, *SPEEDS):
            err.append(f"Loài «{key}»: tốc độ lớn phải là slow / medium / fast.")
    return err


def _styles_vn(d: dict) -> list[str]:
    dang = d.get("dang")
    if not isinstance(dang, dict) or not {"truc", "xieu", "hoanh", "huyen"} <= set(dang):
        return ["Cần đủ 4 dáng: trực, xiêu, hoành, huyền."]
    err: list[str] = []
    style_keys = {s["key"] for s in STYLES}
    for key, t in (d.get("the") or {}).items():
        if not isinstance(t, dict) or not t.get("name_vi"):
            err.append(f"Thế «{key}» cần tên tiếng Việt.")
            continue
        if t.get("dang") not in dang:
            err.append(f"Thế «{key}»: dáng phải là một trong {sorted(dang)}.")
        if not set(t.get("maps_to") or []) <= style_keys:
            err.append(f"Thế «{key}»: «tương ứng thế» có mã không tồn tại.")
    return err
