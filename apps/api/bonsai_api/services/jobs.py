from __future__ import annotations

from datetime import datetime, time
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import storage
from ..db.models import DesignJob, Style, Tree, TreePhoto, User
from ..schemas import AnalysisSummary, JobOut, OptionOut, PhotoRef

VN_TZ = ZoneInfo("Asia/Ho_Chi_Minh")
STREAM_END = {"awaiting_choice", "done", "failed"}


def jobs_today(db: Session, user: User) -> int:
    start = datetime.combine(datetime.now(VN_TZ).date(), time.min, tzinfo=VN_TZ)
    return db.execute(
        select(func.count()).select_from(DesignJob).where(DesignJob.user_id == user.id, DesignJob.created_at >= start)
    ).scalar_one()


def _analysis_summary(job: DesignJob) -> AnalysisSummary | None:
    a = job.analysis
    if not a:
        return None
    t = job.targets or {}
    cm_per_px = t.get("cm_per_px")
    species = a.get("species") or {}
    return AnalysisSummary(
        usable=a["image_quality"]["usable"],
        issues=a["image_quality"].get("issues", []),
        species_key=species.get("guess"),
        species_confidence=species.get("confidence"),
        summary_vi=a.get("summary_vi", ""),
        branch_count=len(a.get("branches", [])),
        height_cm=t.get("real_height_cm"),
        base_diameter_cm=t.get("base_diameter_cm"),
        lower_apex_cm=round(t["lower_apex_by_px"] * cm_per_px, 1) if cm_per_px and t.get("lower_apex_by_px") else None,
    )


def job_out(db: Session, job: DesignJob, user: User) -> JobOut:
    tree = db.get(Tree, job.tree_id)
    styles = {s.key: s for s in db.execute(select(Style)).scalars()}
    front = db.get(TreePhoto, job.front_photo_id) if job.front_photo_id else None
    if front is None:
        front = db.execute(
            select(TreePhoto).where(TreePhoto.tree_id == job.tree_id).order_by(TreePhoto.is_front.desc(), TreePhoto.view_index)
        ).scalars().first()
    options = []
    for o in job.options:
        d = o.design
        st = styles.get(o.style_key)
        options.append(OptionOut(
            id=o.id, rank=o.rank, style_key=o.style_key,
            name_vi=st.name_vi if st else o.style_key, name_jp=st.name_jp if st else None,
            suitability=o.suitability, why_vi=d.get("why_vi", ""), care_steps_vi=d.get("care_steps_vi", []),
            remove_reasons_vi=[r["reason_vi"] for r in d.get("remove_branches", [])],
            new_branch_notes_vi=[n["note_vi"] for n in d.get("new_branches_needed", [])],
            counts=o.sketch_meta or {},
            sketch_svg_url=storage.presign_get(o.sketch_svg_key) if o.sketch_svg_key else None,
        ))
    return JobOut(
        id=job.id, tree_id=job.tree_id, tree_nickname=tree.nickname if tree else None,
        status=job.status.value, error_code=job.error_code, progress=job.progress or {}, created_at=job.created_at,
        front_photo=PhotoRef(id=front.id, url=storage.presign_get(front.storage_key), width=front.width, height=front.height)
        if front else None,
        analysis=_analysis_summary(job), options=options, chosen_option_id=job.chosen_option_id,
        credits_left=user.credits,
    )
