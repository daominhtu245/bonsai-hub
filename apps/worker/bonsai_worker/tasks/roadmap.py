"""B3–B6: lộ trình → render S1 (sửa có kiểm soát) → S2, S3 theo chuỗi + kiểm tra đơn điệu → hướng dẫn + tổng quan.

Chế độ full: lộ trình P2b, hướng dẫn P6, tổng quan P5 do LLM viết. Chế độ standard/economy: bộ luật + thư viện
viết sẵn (bonsai_pipeline/care_library.py), không tốn LLM.
"""

from __future__ import annotations

import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field

import numpy as np
from sqlalchemy.orm import Session

from bonsai_api import storage
from bonsai_api.db.models import DesignJob, JobStatus, RenderImage, Stage
from bonsai_pipeline.adapters import AIError, ImageInput
from bonsai_pipeline.adapters.image_client import ImageClient
from bonsai_pipeline.adapters.llm_client import LLMClient
from bonsai_pipeline.care_library import library_guide, library_report, rule_stage_plan
from bonsai_pipeline.cost_mode import PROFILES, CostProfile
from bonsai_pipeline.phase_b import prompt_hash
from bonsai_pipeline.steps import StepRecord
from bonsai_pipeline.schemas import Analysis, DesignOption
from bonsai_pipeline.stages import (
    StageResult, chain_prompt, cut_regions_change, render_stage, run_p2b, run_p5, run_p6, s1_prompt,
)

from ..prompts_repo import load_active_prompt
from ..recording import JobFailure, record_step, set_progress, set_status


@dataclass
class RoadmapContext:
    tree_id: uuid.UUID
    analysis: Analysis
    option: DesignOption
    growth_speed: str
    region: str
    max_thicken_pct: float
    size: tuple[int, int]
    original: bytes
    original_mask: np.ndarray | None
    sketch_png: bytes
    species_refs: list[bytes]
    final_image: bytes
    final_render_id: uuid.UUID
    final_summary: str
    final_judge: dict | None
    segmenter: object | None
    image_client: ImageClient
    llm: LLMClient
    attempt_base: dict[str, int] | None = None  # thử lại: đánh số tiếp, không ghi đè ảnh cũ
    profile: CostProfile = field(default_factory=lambda: PROFILES["full"])
    years: int = 5
    species_key: str | None = None
    style_key: str = ""
    style_desc_en: str = ""


def _store_stage(db: Session, job: DesignJob, ctx: RoadmapContext, res: StageResult) -> uuid.UUID | None:
    selected_id = None
    offset = (ctx.attempt_base or {}).get(res.code, 0)
    for c in res.attempts:
        c.attempt += offset
        key = storage.job_image_key(ctx.tree_id, job.id, res.code, c.attempt)
        storage.put_bytes(key, c.image, "image/webp")
        row = RenderImage(job_id=job.id, stage_code=res.code, attempt=c.attempt, storage_key=key, model=c.model,
                          prompt_hash=prompt_hash(c.prompt), cv_checks=c.cv, selected=c is res.candidate)
        db.add(row)
        db.flush()
        if c is res.candidate:
            selected_id = row.id
    for rec in res.records:
        record_step(db, job.id, rec)  # commit
    return selected_id


def run_roadmap(db: Session, job: DesignJob, ctx: RoadmapContext) -> None:
    set_status(db, job, JobStatus.rendering_stages)
    set_progress(db, job, "plan", "running")
    if ctx.profile.llm_roadmap:
        p2b = load_active_prompt(db, "P2b")
        try:
            plan, rec = run_p2b(ctx.llm, p2b, ctx.analysis, ctx.option, final_summary=ctx.final_summary,
                                growth_speed=ctx.growth_speed, region=ctx.region, max_thicken_pct=ctx.max_thicken_pct)
        except AIError as e:
            if e.trace:
                record_step(db, job.id, StepRecord.from_trace("P2b", e.trace, prompt_version=p2b.version_tag, ok=False, error=str(e)))
            raise JobFailure("ai_unavailable", str(e)) from e
        record_step(db, job.id, rec)
    else:
        plan = rule_stage_plan(ctx.analysis, ctx.option, years=ctx.years, max_thicken_pct=ctx.max_thicken_pct,
                               style_desc_en=ctx.style_desc_en, species_key=ctx.species_key, region=ctx.region)
        record_step(db, job.id, StepRecord("P2b", "code", "care_library", None, 0, 0, 0, 0.0, 0, ok=True,
                                           output=plan.model_dump(mode="json")))
    set_progress(db, job, "plan", "done")

    s1_tpl, chain_tpl = load_active_prompt(db, "P3d_S1"), load_active_prompt(db, "P3d_chain")
    refs = [ImageInput(r, "image/webp") for r in ctx.species_refs[:1]]
    final = ImageInput(ctx.final_image, "image/webp")
    images_by_stage: dict[str, bytes] = {}
    stage_image_ids: dict[str, uuid.UUID | None] = {}

    # B4 — S1: sửa có kiểm soát trên ảnh gốc (xóa cành đỏ, uốn dây cành xanh).
    set_progress(db, job, "S1", "running")
    s1, mask = render_stage(
        ctx.image_client, s1_prompt(s1_tpl, plan),
        [ImageInput(ctx.original, "image/webp"), ImageInput(ctx.sketch_png, "image/png")],
        code="S1", size=ctx.size, original=ctx.original, previous=ctx.original, previous_mask=ctx.original_mask,
        segmenter=ctx.segmenter, quality=ctx.profile.stage_quality, max_retries=ctx.profile.stage_retries,
        prompt_version=s1_tpl.version_tag,
    )
    stage_image_ids["S1"] = _store_stage(db, job, ctx, s1)
    if s1.candidate:
        images_by_stage["S1"] = s1.candidate.image
    set_progress(db, job, "S1", "done", fallback=s1.candidate is None)

    # B5 — S2, S3 theo chuỗi: ảnh bước trước làm khung, ảnh S4 làm đích.
    prev_img, prev_mask = images_by_stage.get("S1", ctx.original), mask if s1.candidate else ctx.original_mask
    for code in ("S2", "S3"):
        set_progress(db, job, code, "running")
        res, mask = render_stage(
            ctx.image_client, chain_prompt(chain_tpl, plan, code),
            [ImageInput(prev_img, "image/webp"), final, *refs],
            code=code, size=ctx.size, original=ctx.original, previous=prev_img, previous_mask=prev_mask,
            segmenter=ctx.segmenter, quality=ctx.profile.stage_quality, max_retries=ctx.profile.stage_retries,
            prompt_version=chain_tpl.version_tag,
        )
        if "S1" in images_by_stage:
            for c in res.attempts:
                c.cv["cut_region_change"] = cut_regions_change(ctx.original, images_by_stage["S1"], c.image, ctx.analysis, ctx.option)
        stage_image_ids[code] = _store_stage(db, job, ctx, res)
        if res.candidate:
            images_by_stage[code] = res.candidate.image
            prev_img, prev_mask = res.candidate.image, mask if mask is not None else prev_mask
        set_progress(db, job, code, "done", fallback=res.candidate is None)

    # B6 — P6 (hướng dẫn từng giai đoạn) song song P5 (tổng quan).
    set_status(db, job, JobStatus.writing_guide)
    set_progress(db, job, "guide", "running")
    started = time.monotonic()
    if ctx.profile.llm_roadmap:
        p6, p5 = load_active_prompt(db, "P6"), load_active_prompt(db, "P5")
        with ThreadPoolExecutor(max_workers=2) as pool:
            f6 = pool.submit(run_p6, ctx.llm, p6, ctx.analysis, plan)
            f5 = pool.submit(run_p5, ctx.llm, p5, ctx.analysis, ctx.option, ctx.final_judge)
            try:
                guide, rec6 = f6.result()
                report, rec5 = f5.result()
            except AIError as e:
                raise JobFailure("ai_unavailable", str(e)) from e
        record_step(db, job.id, rec6)
        record_step(db, job.id, rec5)
    else:
        guide = library_guide(ctx.analysis, ctx.option, plan, species_key=ctx.species_key,
                              style_key=ctx.style_key, region=ctx.region)
        report = library_report(ctx.analysis, ctx.option, guide, species_key=ctx.species_key)
        record_step(db, job.id, StepRecord("P6", "code", "care_library", None, 0, 0, 0, 0.0,
                                           int((time.monotonic() - started) * 1000), ok=True))
    guides = {g.id: g.model_dump(mode="json") for g in guide.stages}
    plans = {s.id: s.model_dump(mode="json") for s in plan.stages}

    existing = {s.code: s for s in db.query(Stage).filter(Stage.job_id == job.id)}
    for code in ("S0", "S1", "S2", "S3", "S4"):
        row = existing.get(code) or Stage(job_id=job.id, code=code)
        p = dict(row.plan or {})
        p.update(plans.get(code, {}))
        if code in ("S1", "S2", "S3"):
            p["fallback"] = "sketch" if stage_image_ids.get(code) is None else None
            row.image_id = stage_image_ids.get(code)
        row.plan = p
        row.guide_vi = guides.get(code)
        row.time_from_start = plans.get(code, {}).get("time_from_start") or row.time_from_start or ("Hôm nay" if code == "S0" else None)
        if code == "S4":
            row.image_id = ctx.final_render_id
        db.add(row)
    job.report = {**report.model_dump(mode="json"), "guide_disclaimer_vi": guide.disclaimer_vi}
    db.commit()
    set_progress(db, job, "guide", "done", latency_ms=int((time.monotonic() - started) * 1000))
