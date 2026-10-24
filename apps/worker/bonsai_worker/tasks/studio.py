"""Xem thử nhanh bản tự thiết kế: 1 ảnh S4 chất lượng thấp (rẻ), miễn phí tối đa 2 lần mỗi phiên.

Cùng prompt P3a và bản vẽ như lượt tạo ảnh thật; không chấm điểm, không lộ trình. Ảnh lưu `render_images`
(stage "PV", selected=false) — vẫn là dữ liệu cho sau này.
"""

from __future__ import annotations

import logging
import uuid

from sqlalchemy import select

from bonsai_api import storage
from bonsai_api.db.models import DesignJob, DesignOption, RenderImage, Species, Style, Tree, TreePhoto
from bonsai_api.db.session import get_sessionmaker
from bonsai_pipeline.adapters import AIError, get_image_client
from bonsai_pipeline.phase_b import p3a_variables, prepare_s4, prompt_hash, to_webp, years_to_final
from bonsai_pipeline.prompts import render
from bonsai_pipeline.schemas import Analysis
from bonsai_pipeline.schemas import DesignOption as DesignSchema
from bonsai_pipeline.steps import StepRecord

from ..celery_app import app
from ..prompts_repo import load_active_prompt
from ..recording import record_step
from ..rules_repo import active_rules
from .phase_b import cutout_mask

log = logging.getLogger(__name__)
USER_RANK = 9


def _set(db, job: DesignJob, **kw) -> None:
    job.progress = {**(job.progress or {}), "preview": {**((job.progress or {}).get("preview") or {}), **kw}}
    db.commit()


def run_preview(db, job_id: uuid.UUID) -> None:
    with active_rules(db):
        _run_preview(db, job_id)


def _run_preview(db, job_id: uuid.UUID) -> None:
    job = db.get(DesignJob, job_id)
    row = db.execute(select(DesignOption).where(DesignOption.job_id == job_id, DesignOption.rank == USER_RANK)).scalar_one_or_none()
    if job is None or row is None:
        return
    try:
        tree = db.get(Tree, job.tree_id)
        species = db.get(Species, tree.species_key) if tree and tree.species_key else None
        style = db.get(Style, row.style_key)
        option, analysis = DesignSchema.model_validate(row.design), Analysis.model_validate(job.analysis)
        growth = species.growth_speed if species else "medium"
        years = years_to_final(growth)
        photo = db.get(TreePhoto, job.front_photo_id)
        p3a = load_active_prompt(db, "P3a")
        prompt = render(p3a.user, p3a_variables(
            option, analysis, style_desc=style.prompt_desc_en if style else option.style_key,
            species_name=species.name_vi if species else "bonsai tree", species_desc=species.prompt_desc_en if species else "small leaves",
            growth_speed=growth, years=years,
        ))
        original = storage.get_bytes(photo.storage_key)
        s4 = prepare_s4(original, storage.get_bytes(row.sketch_png_key), analysis, option,
                        species_key=tree.species_key if tree else None, cutout=cutout_mask(job))
        res = get_image_client().edit(prompt=prompt, images=s4.images, n=1, quality="low", mask=s4.mask_png)
        webp, _ = to_webp(res.response.images[0], (photo.width, photo.height))
        webp, _ = s4.lock(original)(webp)
        n = int(((job.progress or {}).get("preview") or {}).get("count", 1))
        key = storage.job_image_key(job.tree_id, job.id, "PV", n)
        storage.put_bytes(key, webp, "image/webp")
        db.add(RenderImage(job_id=job.id, stage_code="PV", attempt=n, storage_key=key, model=res.response.model,
                           prompt_hash=prompt_hash(prompt), cv_checks={"preview": True}, selected=False))
        record_step(db, job.id, StepRecord.from_trace("PV", res.trace, prompt_version=p3a.version_tag, ok=True,
                                                      output={"attempt": n}))
        _set(db, job, state="done", key=key)
    except AIError as e:
        if e.trace:
            record_step(db, job.id, StepRecord.from_trace("PV", e.trace, prompt_version=None, ok=False, error=str(e)))
        pv = (job.progress or {}).get("preview") or {}
        _set(db, job, state="failed", count=max(0, int(pv.get("count", 1)) - 1))  # lỗi không tính vào 2 lần
    except Exception:
        log.exception("preview failed for %s", job_id)
        pv = (job.progress or {}).get("preview") or {}
        _set(db, job, state="failed", count=max(0, int(pv.get("count", 1)) - 1))


@app.task(name="bonsai_worker.tasks.studio.preview")
def preview(job_id: str) -> str:
    with get_sessionmaker()() as db:
        run_preview(db, uuid.UUID(job_id))
        return str(((db.get(DesignJob, uuid.UUID(job_id)).progress or {}).get("preview") or {}).get("state"))
