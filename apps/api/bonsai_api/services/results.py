from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import storage
from ..db.models import (
    DesignJob, DesignOption, Feedback, PhotoSource, RenderImage, Stage, StageTaskCheck, Style, Tree, TreePhoto, User,
)
from ..schemas import PhotoRef, ResultFull, StageGuideOut, StageOut

SHORT = {"S0": "Hiện tại", "S1": "Tạo khung", "S2": "Nuôi cành", "S3": "Định tầng", "S4": "Hoàn thiện"}
NAME = {"S0": "Hiện trạng", "S1": "Tạo khung", "S2": "Phục hồi và nuôi cành", "S3": "Định tầng tán", "S4": "Hoàn thiện"}
DISCLAIMER = "Ảnh là minh họa định hướng; tốc độ thực tế phụ thuộc chăm sóc, khí hậu và sức khỏe cây."


def _guide(g: dict | None) -> StageGuideOut | None:
    if not g:
        return None
    return StageGuideOut(
        title_vi=g.get("title_vi", ""), see_vi=g.get("see_vi", ""), actions_vi=g.get("actions_vi", []),
        best_time_vi=g.get("best_time_vi", ""), care_vi=g.get("care_vi", []),
        ready_signs_vi=g.get("ready_signs_vi", []), common_mistakes_vi=g.get("common_mistakes_vi", []),
    )


def result_full(db: Session, job: DesignJob, user: User) -> ResultFull:
    tree = db.get(Tree, job.tree_id)
    option = db.get(DesignOption, job.chosen_option_id) if job.chosen_option_id else None
    style = db.get(Style, option.style_key) if option else None
    front = db.get(TreePhoto, job.front_photo_id) if job.front_photo_id else None
    if front is None:
        front = db.execute(select(TreePhoto).where(TreePhoto.tree_id == job.tree_id, TreePhoto.source == PhotoSource.upload)
                           .order_by(TreePhoto.is_front.desc(), TreePhoto.view_index)).scalars().first()
    stages = {s.code: s for s in db.execute(select(Stage).where(Stage.job_id == job.id)).scalars()}
    images = {r.id: r for r in db.execute(select(RenderImage).where(RenderImage.job_id == job.id, RenderImage.selected)).scalars()}
    checks: dict[str, list[int]] = {}
    for c in db.execute(select(StageTaskCheck).where(StageTaskCheck.job_id == job.id)).scalars():
        checks.setdefault(c.stage_code, []).append(c.task_index)
    rating = db.execute(select(Feedback.rating).where(Feedback.job_id == job.id, Feedback.user_id == user.id)).scalar_one_or_none()

    out = []
    for code in ("S0", "S1", "S2", "S3", "S4"):
        st = stages.get(code)
        plan = (st.plan or {}) if st else {}
        img = images.get(st.image_id) if st and st.image_id else None
        if code == "S0" and front:
            url = storage.presign_get(front.storage_key)
        else:
            url = storage.presign_get(img.storage_key) if img else None
        out.append(StageOut(
            code=code, short_vi=SHORT[code], name_vi=plan.get("name_vi") or NAME[code],
            time_from_start=(st.time_from_start if st else None),
            image_url=url, fallback_sketch=plan.get("fallback") == "sketch",
            guide=_guide(st.guide_vi if st else None), done_tasks=sorted(checks.get(code, [])),
        ))
    meta = (job.progress or {}).get("result", {})
    report = job.report or None
    return ResultFull(
        job_id=job.id, tree_id=job.tree_id, tree_nickname=tree.nickname if tree else None,
        style_vi=style.name_vi if style else None, style_jp=style.name_jp if style else None,
        low_confidence=bool(meta.get("low_confidence")), years=meta.get("years"),
        front_photo=PhotoRef(id=front.id, url=storage.presign_get(front.storage_key), width=front.width, height=front.height) if front else None,
        sketch_svg_url=storage.presign_get(option.sketch_svg_key) if option and option.sketch_svg_key else None,
        stages=out, report=report, disclaimer_vi=(report or {}).get("guide_disclaimer_vi") or DISCLAIMER, my_rating=rating,
    )
