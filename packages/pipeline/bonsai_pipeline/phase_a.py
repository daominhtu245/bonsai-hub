"""Phiên A: P1 Analyze → (A2 segment, A3 rule engine ở worker) → P2 Design.

Hàm ở đây thuần: nhận client AI + template prompt, trả kết quả đã kiểm schema và `StepRecord` để worker lưu.
"""

from __future__ import annotations

import json
from dataclasses import dataclass

from .adapters.base import ImageInput
from .adapters.llm_client import LLMClient
from .dictionaries import STYLES, rule_set_yaml
from .prompts import render
from .rule_engine import Targets, validate_design
from .schemas import Analysis, DesignResult
from .steps import StepRecord


@dataclass(frozen=True)
class PromptTemplate:
    step_code: str
    version: str
    system: str | None
    user: str

    @property
    def version_tag(self) -> str:
        return f"{self.step_code}.{self.version}"


def run_p1(
    llm: LLMClient,
    prompt: PromptTemplate,
    images: list[ImageInput],
    *,
    image_size: tuple[int, int],
    species_key: str | None,
    real_height_cm: float | None,
    preprocess: str = "none",
    n_views: int | None = None,
) -> tuple[Analysis, StepRecord]:
    """`images[0]` là mặt tiền người dùng chọn; mọi tọa độ px tính trên ảnh này.

    `preprocess="cutout_sketch"`: ảnh đầu đã tách nền + cắt sát, ảnh cuối là bản phác họa (không tính là một góc chụp,
    `n_views` = số góc chụp thật). Prompt cũ không có biến `preprocess` thì bỏ qua.
    """
    user = render(prompt.user, {
        "species_or_unknown": species_key or "unknown",
        "height_or_null": real_height_cm if real_height_cm else "null",
        "n_images": n_views or len(images),
        "preprocess": preprocess,
        "image_width": image_size[0],
        "image_height": image_size[1],
    })
    res = llm.complete_json(system=prompt.system or "", user=user, schema=Analysis, images=images)
    rec = StepRecord.from_trace("P1", res.trace, prompt_version=prompt.version_tag, ok=True, output=res.raw)
    return res.value, rec


def style_descriptions(keys: list[str]) -> str:
    by_key = {s["key"]: s for s in STYLES}
    return "\n".join(f"- {k}: {by_key[k]['prompt_desc_en']}" for k in keys if k in by_key)


def run_p2(
    llm: LLMClient,
    prompt: PromptTemplate,
    analysis: Analysis,
    targets: Targets,
    *,
    user_style: str | None = None,
    goal: str | None = None,
) -> tuple[DesignResult, StepRecord]:
    variables = {
        "rule_set_yaml": rule_set_yaml(),
        "growth_speed": targets.growth_speed,
        "p1_json": json.loads(analysis.model_dump_json()),
        "rule_engine_json": targets.as_dict(),
        "style_keys_with_descriptions": "\n" + style_descriptions(targets.allowed_styles),
        "user_style_or_any": user_style if user_style in targets.allowed_styles else "any",
        "goal": goal or "display",
    }
    res = llm.complete_json(
        system=render(prompt.system or "", variables),
        user=render(prompt.user, variables),
        schema=DesignResult,
        hard_rules=lambda d: validate_design(d, analysis, targets),
    )
    rec = StepRecord.from_trace("P2", res.trace, prompt_version=prompt.version_tag, ok=True, output=res.raw)
    return res.value, rec
