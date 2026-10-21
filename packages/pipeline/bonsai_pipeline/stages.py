"""Lộ trình (tuần 4): B3 P2b stage plan → B4 render S1 → B5 S2, S3 theo chuỗi + kiểm tra đơn điệu → B6 P6 + P5.

Nguyên tắc nhất quán (docs/prompt_system.md P3d): neo hai đầu (ảnh gốc, S4 đã duyệt), render theo chuỗi,
mỗi bước so với bước trước bằng CV; vi phạm → sinh lại bước đó tối đa 2 lần, vẫn hỏng → dùng bản vẽ thay ảnh.
"""

from __future__ import annotations

import io
import json
from dataclasses import dataclass

import numpy as np
from PIL import Image
from pydantic import BaseModel, ConfigDict, Field

from .adapters.base import AIError, ImageInput
from .adapters.image_client import ImageClient
from .adapters.llm_client import LLMClient
from .phase_a import PromptTemplate
from .phase_b import ASPECT_TOLERANCE, BACKGROUND_DIFF_MAX, Candidate, background_diff, to_webp
from .prompts import render
from .schemas import Analysis, DesignOption
from .segmentation import measure_mask
from .steps import StepRecord

STAGE_IDS = ["S1", "S2", "S3", "S4"]
GUIDE_IDS = ["S0", "S1", "S2", "S3", "S4"]
STAGE_NAME_EN = {"S1": "initial styling", "S2": "recovery and branch growth", "S3": "pad formation", "S4": "refined"}
MAX_STAGE_RETRIES = 2
BASE_SHIFT_MAX = 0.02  # chặt hơn P4: các bước liên tiếp phải gần như trùng gốc
TRUNK_AREA_TOLERANCE = 0.98  # cho phép sai số segment 2%
DISCLAIMER_GUIDE = "Ảnh là minh hoạ định hướng; tốc độ thực tế phụ thuộc chăm sóc, khí hậu và sức khoẻ cây."
DISCLAIMER_REPORT = "Ảnh là minh hoạ định hướng; kết quả thực tế phụ thuộc chăm sóc và điều kiện trồng."


class _M(BaseModel):
    model_config = ConfigDict(extra="ignore")


# ---------- P2b ----------


class StagePlanItem(_M):
    id: str
    name_vi: str
    time_from_start: str
    visual_state_en: str
    foliage_density_pct: int = Field(ge=0, le=100)
    trunk_thicken_pct_vs_original: float = Field(ge=0)
    actions_vi: list[str] = []
    best_season_vi: str = ""
    care_vi: list[str] = []
    ready_for_next_signs_vi: list[str] = []
    common_mistakes_vi: list[str] = []
    duration_to_next: str = ""


class StagePlan(_M):
    stages: list[StagePlanItem]

    def by_id(self) -> dict[str, StagePlanItem]:
        return {s.id: s for s in self.stages}


def validate_plan(plan: StagePlan, *, max_thicken_pct: float) -> list[str]:
    errs = []
    ids = [s.id for s in plan.stages]
    if ids != STAGE_IDS:
        errs.append(f"stages must be exactly {STAGE_IDS} in order; got {ids}")
        return errs
    thick = [s.trunk_thicken_pct_vs_original for s in plan.stages]
    if any(b < a for a, b in zip(thick, thick[1:])):
        errs.append(f"trunk_thicken_pct_vs_original must never decrease: {thick}")
    if thick[0] > 2:
        errs.append("S1 is right after the first styling session: trunk_thicken_pct_vs_original must be 0")
    if thick[-1] > max_thicken_pct + 1e-6:
        errs.append(f"S4 trunk_thicken_pct_vs_original {thick[-1]} exceeds the allowed {max_thicken_pct}")
    s = plan.by_id()
    if s["S2"].foliage_density_pct <= s["S1"].foliage_density_pct:
        errs.append("S2 foliage_density_pct must be higher than S1 (branches grow out freely after pruning)")
    return errs


def run_p2b(
    llm: LLMClient,
    prompt: PromptTemplate,
    analysis: Analysis,
    option: DesignOption,
    *,
    final_summary: str,
    growth_speed: str,
    region: str,
    max_thicken_pct: float,
) -> tuple[StagePlan, StepRecord]:
    variables = {
        "growth_speed": growth_speed,
        "region": region,
        "p1_json": json.loads(analysis.model_dump_json()),
        "p2_option_json": json.loads(option.model_dump_json()),
        "final_judge_summary": final_summary or "not available",
        "max_thicken_pct": round(max_thicken_pct),
    }
    res = llm.complete_json(
        system=render(prompt.system or "", variables),
        user=render(prompt.user, variables),
        schema=StagePlan,
        hard_rules=lambda p: validate_plan(p, max_thicken_pct=max_thicken_pct),
    )
    return res.value, StepRecord.from_trace("P2b", res.trace, prompt_version=prompt.version_tag, ok=True, output=res.raw)


# ---------- P3d: prompt S1 / S2 / S3 ----------


def s1_prompt(tpl: PromptTemplate, plan: StagePlan) -> str:
    return render(tpl.user, {"foliage_density_pct": plan.by_id()["S1"].foliage_density_pct})


def chain_prompt(tpl: PromptTemplate, plan: StagePlan, code: str) -> str:
    s = plan.by_id()
    prev = {"S2": "S1", "S3": "S2"}[code]
    pot_rule = (
        "Now in the bonsai pot shown in the final (SECOND) image"
        if code == "S3"
        else "Same nursery pot as in the FIRST image"
    )
    return render(tpl.user, {
        "prev_stage_name": STAGE_NAME_EN[prev],
        "stage_name_en": STAGE_NAME_EN[code],
        "time_from_start": s[code].time_from_start,
        "trunk_thicken_pct": round(s[code].trunk_thicken_pct_vs_original),
        "pot_rule": pot_rule,
        "visual_state_en": s[code].visual_state_en,
        "foliage_density_pct": s[code].foliage_density_pct,
    })


# ---------- kiểm tra đơn điệu giữa các bước ----------


def _rgb(data: bytes) -> Image.Image:
    return Image.open(io.BytesIO(data)).convert("RGB")


def stage_checks(
    original: bytes,
    previous: bytes,
    current: Candidate,
    *,
    previous_mask: np.ndarray | None = None,
    segmenter=None,
) -> tuple[dict, np.ndarray | None]:
    """So bước k với bước k-1 (và nền với ảnh gốc). Trả (kết quả, mask thân của bước k nếu đo được)."""
    orig, cur = _rgb(original), _rgb(current.image)
    out: dict = dict(current.cv)
    fails: list[str] = []

    gw, gh = out.get("generated_size", list(cur.size))
    ar_o = orig.width / orig.height
    out["aspect_delta"] = round(abs(gw / gh - ar_o) / ar_o, 4)
    if out["aspect_delta"] > ASPECT_TOLERANCE:
        fails.append("aspect_changed")

    corners = background_diff(orig, cur)
    out["background_corner_diff"] = corners
    if sum(d > BACKGROUND_DIFF_MAX for d in corners) >= 2:
        fails.append("background_changed")

    cur_mask = None
    out["trunk_area_ratio"] = None
    if segmenter is not None:
        cur_mask = segmenter.segment(cur)
        prev_mask = previous_mask if previous_mask is not None else segmenter.segment(_rgb(previous))
        pm = measure_mask(prev_mask) if prev_mask is not None else None
        cm = measure_mask(cur_mask) if cur_mask is not None else None
        if pm and cm:
            out["trunk_area_ratio"] = round(cm.mask_area_px / pm.mask_area_px, 3)
            if cm.mask_area_px < pm.mask_area_px * TRUNK_AREA_TOLERANCE:
                fails.append("trunk_shrank")
            shift = abs(cm.base_point_px[0] - pm.base_point_px[0]) / orig.width
            out["base_shift"] = round(shift, 4)
            if shift > BASE_SHIFT_MAX:
                fails.append("base_moved")
    out["cv_fallback"] = out["trunk_area_ratio"] is None
    out["fails"] = fails
    return out, cur_mask


def cut_regions_change(original: bytes, s1: bytes, current: bytes, analysis: Analysis, option: DesignOption) -> float | None:
    """Chỉ số tham khảo: vùng cành đã cắt ở S1 thay đổi bao nhiêu ở bước sau (0–1). Ghi lại, chưa dùng để loại
    vì tán mới mọc gần đó cũng làm vùng này đổi — cần dữ liệu thật để chọn ngưỡng."""
    from PIL import ImageDraw

    branches = {b.id: b for b in analysis.branches}
    removed = [branches[r.id] for r in option.remove_branches if r.id in branches]
    if not removed:
        return None
    a, b = _rgb(s1), _rgb(current).resize(_rgb(s1).size)
    mask = Image.new("L", a.size, 0)
    draw = ImageDraw.Draw(mask)
    width = max(4, round(min(a.size) * 0.02))
    for br in removed:
        end = br.end_px or br.start_px
        draw.line([tuple(br.start_px), tuple(end)], fill=255, width=width)
    m = np.asarray(mask) > 0
    if not m.any():
        return None
    diff = np.abs(np.asarray(a, dtype=np.float32) - np.asarray(b, dtype=np.float32)).mean(axis=2) / 255.0
    return round(float(diff[m].mean()), 4)


@dataclass
class StageResult:
    code: str
    candidate: Candidate | None  # None → dùng bản vẽ thay ảnh
    attempts: list[Candidate]
    records: list[StepRecord]


def render_stage(
    client: ImageClient,
    prompt: str,
    images: list[ImageInput],
    *,
    code: str,
    size: tuple[int, int],
    original: bytes,
    previous: bytes,
    previous_mask: np.ndarray | None,
    segmenter,
    prompt_version: str,
) -> tuple[StageResult, np.ndarray | None]:
    """Sinh một giai đoạn; vi phạm đơn điệu → sinh lại tối đa MAX_STAGE_RETRIES lần."""
    attempts: list[Candidate] = []
    records: list[StepRecord] = []
    for attempt in range(MAX_STAGE_RETRIES + 1):
        try:
            res = client.edit(prompt=prompt, images=images, n=1)
        except AIError as e:
            if e.trace:
                records.append(StepRecord.from_trace("P3d", e.trace, prompt_version=prompt_version, ok=False, error=str(e)))
            continue
        webp, raw_size = to_webp(res.response.images[0], size)
        cand = Candidate(attempt, webp, res.response.model, prompt,
                         StepRecord.from_trace("P3d", res.trace, prompt_version=prompt_version, ok=True,
                                               output={"stage": code, "attempt": attempt}))
        cand.cv["generated_size"] = list(raw_size)
        cand.cv, mask = stage_checks(original, previous, cand, previous_mask=previous_mask, segmenter=segmenter)
        attempts.append(cand)
        records.append(cand.record)
        if not cand.cv["fails"]:
            return StageResult(code, cand, attempts, records), mask
    return StageResult(code, None, attempts, records), None


# ---------- P6 + P5 ----------


class StageGuide(_M):
    id: str
    title_vi: str
    see_vi: str
    actions_vi: list[str] = Field(max_length=5)
    best_time_vi: str
    care_vi: list[str] = []
    ready_signs_vi: list[str] = []
    common_mistakes_vi: list[str] = []


class GuideResult(_M):
    stages: list[StageGuide]
    disclaimer_vi: str = DISCLAIMER_GUIDE


def validate_guide(g: GuideResult) -> list[str]:
    ids = [s.id for s in g.stages]
    return [] if ids == GUIDE_IDS else [f"stages must be exactly {GUIDE_IDS} in order; got {ids}"]


class Report(_M):
    material_review_vi: str
    style_reason_vi: str
    roadmap_vi: dict[str, list[str]] = {}
    species_care_vi: list[str] = []
    disclaimer_vi: str = DISCLAIMER_REPORT


def stages_for_guide(analysis: Analysis, plan: StagePlan) -> list[dict]:
    s0 = {"id": "S0", "name_vi": "Hiện trạng", "time_from_start": "Hôm nay", "visual_state": analysis.summary_vi,
          "actions_vi": ["Chăm cho cây khỏe trước buổi cắt tạo khung đầu tiên"]}
    return [s0] + [json.loads(s.model_dump_json()) for s in plan.stages]


def run_p6(llm: LLMClient, prompt: PromptTemplate, analysis: Analysis, plan: StagePlan) -> tuple[GuideResult, StepRecord]:
    variables = {"stages_json": stages_for_guide(analysis, plan)}
    res = llm.complete_json(system=render(prompt.system or "", variables), user=render(prompt.user, variables),
                            schema=GuideResult, hard_rules=validate_guide)
    return res.value, StepRecord.from_trace("P6", res.trace, prompt_version=prompt.version_tag, ok=True, output=res.raw)


def run_p5(llm: LLMClient, prompt: PromptTemplate, analysis: Analysis, option: DesignOption, judge_raw: dict | None) -> tuple[Report, StepRecord]:
    variables = {
        "p1_json": json.loads(analysis.model_dump_json()),
        "chosen_option_json": json.loads(option.model_dump_json()),
        "judge_json": judge_raw or {},
    }
    res = llm.complete_json(system=render(prompt.system or "", variables), user=render(prompt.user, variables), schema=Report)
    return res.value, StepRecord.from_trace("P5", res.trace, prompt_version=prompt.version_tag, ok=True, output=res.raw)

