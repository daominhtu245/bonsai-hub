"""Lộ trình + hướng dẫn + tổng quan không dùng LLM (chế độ chi phí standard/economy; cost_mode.py).

Ghép từ bộ luật (thời gian theo tốc độ lớn của loài) và thư viện viết sẵn `rules/care_guide.yaml`,
cộng việc cụ thể lấy từ thiết kế P2 (cành cắt, cành nuôi mới). Đầu ra cùng schema với P2b/P6/P5.
"""

from __future__ import annotations

from functools import lru_cache
from importlib import resources

import yaml

from .schemas import Analysis, DesignOption
from .stages import GuideResult, Report, StageGuide, StagePlan, StagePlanItem

FOLIAGE = {"S1": 35, "S2": 70, "S3": 80, "S4": 95}
MAX_ACTIONS = 5


@lru_cache
def guide_library() -> dict:
    text = resources.files("bonsai_pipeline").joinpath("rules/care_guide.yaml").read_text(encoding="utf-8")
    return yaml.safe_load(text)


def _species(key: str | None) -> dict:
    lib = guide_library()["species"]
    return lib.get(key or "", lib["default"])


def _years_label(n: int) -> str:
    return f"Khoảng {n} năm"


def stage_years(years: int) -> dict[str, int]:
    """Mốc năm của S2, S3, S4 (S1 = ngay sau buổi tạo khung)."""
    t2 = max(1, round(years * 0.3))
    t3 = min(years - 1, max(t2 + 1, round(years * 0.65))) if years > 2 else t2
    return {"S1": 0, "S2": t2, "S3": t3, "S4": years}


def _option_actions(option: DesignOption) -> list[str]:
    out = []
    if option.remove_branches:
        out.append(f"Cắt bỏ {len(option.remove_branches)} cành đánh dấu đỏ trên bản vẽ, sát thân, chừa vết cắt lõm")
    if option.new_branches_needed:
        out.append(f"Chọn chồi để nuôi {len(option.new_branches_needed)} cành mới ở vị trí đánh dấu vàng")
    return out


def rule_stage_plan(
    analysis: Analysis,
    option: DesignOption,
    *,
    years: int,
    max_thicken_pct: float,
    style_desc_en: str,
    species_key: str | None,
    region: str,
) -> StagePlan:
    """Thay P2b: cùng ràng buộc validate_plan (S1 không dày thân, S2 tán dày hơn S1, S4 ≤ giới hạn dày thân)."""
    lib = guide_library()["stages"]
    sp = _species(species_key)
    t = stage_years(years)
    pads = option.silhouette.pads
    visual = {
        "S1": "Right after the first styling session: unwanted branches removed, kept branches wired into position, "
              "sparse foliage, the structure is clearly visible.",
        "S2": f"About {t['S2']} year(s) after styling: the kept branches have grown out freely and thickened, foliage is "
              "fuller but untidy, long shoots extend beyond the planned outline, wire has been removed.",
        "S3": f"About {t['S3']} years after styling: branches have been cut back and shaped into about {pads} distinct "
              f"foliage pads following the outline of {style_desc_en}; the silhouette is recognisable but thinner "
              "and less refined than the final image.",
        "S4": f"About {years} years after styling: refined {style_desc_en}, dense compact pads, fine ramification.",
    }
    items = []
    for code in ("S1", "S2", "S3", "S4"):
        s = lib[code]
        thick = 0.0 if code == "S1" else round(max_thicken_pct * t[code] / years, 1)
        nxt = {"S1": "S2", "S2": "S3", "S3": "S4"}.get(code)
        actions = (_option_actions(option) if code == "S1" else []) + s.get("actions", [])
        items.append(StagePlanItem(
            id=code,
            name_vi=s["title"],
            time_from_start="Sau buổi tạo khung" if code == "S1" else _years_label(t[code]),
            time_en="right after the first styling session" if code == "S1" else f"about {t[code]} years",
            visual_state_en=visual[code],
            foliage_density_pct=FOLIAGE[code],
            trunk_thicken_pct_vs_original=min(thick, max_thicken_pct),
            actions_vi=actions[:MAX_ACTIONS],
            best_season_vi=sp["season"].get(region, sp["season"]["south"]),
            care_vi=s.get("care", []),
            ready_for_next_signs_vi=s.get("ready", []),
            common_mistakes_vi=s.get("mistakes", []),
            duration_to_next=f"{t[nxt] - t[code]} năm" if nxt and t[nxt] > t[code] else "",
        ))
    return StagePlan(stages=items)


def library_guide(
    analysis: Analysis,
    option: DesignOption,
    plan: StagePlan,
    *,
    species_key: str | None,
    style_key: str,
    region: str,
) -> GuideResult:
    """Thay P6: hướng dẫn S0–S4 từ thư viện + việc cụ thể của phương án đã chọn."""
    lib = guide_library()
    sp = _species(species_key)
    season = sp["season"].get(region, sp["season"]["south"])
    style_tip = lib["styles"].get(style_key)
    plans = plan.by_id()
    out = []
    for code in ("S0", "S1", "S2", "S3", "S4"):
        s = lib["stages"][code]
        actions = list(s.get("actions", []))
        care = list(s.get("care", []))
        if code == "S1":
            actions = _option_actions(option) + actions + ([style_tip] if style_tip else [])
            care = care + sp["care"][:1]
        if code == "S3":
            actions.append(f"Thay đất, tỉa rễ khoảng {sp.get('repot_years', 2)} năm một lần")
        see = analysis.summary_vi if code == "S0" and analysis.summary_vi else s["see"]
        out.append(StageGuide(
            id=code,
            title_vi=s["title"],
            see_vi=see,
            actions_vi=actions[:MAX_ACTIONS],
            best_time_vi="Bắt đầu ngay" if code == "S0" else (season if code in ("S1", "S3") else plans[code].time_from_start),
            care_vi=care,
            ready_signs_vi=s.get("ready", []),
            common_mistakes_vi=s.get("mistakes", []),
        ))
    return GuideResult(stages=out)


def library_report(analysis: Analysis, option: DesignOption, guide: GuideResult, *, species_key: str | None) -> Report:
    """Thay P5: tổng quan từ chính kết quả phân tích (P1) và lý do chọn thế (P2)."""
    return Report(
        material_review_vi=analysis.summary_vi or "Phôi đủ điều kiện tạo dáng.",
        style_reason_vi=option.why_vi,
        roadmap_vi={g.id: g.actions_vi for g in guide.stages if g.id != "S0"},
        species_care_vi=_species(species_key)["care"],
    )
