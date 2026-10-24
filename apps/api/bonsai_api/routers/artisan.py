"""Khu nghệ nhân (/artisan): chỉnh bộ luật có phiên bản + chấm ảnh kết quả / phương án thiết kế theo bảng chấm.

Nghệ nhân không thấy email, tiền, lượt của người dùng — chỉ ảnh cây, bản vẽ và thông tin thiết kế.
Admin cũng vào được. Mọi thay đổi bộ luật ghi nhật ký quản trị (admin_audit).
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert

from bonsai_pipeline.dictionaries import RULE_DOCS, ordered_rule_doc
from bonsai_pipeline.rules_validate import validate_rule_doc

from .. import storage
from ..db.models import (
    ArtisanReview, DesignJob, DesignOption, JobStatus, RenderImage, RuleDoc, Species, Style, Tree, TreePhoto, User,
)
from ..security import DB, require_artisan
from ..services.audit import audit

router = APIRouter(prefix="/artisan", tags=["artisan"])
Artisan = Annotated[User, Depends(require_artisan)]
USER_RANK = 9  # phương án do người dùng tự ghép (không chấm ở Cổng 1)


# ---------- bộ luật ----------


class RuleVersionOut(BaseModel):
    version: int
    note: str | None
    active: bool
    created_by: str | None
    created_at: datetime
    activated_by: str | None
    activated_at: datetime | None


class RuleDocOut(BaseModel):
    doc: str
    title_vi: str
    active: RuleVersionOut | None
    content: dict
    versions: list[RuleVersionOut]


class RuleSummary(BaseModel):
    doc: str
    title_vi: str
    active_version: int | None
    versions: int
    updated_at: datetime | None
    updated_by: str | None


class RuleIn(BaseModel):
    content: dict
    note: str = Field(min_length=3, max_length=300)
    activate: bool = True


class ValidateIn(BaseModel):
    content: dict


def _doc_name(doc: str) -> str:
    if doc not in RULE_DOCS:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không có bộ luật này.")
    return doc


def _versions(db, doc: str) -> list[RuleDoc]:
    return db.execute(select(RuleDoc).where(RuleDoc.doc == doc).order_by(RuleDoc.version.desc())).scalars().all()


def _out(doc: str, rows: list[RuleDoc]) -> RuleDocOut:
    active = next((r for r in rows if r.active), None)
    return RuleDocOut(doc=doc, title_vi=RULE_DOCS[doc]["title_vi"],
                      active=RuleVersionOut.model_validate(active, from_attributes=True) if active else None,
                      content=ordered_rule_doc(doc, active.content) if active else {},
                      versions=[RuleVersionOut.model_validate(r, from_attributes=True) for r in rows])


@router.get("/rules", response_model=list[RuleSummary])
def list_rules(db: DB, _: Artisan):
    out = []
    for doc, meta in RULE_DOCS.items():
        rows = _versions(db, doc)
        active = next((r for r in rows if r.active), None)
        latest = rows[0] if rows else None
        out.append(RuleSummary(doc=doc, title_vi=meta["title_vi"], active_version=active.version if active else None,
                               versions=len(rows), updated_at=latest.created_at if latest else None,
                               updated_by=latest.created_by if latest else None))
    return out


@router.get("/rules/{doc}", response_model=RuleDocOut)
def get_rule(doc: str, db: DB, _: Artisan):
    return _out(_doc_name(doc), _versions(db, doc))


@router.get("/rules/{doc}/versions/{version}")
def get_rule_version(doc: str, version: int, db: DB, _: Artisan):
    row = db.execute(select(RuleDoc).where(RuleDoc.doc == _doc_name(doc), RuleDoc.version == version)).scalar_one_or_none()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không có phiên bản này.")
    return {**RuleVersionOut.model_validate(row, from_attributes=True).model_dump(), "content": ordered_rule_doc(doc, row.content)}


@router.post("/rules/{doc}/validate")
def validate_rule(doc: str, body: ValidateIn, _: Artisan):
    return {"errors": validate_rule_doc(_doc_name(doc), body.content)}


def _activate(db, doc: str, row: RuleDoc, who: User) -> None:
    db.execute(update(RuleDoc).where(RuleDoc.doc == doc, RuleDoc.active).values(active=False))
    db.flush()
    row.active, row.activated_by, row.activated_at = True, who.email, func.now()


@router.post("/rules/{doc}", response_model=RuleDocOut, status_code=status.HTTP_201_CREATED)
def save_rule(doc: str, body: RuleIn, db: DB, who: Artisan):
    errors = validate_rule_doc(_doc_name(doc), body.content)
    if errors:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "; ".join(errors))
    last = db.execute(select(func.max(RuleDoc.version)).where(RuleDoc.doc == doc)).scalar_one() or 0
    row = RuleDoc(doc=doc, version=last + 1, content=body.content, note=body.note, created_by=who.email)
    db.add(row)
    db.flush()
    if body.activate:
        _activate(db, doc, row, who)
    audit(db, who, "rules.save", "rule_doc", f"{doc}.v{row.version}", note=body.note, activated=body.activate)
    db.commit()
    return _out(doc, _versions(db, doc))


@router.post("/rules/{doc}/versions/{version}/activate", response_model=RuleDocOut)
def activate_rule(doc: str, version: int, db: DB, who: Artisan):
    row = db.execute(select(RuleDoc).where(RuleDoc.doc == _doc_name(doc), RuleDoc.version == version)).scalar_one_or_none()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không có phiên bản này.")
    if not row.active:
        _activate(db, doc, row, who)
        audit(db, who, "rules.activate", "rule_doc", f"{doc}.v{version}")
        db.commit()
    return _out(doc, _versions(db, doc))


# ---------- bảng chấm đang dùng ----------


def _judging(db) -> tuple[dict, int | None]:
    from bonsai_pipeline.dictionaries import default_rule_doc

    row = db.execute(select(RuleDoc).where(RuleDoc.doc == "judging", RuleDoc.active)).scalar_one_or_none()
    return (ordered_rule_doc("judging", row.content), row.version) if row else (default_rule_doc("judging"), None)


@router.get("/judging")
def judging_sheet(db: DB, _: Artisan):
    j, version = _judging(db)
    return {"version": version, "criteria": j.get("criteria", {}), "fidelity_hard_fail": j.get("fidelity_hard_fail", []),
            "pass_score": j.get("pass_score", 65), "presentation_faults": j.get("presentation_faults", [])}


# ---------- hàng chờ chấm ----------


class ReviewItem(BaseModel):
    kind: Literal["image", "design"]
    job_id: uuid.UUID
    render_id: uuid.UUID | None = None
    option_id: uuid.UUID | None = None
    photo_url: str
    photo_size: list[int] | None
    result_url: str | None = None
    collage_url: str | None = None
    sketch_svg_url: str | None = None
    style_vi: str | None
    species_vi: str | None
    years: int | None = None
    why_vi: str | None = None
    counts: dict = {}
    remaining: int


def _photo(db, job: DesignJob) -> TreePhoto | None:
    return db.get(TreePhoto, job.front_photo_id) if job.front_photo_id else None


def _names(db, job: DesignJob, style_key: str | None) -> tuple[str | None, str | None]:
    tree = db.get(Tree, job.tree_id)
    sp = db.get(Species, tree.species_key) if tree and tree.species_key else None
    st = db.get(Style, style_key) if style_key else None
    return (st.name_vi if st else style_key), (sp.name_vi if sp else None)


def _image_queue(db, me: uuid.UUID, skip: list[uuid.UUID]):
    mine = select(ArtisanReview.render_id).where(ArtisanReview.reviewer_id == me, ArtisanReview.render_id.is_not(None))
    q = (select(RenderImage).join(DesignJob, DesignJob.id == RenderImage.job_id)
         .where(RenderImage.stage_code == "S4", RenderImage.selected, DesignJob.status == JobStatus.done,
                RenderImage.id.not_in(mine)))
    if skip:
        q = q.where(RenderImage.id.not_in(skip))
    return q


def _design_queue(db, me: uuid.UUID, skip: list[uuid.UUID]):
    mine = select(ArtisanReview.option_id).where(ArtisanReview.reviewer_id == me, ArtisanReview.option_id.is_not(None))
    q = (select(DesignOption).join(DesignJob, DesignJob.id == DesignOption.job_id)
         .where(DesignOption.rank < USER_RANK, DesignOption.sketch_svg_key.is_not(None), DesignOption.id.not_in(mine)))
    if skip:
        q = q.where(DesignOption.id.not_in(skip))
    return q


@router.get("/reviews/next", response_model=ReviewItem | None)
def next_review(db: DB, me: Artisan, kind: Literal["image", "design"] = "image",
                skip: Annotated[list[uuid.UUID], Query()] = []):  # noqa: B006 — FastAPI query list
    if kind == "image":
        q = _image_queue(db, me.id, skip)
        remaining = db.execute(select(func.count()).select_from(q.subquery())).scalar_one()
        r = db.execute(q.order_by(RenderImage.created_at.desc()).limit(1)).scalar_one_or_none()
        if r is None:
            return None
        job = db.get(DesignJob, r.job_id)
        opt = db.get(DesignOption, job.chosen_option_id) if job.chosen_option_id else None
        photo = _photo(db, job)
        if photo is None:
            return None
        style_vi, species_vi = _names(db, job, opt.style_key if opt else None)
        prep = (job.progress or {}).get("s4_prep") or {}
        return ReviewItem(kind="image", job_id=job.id, render_id=r.id, photo_url=storage.presign_get(photo.storage_key),
                          photo_size=[photo.width, photo.height] if photo.width else None, result_url=storage.presign_get(r.storage_key),
                          collage_url=storage.presign_get(prep["collage_key"]) if prep.get("collage_key") else None,
                          sketch_svg_url=storage.presign_get(opt.sketch_svg_key) if opt and opt.sketch_svg_key else None,
                          style_vi=style_vi, species_vi=species_vi, years=((job.progress or {}).get("result") or {}).get("years"),
                          counts=(opt.sketch_meta or {}) if opt else {}, remaining=remaining)
    q = _design_queue(db, me.id, skip)
    remaining = db.execute(select(func.count()).select_from(q.subquery())).scalar_one()
    o = db.execute(q.order_by(DesignOption.job_id.desc(), DesignOption.rank).limit(1)).scalar_one_or_none()
    if o is None:
        return None
    job = db.get(DesignJob, o.job_id)
    photo = _photo(db, job)
    if photo is None:
        return None
    style_vi, species_vi = _names(db, job, o.style_key)
    return ReviewItem(kind="design", job_id=job.id, option_id=o.id, photo_url=storage.presign_get(photo.storage_key),
                      photo_size=[photo.width, photo.height] if photo.width else None,
                      sketch_svg_url=storage.presign_get(o.sketch_svg_key), style_vi=style_vi, species_vi=species_vi,
                      why_vi=(o.design or {}).get("why_vi"), counts=o.sketch_meta or {}, remaining=remaining)


class ReviewIn(BaseModel):
    kind: Literal["image", "design"]
    render_id: uuid.UUID | None = None
    option_id: uuid.UUID | None = None
    scores: dict[str, int] = {}
    hard_fails: list[str] = Field(default=[], max_length=20)
    passed: bool
    comment: str | None = Field(default=None, max_length=2000)


class ReviewOut(BaseModel):
    id: int
    kind: str
    job_id: uuid.UUID
    total: float | None
    passed: bool
    hard_fails: list
    scores: dict
    comment: str | None
    created_at: datetime
    ai_total: float | None = None  # điểm AI (P4) quy về thang 100 — chỉ trả sau khi nghệ nhân đã chấm
    ai_hard_fail: list | None = None
    ai_summary: str | None = None


def weighted_total(scores: dict[str, int], criteria: dict) -> float | None:
    """Điểm thang 100 theo trọng số; tiêu chí không chấm thì bỏ khỏi mẫu số."""
    pairs = [(scores[k], c.get("weight", 0)) for k, c in criteria.items() if k in scores]
    wsum = sum(w for _, w in pairs)
    return round(sum(s * w for s, w in pairs) / wsum * 10, 2) if wsum else None


def _review_out(db, r: ArtisanReview) -> ReviewOut:
    out = ReviewOut.model_validate(r, from_attributes=True)
    if r.render_id:
        img = db.get(RenderImage, r.render_id)
        if img is not None and img.total_score is not None:
            out.ai_total = round(float(img.total_score) * 10, 2)
        if img is not None and img.judge:
            out.ai_hard_fail, out.ai_summary = img.judge.get("hard_fail"), img.judge.get("summary_en")
    return out


@router.post("/reviews", response_model=ReviewOut)
def save_review(body: ReviewIn, db: DB, me: Artisan):
    criteria, version = _judging(db)
    criteria = criteria.get("criteria", {})
    bad = [k for k, v in body.scores.items() if k not in criteria or not 1 <= v <= 10]
    if bad:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Điểm không hợp lệ: {bad}")
    if body.kind == "image":
        target = db.get(RenderImage, body.render_id) if body.render_id else None
        job_id = target.job_id if target else None
    else:
        target = db.get(DesignOption, body.option_id) if body.option_id else None
        job_id = target.job_id if target else None
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy ảnh / phương án.")
    values = {"kind": body.kind, "job_id": job_id, "render_id": body.render_id if body.kind == "image" else None,
              "option_id": body.option_id if body.kind == "design" else None, "reviewer_id": me.id,
              "scores": body.scores, "hard_fails": body.hard_fails, "total": weighted_total(body.scores, criteria),
              "passed": body.passed and not body.hard_fails, "comment": body.comment, "rules_version": version}
    key = ["reviewer_id", "render_id"] if body.kind == "image" else ["reviewer_id", "option_id"]
    stmt = insert(ArtisanReview).values(**values)
    stmt = stmt.on_conflict_do_update(index_elements=key, set_={k: stmt.excluded[k] for k in
                                                                ("scores", "hard_fails", "total", "passed", "comment", "rules_version")}
                                      | {"updated_at": func.now()})
    db.execute(stmt)
    db.commit()
    cond = (ArtisanReview.render_id == body.render_id) if body.kind == "image" else (ArtisanReview.option_id == body.option_id)
    row = db.execute(select(ArtisanReview).where(ArtisanReview.reviewer_id == me.id, cond)).scalar_one()
    return _review_out(db, row)


@router.get("/reviews", response_model=list[ReviewOut])
def my_reviews(db: DB, me: Artisan, limit: int = Query(50, le=200)):
    rows = db.execute(select(ArtisanReview).where(ArtisanReview.reviewer_id == me.id)
                      .order_by(ArtisanReview.created_at.desc()).limit(limit)).scalars().all()
    return [_review_out(db, r) for r in rows]


# ---------- thống kê (Cổng 1 / Cổng 2) ----------


@router.get("/stats")
def stats(db: DB, _: Artisan):
    criteria, _v = _judging(db)
    criteria = criteria.get("criteria", {})
    rows = db.execute(select(ArtisanReview)).scalars().all()
    out: dict = {}
    for kind in ("image", "design"):
        rs = [r for r in rows if r.kind == kind]
        by_crit = {k: [r.scores[k] for r in rs if k in (r.scores or {})] for k in criteria}
        fails: dict[str, int] = {}
        for r in rs:
            for f in r.hard_fails or []:
                fails[f] = fails.get(f, 0) + 1
        item = {
            "count": len(rs), "targets": len({r.render_id or r.option_id for r in rs}),
            "pass_rate": round(sum(r.passed for r in rs) / len(rs), 3) if rs else None,
            "avg_total": round(sum(float(r.total) for r in rs if r.total is not None) / max(1, sum(r.total is not None for r in rs)), 1) if rs else None,
            "by_criterion": {k: {"avg": round(sum(v) / len(v), 2) if v else None, "n": len(v)} for k, v in by_crit.items()},
            "hard_fails": sorted(fails.items(), key=lambda x: -x[1]),
        }
        if kind == "image":  # độ khớp giữa nghệ nhân và AI chấm (P4)
            pairs = []
            for r in rs:
                img = db.get(RenderImage, r.render_id)
                if img is not None and img.total_score is not None and r.total is not None:
                    ai = float(img.total_score) * 10
                    ai_pass = ai >= float(_judging(db)[0].get("pass_score", 65)) and not (img.judge or {}).get("hard_fail")
                    pairs.append((float(r.total), ai, r.passed, ai_pass))
            item["ai_agreement"] = {
                "pairs": len(pairs),
                "same_verdict": round(sum(a == b for *_x, a, b in pairs) / len(pairs), 3) if pairs else None,
                "mean_abs_diff": round(sum(abs(h - a) for h, a, *_y in pairs) / len(pairs), 1) if pairs else None,
            }
        out[kind] = item
    reviewers = db.execute(select(User.name, User.email, func.count(ArtisanReview.id))
                           .join(ArtisanReview, ArtisanReview.reviewer_id == User.id).group_by(User.id)).all()
    out["reviewers"] = [{"name": n or (e or "").split("@")[0], "count": c} for n, e, c in reviewers]
    return out
