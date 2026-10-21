"""Phiên A (miễn phí): A0 chuẩn hóa ảnh → A1 P1 → A2 segment thân → A3 rule engine → A4 P2 → A5 sketch."""

from __future__ import annotations

import logging
import time
import uuid

from sqlalchemy.orm import Session

from bonsai_api import storage
from bonsai_api.db.models import DesignJob, DesignOption, JobStatus, Species, Tree, TreePhoto
from bonsai_api.db.session import get_sessionmaker
from bonsai_pipeline.adapters import AIError, ImageInput, get_llm_client
from bonsai_pipeline.phase_a import run_p1, run_p2
from bonsai_pipeline.rule_engine import compute_targets
from bonsai_pipeline.segmentation import segment_trunk
from bonsai_pipeline.sketch import build_scene, to_png, to_svg
from bonsai_pipeline.steps import StepRecord

from ..celery_app import app
from ..prompts_repo import load_active_prompt
from ..recording import JobFailure, job_guard, record_step, set_progress, set_status
from .preprocess import normalize_photo

log = logging.getLogger(__name__)

SPECIES_AUTO_CONFIDENCE = 0.6
_ACTIVE = {JobStatus.queued, JobStatus.analyzing, JobStatus.designing}


def _ordered_photos(db: Session, job: DesignJob) -> list[TreePhoto]:
    photos = db.query(TreePhoto).filter(TreePhoto.tree_id == job.tree_id).order_by(TreePhoto.view_index).all()
    if not photos:
        raise JobFailure("no_photos", "tree has no photos")
    front = next((p for p in photos if p.id == job.front_photo_id), None) or next(
        (p for p in photos if p.is_front), photos[0]
    )
    return [front] + [p for p in photos if p.id != front.id]


def _code_step(code: str, model: str, started: float, *, ok: bool = True, output=None, error=None) -> StepRecord:
    return StepRecord(code, "code", model, None, 0, 0, 0, 0.0, int((time.monotonic() - started) * 1000),
                      ok=ok, output=output, error=error)


def _record_ai_failure(db: Session, job_id: uuid.UUID, step: str, version: str, e: AIError) -> None:
    if e.trace is not None:
        record_step(db, job_id, StepRecord.from_trace(step, e.trace, prompt_version=version, ok=False, error=str(e)))


def run_phase_a(db: Session, job_id: uuid.UUID) -> None:
    with job_guard(db, job_id) as job:
        if job.status not in _ACTIVE:
            log.info("job %s already %s; skipping", job_id, job.status)
            return
        tree = db.get(Tree, job.tree_id)
        set_status(db, job, JobStatus.analyzing)
        for key in ("species", "trunk", "branches", "front"):
            set_progress(db, job, key, "running")

        # A0
        photos = _ordered_photos(db, job)
        for p in photos:
            if not normalize_photo(db, p, job_id=job.id):
                raise JobFailure("invalid_image", f"photo {p.id} is not a readable image")
        front = photos[0]
        job.front_photo_id = front.id
        images = [ImageInput(storage.get_bytes(p.storage_key), "image/webp") for p in photos]
        size = (front.width, front.height)

        # A1 — P1
        llm = get_llm_client()
        p1 = load_active_prompt(db, "P1")
        try:
            analysis, rec = run_p1(llm, p1, images, image_size=size, species_key=tree.species_key,
                                   real_height_cm=tree.real_height_cm)
        except AIError as e:
            _record_ai_failure(db, job.id, "P1", p1.version_tag, e)
            raise JobFailure("ai_unavailable", str(e)) from e
        record_step(db, job.id, rec, input_ref={"photo_ids": [str(p.id) for p in photos]})
        job.analysis = analysis.model_dump(mode="json")
        if not analysis.image_quality.usable:
            # Không trừ lượt ở phiên A nên không có gì để hoàn; người dùng chụp lại.
            job.error_code = "unusable_photo"
            job.error = ", ".join(analysis.image_quality.issues) or "unusable"
            set_status(db, job, JobStatus.failed)
            return

        assert analysis.species and analysis.trunk
        if tree.species_key is None and analysis.species.guess != "other" and analysis.species.confidence >= SPECIES_AUTO_CONFIDENCE:
            tree.species_key = analysis.species.guess
        set_progress(db, job, "species", "done", key=analysis.species.guess, confidence=analysis.species.confidence)
        set_progress(db, job, "trunk", "done", taper=analysis.trunk.taper, nebari=analysis.nebari.quality if analysis.nebari else None)
        set_progress(db, job, "branches", "done", count=len(analysis.branches))
        suggested = analysis.best_front_view_index if 0 <= analysis.best_front_view_index < len(photos) else 0
        set_progress(db, job, "front", "done", suggested_photo_id=str(photos[suggested].id), is_current=suggested == 0)

        # A2 — segment thân
        started = time.monotonic()
        seg = segment_trunk(images[0].data, analysis)
        mask_key = None
        if (mask_png := seg.mask_png()) is not None:
            mask_key = f"trees/{tree.id}/jobs/{job.id}/trunk_mask.png"
            storage.put_bytes(mask_key, mask_png, "image/png")
        record_step(db, job.id, _code_step("A2", "yolo-seg" if not seg.measure.cv_fallback else "p1-fallback", started,
                                           output=seg.measure.as_dict()))

        # A3 — rule engine
        species = db.get(Species, tree.species_key) if tree.species_key else None
        use_cv = not seg.measure.cv_fallback
        targets = compute_targets(
            analysis,
            image_size=size,
            growth_speed=species.growth_speed if species else "medium",
            real_height_cm=tree.real_height_cm,
            measured_height_px=seg.measure.height_px if use_cv else None,
            measured_base_diameter_px=seg.measure.base_diameter_px if use_cv else None,
        )
        job.targets = {**targets.as_dict(), "cv": seg.measure.as_dict(), "mask_key": mask_key}

        # A4 — P2
        set_status(db, job, JobStatus.designing)
        set_progress(db, job, "design", "running")
        p2 = load_active_prompt(db, "P2")
        inputs = job.inputs or {}
        try:
            design, rec = run_p2(llm, p2, analysis, targets, user_style=inputs.get("style"), goal=inputs.get("goal"))
        except AIError as e:
            _record_ai_failure(db, job.id, "P2", p2.version_tag, e)
            raise JobFailure("ai_unavailable", str(e)) from e
        record_step(db, job.id, rec)
        job.prompt_version = f"{p1.version_tag}+{p2.version_tag}"

        # A5 — sketch SVG (cho người dùng) + PNG (điều kiện cho P3)
        started = time.monotonic()
        for rank, opt in enumerate(design.options, start=1):
            scene = build_scene(analysis, opt, size)
            base = f"trees/{tree.id}/jobs/{job.id}/sketch_{rank}"
            storage.put_bytes(f"{base}.svg", to_svg(scene).encode(), "image/svg+xml")
            storage.put_bytes(f"{base}.png", to_png(scene, images[0].data), "image/png")
            db.add(DesignOption(
                job_id=job.id, rank=rank, style_key=opt.style_key, suitability=opt.suitability,
                design=opt.model_dump(mode="json"), sketch_svg_key=f"{base}.svg", sketch_png_key=f"{base}.png",
                sketch_meta=scene.counts,
            ))
        db.commit()
        record_step(db, job.id, _code_step("A5", "sketch", started, output={"options": len(design.options)}))
        set_progress(db, job, "design", "done", options=len(design.options))
        set_status(db, job, JobStatus.awaiting_choice)


@app.task(name="bonsai_worker.tasks.phase_a.run", acks_late=True)
def run(job_id: str) -> str:
    with get_sessionmaker()() as db:
        try:
            run_phase_a(db, uuid.UUID(job_id))
        except Exception:
            # job_guard đã đánh dấu failed; không để Celery giao lại job (tránh gọi AI lặp).
            log.exception("phase A failed for %s", job_id)
            return "failed"
        return db.get(DesignJob, uuid.UUID(job_id)).status.value
