"""Phiên B — B1 P3a render S4 (nhiều ứng viên song song) → B2 P4 (CV rồi VLM) → P3c sửa tối đa 2 vòng.

Model ảnh chỉ thực thi thiết kế đã chốt ở P2; mọi quyết định thẩm mỹ nằm trong prompt dựng từ JSON.
Hàm ở đây thuần (không DB, không R2): worker lo lưu trữ và ghi `pipeline_steps`.
"""

from __future__ import annotations

import hashlib
import io
import json
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict, dataclass, field

import numpy as np
from PIL import Image
from pydantic import BaseModel, ConfigDict, Field

from .adapters.base import AIError, ImageInput
from .adapters.image_client import ImageClient
from .adapters.llm_client import LLMClient
from .dictionaries import MAX_THICKEN_PCT_PER_YEAR, rule_set_yaml
from .phase_a import PromptTemplate
from .prompts import render
from .schemas import Analysis, DesignOption
from .segmentation import mask_iou, measure_mask
from .steps import StepRecord

# ---------- tham số (docs/prompt_system.md P4) ----------

N_CANDIDATES = 3
MAX_REPAIR_ROUNDS = 2
PASS_SCORE = 6.5
TRUNK_IOU_MIN = 0.75
BASE_SHIFT_MAX = 0.03  # theo chiều rộng ảnh
ASPECT_TOLERANCE = 0.02
BACKGROUND_DIFF_MAX = 0.12  # sai khác trung bình (0–1) ở góc ảnh
WEIGHTS = {
    "trunk_fidelity": 2.0,
    "proportions": 1.5,
    "silhouette": 1.0,
    "branch_structure": 1.0,
    "negative_space": 1.0,
    "species_realism": 1.0,
    "timeline_plausibility": 1.5,
    "photo_realism": 1.0,
}
YEARS_TO_FINAL = {"fast": 4, "medium": 5, "slow": 6}

_APEX_LEAN = {"slightly_left": "slightly to the left", "slightly_right": "slightly to the right", "forward": "slightly toward the viewer"}
_POT_SHAPE = {"rectangle": "rectangular", "oval": "oval", "round": "round", "cascade_deep": "deep cascade"}
_POT_POSITION = {"off_center_left": "off-center to the left", "off_center_right": "off-center to the right", "center": "in the center"}


# ---------- P4 schema ----------


Score = Field(ge=1, le=10)


class JudgeResult(BaseModel):
    model_config = ConfigDict(extra="ignore")

    trunk_fidelity: int = Score
    proportions: int = Score
    silhouette: int = Score
    branch_structure: int = Score
    negative_space: int = Score
    species_realism: int = Score
    timeline_plausibility: int = Score
    photo_realism: int = Score
    hard_fail: list[str] = []
    fix_instructions: str = ""
    summary_en: str = ""

    def total(self) -> float:
        s = sum(getattr(self, k) * w for k, w in WEIGHTS.items())
        return round(s / sum(WEIGHTS.values()), 2)


# ---------- dựng prompt P3a ----------


def years_to_final(growth_speed: str) -> int:
    return YEARS_TO_FINAL.get(growth_speed, 5)


def p3a_variables(
    option: DesignOption,
    analysis: Analysis,
    *,
    style_desc: str,
    species_name: str,
    species_desc: str,
    growth_speed: str,
    years: int,
) -> dict:
    branches = {b.id: b for b in analysis.branches}
    first_side = "left"
    for k in option.keep_branches:
        b = branches.get(k.id)
        if k.role == "first_branch" and b and b.direction in ("left", "right"):
            first_side = b.direction
    pot = option.pot
    pot_desc = f"{_POT_SHAPE.get(pot.shape, pot.shape)} bonsai pot, {pot.color.replace('_', ' ')}"
    return {
        "years": years,
        "max_thicken_pct": MAX_THICKEN_PCT_PER_YEAR.get(growth_speed, 10) * years,
        "scar_note": "show a small healed scar where each was cut" if years >= 2 else "show fresh pruning cuts",
        "style_description": style_desc,
        "apex_lean": _APEX_LEAN.get(option.apex.lean, option.apex.lean),
        "first_branch_side": first_side,
        "species_foliage_description": species_desc,
        "pads": option.silhouette.pads,
        "pot_description": pot_desc,
        "pot_position": _POT_POSITION.get(pot.position, pot.position),
        "repot_note": "The tree has been repotted into this bonsai pot." if years >= 3 else "",
        "timeline_text": (
            f"Branches were pruned and wired at year 0, grown out freely, then cut back and refined into pads; "
            f"this is the result after about {years} years."
        ),
        "species_name": species_name,
        "growth_speed": growth_speed,
    }


def prompt_hash(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


# ---------- ứng viên ----------


@dataclass
class Candidate:
    attempt: int
    image: bytes  # WebP, cùng kích thước ảnh gốc
    model: str
    prompt: str
    record: StepRecord
    cv: dict = field(default_factory=dict)
    judge: JudgeResult | None = None
    judge_raw: dict | None = None

    @property
    def hard_fails(self) -> list[str]:
        return list(self.cv.get("fails", [])) + (self.judge.hard_fail if self.judge else [])

    @property
    def total(self) -> float | None:
        return self.judge.total() if self.judge else None

    @property
    def passed(self) -> bool:
        return not self.hard_fails and self.total is not None and self.total >= PASS_SCORE


def to_webp(data: bytes, size: tuple[int, int]) -> tuple[bytes, tuple[int, int]]:
    """Đưa ảnh sinh về đúng kích thước ảnh gốc; trả kèm kích thước gốc của ảnh sinh (để kiểm tỉ lệ khung)."""
    img = Image.open(io.BytesIO(data)).convert("RGB")
    raw_size = img.size
    if img.size != size:
        img = img.resize(size, Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="WEBP", quality=92)
    return buf.getvalue(), raw_size


def generate(
    client: ImageClient,
    prompt: str,
    images: list[ImageInput],
    *,
    size: tuple[int, int],
    n: int,
    step_code: str,
    prompt_version: str,
    first_attempt: int,
) -> tuple[list[Candidate], list[StepRecord]]:
    """Sinh `n` ảnh song song (mỗi ảnh 1 lời gọi). Ảnh lỗi bị bỏ qua; trả cả bản ghi lỗi để tính chi phí."""

    def one(i: int):
        try:
            res = client.edit(prompt=prompt, images=images, n=1)
        except AIError as e:
            rec = StepRecord.from_trace(step_code, e.trace, prompt_version=prompt_version, ok=False, error=str(e)) if e.trace else None
            return None, rec
        rec = StepRecord.from_trace(step_code, res.trace, prompt_version=prompt_version, ok=True)
        webp, raw_size = to_webp(res.response.images[0], size)
        cand = Candidate(first_attempt + i, webp, res.response.model, prompt, rec)
        cand.cv["generated_size"] = list(raw_size)
        return cand, rec

    with ThreadPoolExecutor(max_workers=n) as pool:
        results = list(pool.map(one, range(n)))
    cands = [c for c, _ in results if c is not None]
    failed = [r for c, r in results if c is None and r is not None]
    return cands, failed


# ---------- B2a kiểm tra cấu trúc bằng CV ----------


def _gray_small(img: Image.Image, edge: int = 256) -> np.ndarray:
    scale = edge / max(img.size)
    small = img.convert("L").resize((max(1, round(img.width * scale)), max(1, round(img.height * scale))))
    return np.asarray(small, dtype=np.float32) / 255.0


def background_diff(original: Image.Image, candidate: Image.Image) -> list[float]:
    """Sai khác trung bình ở 4 góc ảnh (vùng thường là nền, ít bị tán cây che)."""
    a, b = _gray_small(original), _gray_small(candidate.resize(original.size))
    h, w = a.shape
    ch, cw = max(2, round(h * 0.12)), max(2, round(w * 0.12))
    corners = [(slice(0, ch), slice(0, cw)), (slice(0, ch), slice(w - cw, w)),
               (slice(h - ch, h), slice(0, cw)), (slice(h - ch, h), slice(w - cw, w))]
    return [round(float(np.abs(a[c] - b[c]).mean()), 4) for c in corners]


def cv_checks(
    original: bytes,
    cand: Candidate,
    *,
    original_mask: np.ndarray | None = None,
    segmenter=None,
) -> dict:
    """Kiểm tra rẻ, khách quan trước VLM: tỉ lệ khung, nền, và (khi có YOLO-seg) IoU thân + vị trí gốc."""
    orig = Image.open(io.BytesIO(original)).convert("RGB")
    candidate = Image.open(io.BytesIO(cand.image)).convert("RGB")
    out: dict = dict(cand.cv)
    fails: list[str] = []

    gw, gh = out.get("generated_size", list(candidate.size))
    ar_o, ar_c = orig.width / orig.height, gw / gh
    out["aspect_delta"] = round(abs(ar_c - ar_o) / ar_o, 4)
    if out["aspect_delta"] > ASPECT_TOLERANCE:
        fails.append("aspect_changed")

    corners = background_diff(orig, candidate)
    out["background_corner_diff"] = corners
    if sum(d > BACKGROUND_DIFF_MAX for d in corners) >= 2:
        fails.append("background_changed")

    out["trunk_iou"] = None
    if original_mask is not None and segmenter is not None:
        cand_mask = segmenter.segment(candidate)
        orig_m = measure_mask(original_mask)
        cand_m = measure_mask(cand_mask) if cand_mask is not None else None
        if cand_mask is not None and orig_m is not None:
            iou = mask_iou(original_mask, cand_mask, up_to_ratio=0.6, base_y=int(orig_m.base_point_px[1]))
            out["trunk_iou"] = round(iou, 3)
            if iou < TRUNK_IOU_MIN:
                fails.append("trunk_changed")
        if cand_m is not None and orig_m is not None:
            shift = abs(cand_m.base_point_px[0] - orig_m.base_point_px[0]) / orig.width
            out["base_shift"] = round(shift, 4)
            if shift > BASE_SHIFT_MAX:
                fails.append("base_moved")
    out["cv_fallback"] = out["trunk_iou"] is None
    out["fails"] = fails
    return out


# ---------- B2b VLM judge ----------


def judge(
    llm: LLMClient,
    prompt: PromptTemplate,
    original: bytes,
    cand: Candidate,
    *,
    option: DesignOption,
    years: int,
    species_name: str,
) -> StepRecord:
    variables = {
        "p2_option_json": json.loads(option.model_dump_json()),
        "rule_set_yaml": rule_set_yaml(),
        "years": years,
        "species_name": species_name,
    }
    try:
        res = llm.complete_json(
            system=render(prompt.system or "", variables),
            user=render(prompt.user, variables),
            schema=JudgeResult,
            images=[ImageInput(original, "image/webp"), ImageInput(cand.image, "image/webp")],
            max_tokens=4000,
        )
    except AIError as e:
        if e.trace is None:
            raise
        return StepRecord.from_trace("P4", e.trace, prompt_version=prompt.version_tag, ok=False, error=str(e))
    cand.judge, cand.judge_raw = res.value, res.raw
    return StepRecord.from_trace("P4", res.trace, prompt_version=prompt.version_tag, ok=True,
                                 output={**res.raw, "total": res.value.total(), "attempt": cand.attempt})


# ---------- luật chọn ----------


@dataclass
class Selection:
    best: Candidate | None
    passed: bool
    low_confidence: bool


def select(cands: list[Candidate]) -> Selection:
    """Loại ảnh có hard_fail; chọn total cao nhất; nếu không ảnh nào đạt ngưỡng → chưa đạt (P3c hoặc trả kèm cảnh báo)."""
    clean = [c for c in cands if not c.hard_fails and c.total is not None]
    if clean:
        best = max(clean, key=lambda c: c.total)
        ok = best.total >= PASS_SCORE
        return Selection(best, ok, not ok)
    judged = [c for c in cands if c.total is not None]
    pool = judged or cands
    if not pool:
        return Selection(None, False, True)
    best = max(pool, key=lambda c: (c.total or 0, -len(c.hard_fails)))
    return Selection(best, False, True)


def repair_inputs(best: Candidate) -> tuple[str, str]:
    """failed_checks + fix_instructions cho P3c, từ ứng viên tốt nhất của vòng trước."""
    checks = best.hard_fails[:]
    if best.judge:
        weak = [k for k in WEIGHTS if getattr(best.judge, k) < 6]
        checks += [f"low score: {k}" for k in weak]
    fixes = []
    if "background_changed" in checks:
        fixes.append("Keep the background, framing and lighting exactly as in the original photo.")
    if "aspect_changed" in checks:
        fixes.append("Output exactly the same aspect ratio as the original photo.")
    if {"trunk_changed", "base_moved"} & set(checks):
        fixes.append("Do not redraw the trunk: keep its exact outline, curves, base position and lean from the original.")
    if best.judge and best.judge.fix_instructions:
        fixes.append(best.judge.fix_instructions)
    return ", ".join(checks) or "overall score below threshold", "\n".join(f"- {f}" for f in fixes) or "- Follow the sketch more closely."


def candidate_summary(c: Candidate) -> dict:
    return {"attempt": c.attempt, "cv": c.cv, "total": c.total, "hard_fails": c.hard_fails,
            "judge": c.judge_raw, "record": asdict(c.record) | {"output": None}}
