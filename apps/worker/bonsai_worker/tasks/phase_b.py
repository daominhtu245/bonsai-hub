"""Phiên B (trả 1 lượt): B1 P3a render S4 (3 ứng viên song song) → B2 P4 (CV rồi VLM) → P3c tối đa 2 vòng
→ B3–B6 lộ trình (tasks/roadmap.py): P2b, S1 → S2 → S3, P6 ∥ P5.
Lỗi bất kỳ sau khi đã trừ lượt → job_guard đánh dấu `failed` và tự hoàn lượt.
"""

from __future__ import annotations

import io
import logging
import time
import uuid

import numpy as np
from PIL import Image
from sqlalchemy.orm import Session

from bonsai_api import storage
from bonsai_api.db.models import (
    DesignJob, DesignOption as OptionRow, JobStatus, RenderImage, Species, Stage, Style, Tree, TreePhoto,
)
from bonsai_api.db.session import get_sessionmaker
from bonsai_pipeline.adapters import AIError, ImageInput, get_image_client, get_llm_client
from bonsai_pipeline.phase_b import (
    MAX_REPAIR_ROUNDS, N_CANDIDATES, Candidate, cv_checks, generate, judge, p3a_variables, prompt_hash, repair_inputs,
    select, years_to_final,
)
from bonsai_pipeline.dictionaries import MAX_THICKEN_PCT_PER_YEAR
from bonsai_pipeline.prompts import render
from bonsai_pipeline.schemas import Analysis, DesignOption
from bonsai_pipeline.segmentation import get_segmenter
from bonsai_pipeline.steps import StepRecord

from ..celery_app import app
from ..prompts_repo import load_active_prompt
from ..recording import JobFailure, job_guard, record_step, set_progress, set_status
from .roadmap import RoadmapContext, run_roadmap

log = logging.getLogger(__name__)

_ACTIVE = {JobStatus.rendering_final, JobStatus.judging}
MAX_SPECIES_REFS = 3
DEFAULT_REGION = "south"  # chưa hỏi vùng khí hậu ở màn 03; mặc định miền Nam


def _load_mask(key: str | None) -> np.ndarray | None:
    if not key:
        return None
    return np.asarray(Image.open(io.BytesIO(storage.get_bytes(key))).convert("L")) > 127


def _store(db: Session, job: DesignJob, tree_id: uuid.UUID, c: Candidate) -> RenderImage:
    key = storage.job_image_key(tree_id, job.id, "S4", c.attempt)
    storage.put_bytes(key, c.image, "image/webp")
    row = RenderImage(job_id=job.id, stage_code="S4", attempt=c.attempt, storage_key=key, model=c.model,
                      prompt_hash=prompt_hash(c.prompt), cv_checks=c.cv, selected=False)
    db.add(row)
    db.commit()
    return row


B_PROGRESS_KEYS = ("render", "judge", "repair", "plan", "S1", "S2", "S3", "guide")


def _reset_previous_run(db: Session, job: DesignJob) -> dict[str, int]:
    """Thử lại sau lỗi: xóa giai đoạn cũ, bỏ chọn ảnh cũ (vẫn giữ làm dataset), trả số lần thử kế tiếp theo giai đoạn."""
    db.query(Stage).filter(Stage.job_id == job.id).delete()
    db.query(RenderImage).filter(RenderImage.job_id == job.id).update({"selected": False})
    progress = dict(job.progress or {})
    progress["steps"] = {k: v for k, v in (progress.get("steps") or {}).items() if k not in B_PROGRESS_KEYS}
    progress.pop("result", None)
    job.progress = progress
    db.commit()
    rows = db.query(RenderImage.stage_code, RenderImage.attempt).filter(RenderImage.job_id == job.id).all()
    base: dict[str, int] = {}
    for code, attempt in rows:
        base[code] = max(base.get(code, 0), attempt + 1)
    return base


def run_phase_b(db: Session, job_id: uuid.UUID) -> None:
    with job_guard(db, job_id) as job:
        if job.status not in _ACTIVE:
            log.info("job %s already %s; skipping", job_id, job.status)
            return
        if job.chosen_option_id is None or job.analysis is None or job.front_photo_id is None:
            raise JobFailure("invalid_state", "job has no chosen option / analysis / front photo")

        attempt_base = _reset_previous_run(db, job)
        tree = db.get(Tree, job.tree_id)
        option_row = db.get(OptionRow, job.chosen_option_id)
        option = DesignOption.model_validate(option_row.design)
        analysis = Analysis.model_validate(job.analysis)
        species = db.get(Species, tree.species_key) if tree.species_key else None
        style = db.get(Style, option.style_key)
        growth = species.growth_speed if species else "medium"
        years = years_to_final(growth)
        species_name = species.name_vi if species else "bonsai tree"

        photo = db.get(TreePhoto, job.front_photo_id)
        original = storage.get_bytes(photo.storage_key)
        size = (photo.width, photo.height)
        sketch_png = storage.get_bytes(option_row.sketch_png_key)
        refs = [storage.get_bytes(k) for k in (species.ref_image_keys if species else [])[:MAX_SPECIES_REFS]]
        images = [ImageInput(original, "image/webp"), ImageInput(sketch_png, "image/png")]
        images += [ImageInput(r, "image/webp") for r in refs]
        original_mask = _load_mask((job.targets or {}).get("mask_key"))
        segmenter = get_segmenter()

        p3a, p3c, p4 = (load_active_prompt(db, c) for c in ("P3a", "P3c", "P4"))
        base_prompt = render(p3a.user, p3a_variables(
            option, analysis, style_desc=style.prompt_desc_en if style else option.style_key,
            species_name=species_name, species_desc=species.prompt_desc_en if species else "small leaves",
            growth_speed=growth, years=years,
        ))
        image_client, llm = get_image_client(), get_llm_client()

        def run_generation(prompt: str, n: int, step: str, version: str, first: int) -> list[Candidate]:
            cands, failed = generate(image_client, prompt, images, size=size, n=n, step_code=step,
                                     prompt_version=version, first_attempt=first)
            for rec in failed:
                record_step(db, job.id, rec)
            for c in cands:
                c.record.output = {"attempt": c.attempt}
                record_step(db, job.id, c.record, input_ref={"option_id": str(option_row.id), "images": len(images)})
            return cands

        def evaluate(cands: list[Candidate]) -> None:
            set_status(db, job, JobStatus.judging)
            started = time.monotonic()
            rows = {}
            for c in cands:
                c.cv = cv_checks(original, c, original_mask=original_mask, segmenter=segmenter)
                rows[c.attempt] = _store(db, job, tree.id, c)
            record_step(db, job.id, StepRecord("P4cv", "code", "cv", None, 0, 0, 0, 0.0,
                                               int((time.monotonic() - started) * 1000), ok=True,
                                               output={str(c.attempt): c.cv for c in cands}))
            for c in cands:
                if c.cv["fails"]:
                    continue  # CV đã loại: không tốn tiền VLM
                try:
                    rec = judge(llm, p4, original, c, option=option, years=years, species_name=species_name)
                except AIError as e:
                    raise JobFailure("ai_unavailable", str(e)) from e
                record_step(db, job.id, rec)
                row = rows[c.attempt]
                row.judge, row.total_score = c.judge_raw, c.total
                db.commit()

        set_progress(db, job, "render", "running", candidates=N_CANDIDATES)
        all_cands = run_generation(base_prompt, N_CANDIDATES, "P3a", p3a.version_tag, attempt_base.get("S4", 0))
        if not all_cands:
            raise JobFailure("image_unavailable", "no candidate image was generated")
        set_progress(db, job, "render", "done", candidates=len(all_cands))
        set_progress(db, job, "judge", "running")
        evaluate(all_cands)

        sel = select(all_cands)
        rounds = 0
        while not sel.passed and rounds < MAX_REPAIR_ROUNDS and sel.best is not None:
            rounds += 1
            set_status(db, job, JobStatus.rendering_final)
            set_progress(db, job, "repair", "running", round=rounds)
            failed_checks, fixes = repair_inputs(sel.best)
            prompt = render(p3c.user, {"base_prompt": base_prompt, "failed_checks": failed_checks, "fix_instructions": fixes})
            new = run_generation(prompt, 1, "P3c", p3c.version_tag, max(c.attempt for c in all_cands) + 1)
            if not new:
                break
            evaluate(new)
            all_cands += new
            sel = select(all_cands)
        if rounds:
            set_progress(db, job, "repair", "done", rounds=rounds)
        set_progress(db, job, "judge", "done")

        if sel.best is None:
            raise JobFailure("image_unavailable", "no usable candidate")
        chosen = db.query(RenderImage).filter_by(job_id=job.id, stage_code="S4", attempt=sel.best.attempt).one()
        chosen.selected = True
        summary = sel.best.judge.summary_en if sel.best.judge else ""
        db.add(Stage(job_id=job.id, code="S0", time_from_start="Hôm nay"))
        db.add(Stage(job_id=job.id, code="S4", time_from_start=f"{years} năm", image_id=chosen.id,
                     plan={"years": years, "summary_en": summary}))
        db.commit()
        progress = dict(job.progress or {})
        progress["result"] = {"low_confidence": sel.low_confidence, "years": years, "repair_rounds": rounds,
                              "candidates": len(all_cands)}
        job.progress = progress
        db.commit()

        run_roadmap(db, job, RoadmapContext(
            tree_id=tree.id, analysis=analysis, option=option, growth_speed=growth,
            region=(job.inputs or {}).get("region", DEFAULT_REGION),
            max_thicken_pct=MAX_THICKEN_PCT_PER_YEAR.get(growth, 10) * years,
            size=size, original=original, original_mask=original_mask, sketch_png=sketch_png, species_refs=refs,
            final_image=sel.best.image, final_render_id=chosen.id, final_summary=summary, final_judge=sel.best.judge_raw,
            segmenter=segmenter, image_client=image_client, llm=llm, attempt_base=attempt_base,
        ))
        set_status(db, job, JobStatus.done)


@app.task(name="bonsai_worker.tasks.phase_b.run", acks_late=True)
def run(job_id: str) -> str:
    try:
        return _run(job_id)
    finally:
        # Báo người dùng (Web Push / Zalo) kể cả khi lỗi; task riêng để lỗi gửi không ảnh hưởng kết quả.
        app.send_task("bonsai_worker.tasks.notify.job_event", args=[job_id])


def _run(job_id: str) -> str:
    with get_sessionmaker()() as db:
        try:
            run_phase_b(db, uuid.UUID(job_id))
        except Exception:
            log.exception("phase B failed for %s", job_id)
            return "failed"
        return db.get(DesignJob, uuid.UUID(job_id)).status.value
