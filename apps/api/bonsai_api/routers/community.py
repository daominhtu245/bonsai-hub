"""Cộng đồng, giữ chân (docs/ideas.md B2, B3, B4, B6, B7). Không tốn lượt, không gọi AI."""

from __future__ import annotations

import random
import uuid
from datetime import UTC, datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm.attributes import flag_modified

from bonsai_pipeline.schemas import Analysis
from bonsai_pipeline.user_design import UserDesignIn

from .. import storage
from ..db.models import (
    Challenge, ChallengeEntry, ChallengeVote, DesignJob, DesignOption, DesignVote, JobStatus, PhotoSource, RenderImage, Style,
    Tree, TreePhoto, User, UserRole,
)
from ..security import DB, CurrentUser, require_admin
from ..services import community
from ..services.audit import audit
from .studio import StudioOut, studio_payload
from ..services.features import require_feature


router = APIRouter(tags=["community"])
Admin = Annotated[User, Depends(require_admin)]


def _own_tree(db, tree_id: uuid.UUID, user) -> Tree:
    tree = db.get(Tree, tree_id)
    if tree is None or tree.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy cây.")
    return tree


def _latest_done(db, tree: Tree) -> DesignJob | None:
    return db.execute(select(DesignJob).where(DesignJob.tree_id == tree.id, DesignJob.status == JobStatus.done)
                      .order_by(DesignJob.created_at.desc())).scalars().first()


def _stage_url(db, job: DesignJob, code: str) -> str | None:
    img = db.execute(select(RenderImage).where(RenderImage.job_id == job.id, RenderImage.stage_code == code, RenderImage.selected.is_(True))
                     .order_by(RenderImage.attempt.desc())).scalars().first()
    return storage.presign_get(img.storage_key) if img else None


# ---------- B2: mốc nhật ký ----------


@router.get("/trees/{tree_id}/milestones", dependencies=[require_feature("diary_rewards")])
def milestones(tree_id: uuid.UUID, db: DB, user: CurrentUser):
    from ..services.ops import get_ops

    tree = _own_tree(db, tree_id, user)
    credits = int(get_ops(db).get("diary_reward_credits") or 0)
    return [{"month": m.month, "due": m.due.date().isoformat(), "open_from": m.open_from.date().isoformat(),
             "open_to": m.open_to.date().isoformat(), "rewarded": m.rewarded, "photo_taken": m.photo_taken, "credits": credits}
            for m in community.milestones(db, tree)]


# ---------- B3: dự đoán và thực tế ----------


class RealityIn(BaseModel):
    score: int = Field(ge=1, le=5)  # cây thật giống ảnh dự đoán: 1 không giống – 5 rất giống


@router.get("/trees/{tree_id}/reality", dependencies=[require_feature("reality")])
def reality(tree_id: uuid.UUID, db: DB, user: CurrentUser):
    tree = _own_tree(db, tree_id, user)
    job = _latest_done(db, tree)
    photo = db.execute(select(TreePhoto).where(TreePhoto.tree_id == tree.id, TreePhoto.source == PhotoSource.progress,
                                               ~TreePhoto.storage_key.startswith("uploads/"))
                       .order_by(TreePhoto.taken_at.desc())).scalars().first()
    if job is None or photo is None or photo.taken_at is None:
        return None
    start = job.finished_at or job.created_at
    months = max(0.0, (photo.taken_at - start).days / 30)
    code = community.expected_stage(job, months)
    return {"job_id": str(job.id), "months": round(months, 1), "stage_code": code, "predicted_url": _stage_url(db, job, code),
            "real_url": storage.presign_get(photo.storage_key), "real_taken_at": photo.taken_at.isoformat(),
            "score": ((job.progress or {}).get("reality") or {}).get("score")}


@router.post("/trees/{tree_id}/reality", dependencies=[require_feature("reality")], status_code=status.HTTP_204_NO_CONTENT)
def rate_reality(tree_id: uuid.UUID, body: RealityIn, db: DB, user: CurrentUser):
    """Người dùng tự chấm độ giống → thước đo chất lượng AI theo thời gian (admin xem ở thống kê)."""
    tree = _own_tree(db, tree_id, user)
    job = _latest_done(db, tree)
    if job is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cây chưa có lộ trình.")
    job.progress = {**(job.progress or {}), "reality": {"score": body.score, "at": datetime.now(UTC).isoformat()}}
    flag_modified(job, "progress")
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------- B6: quẹt chọn dáng ----------


def _style_vi(db, key: str) -> str:
    st = db.get(Style, key)
    return st.name_vi if st else key


@router.get("/votes/next", dependencies=[require_feature("design_votes")])
def next_pair(db: DB, user: CurrentUser):
    pair = community.vote_pair(db, user)
    if pair is None:
        return None
    job, a, b = pair
    side = lambda o: {"id": str(o.id), "style_vi": _style_vi(db, o.style_key), "image_url": storage.presign_get(o.sketch_png_key)}  # noqa: E731
    return {"job_id": str(job.id), "a": side(a), "b": side(b)}


class VoteIn(BaseModel):
    job_id: uuid.UUID
    winner_id: uuid.UUID
    loser_id: uuid.UUID


@router.post("/votes", dependencies=[require_feature("design_votes")], status_code=status.HTTP_204_NO_CONTENT)
def vote(body: VoteIn, db: DB, user: CurrentUser):
    job = db.get(DesignJob, body.job_id)
    ids = {o.id for o in db.execute(select(DesignOption).where(DesignOption.job_id == body.job_id)).scalars()}
    if job is None or job.share_code is None or job.user_id == user.id or not {body.winner_id, body.loser_id} <= ids \
            or body.winner_id == body.loser_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cặp thiết kế không hợp lệ.")
    db.add(DesignVote(user_id=user.id, job_id=job.id, winner_id=body.winner_id, loser_id=body.loser_id))
    try:
        db.commit()
    except IntegrityError:  # đã chọn cặp này rồi
        db.rollback()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------- B7: bậc tay nghề ----------


@router.get("/me/skill", dependencies=[require_feature("skill_levels")])
def my_skill(db: DB, user: CurrentUser):
    return community.skill(db, user)


# ---------- B4: thử thách phôi hằng tháng ----------


def _state(c: Challenge, now: datetime) -> Literal["upcoming", "open", "closed"]:
    return "upcoming" if now < c.starts_at else "open" if now <= c.ends_at else "closed"


def _author(u: User | None) -> str:
    if u is None:
        return "Ẩn danh"
    if u.garden_name:
        return u.garden_name
    return (u.name or "Người chơi").split()[-1]


def _photo_url(db, c: Challenge) -> str | None:
    job = db.get(DesignJob, c.job_id)
    photo = db.get(TreePhoto, job.front_photo_id) if job and job.front_photo_id else None
    return storage.presign_get(photo.storage_key) if photo else None


def _challenge(db, challenge_id: uuid.UUID) -> Challenge:
    c = db.get(Challenge, challenge_id)
    if c is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy thử thách.")
    return c


def _summary(db, c: Challenge, now: datetime) -> dict:
    n = db.execute(select(func.count()).select_from(ChallengeEntry).where(ChallengeEntry.challenge_id == c.id)).scalar_one()
    return {"id": str(c.id), "title": c.title, "description": c.description, "prize": c.prize, "starts_at": c.starts_at.isoformat(),
            "ends_at": c.ends_at.isoformat(), "state": _state(c, now), "photo_url": _photo_url(db, c), "entries": n}


@router.get("/challenges", dependencies=[require_feature("challenges")])
def list_challenges(db: DB, user: CurrentUser):
    now = datetime.now(UTC)
    rows = db.execute(select(Challenge).where(Challenge.starts_at <= now).order_by(Challenge.ends_at.desc()).limit(24)).scalars()
    return [_summary(db, c, now) for c in rows]


@router.get("/challenges/{challenge_id}", dependencies=[require_feature("challenges")])
def challenge_detail(challenge_id: uuid.UUID, db: DB, user: CurrentUser):
    now = datetime.now(UTC)
    c = _challenge(db, challenge_id)
    state = _state(c, now)
    if state == "upcoming":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy thử thách.")
    entries = db.execute(select(ChallengeEntry).where(ChallengeEntry.challenge_id == c.id)).scalars().all()
    if state == "closed":
        entries.sort(key=lambda e: (-e.votes, e.created_at))
    else:  # đang mở: trộn ngẫu nhiên ổn định theo người xem, ẩn số phiếu (tránh bầu theo số đông)
        random.Random(f"{user.id}{c.id}").shuffle(entries)
    my_vote = db.execute(select(ChallengeVote.entry_id).where(ChallengeVote.challenge_id == c.id, ChallengeVote.user_id == user.id)).scalar_one_or_none()
    authors = {u.id: u for u in db.execute(select(User).where(User.id.in_({e.user_id for e in entries}))).scalars()} if entries else {}
    return {**_summary(db, c, now), "my_vote": my_vote,
            "entries": [{"id": e.id, "image_url": storage.presign_get(e.image_key), "author": _author(authors.get(e.user_id)),
                         "votes": e.votes if state == "closed" else None, "mine": e.user_id == user.id} for e in entries]}


@router.get("/challenges/{challenge_id}/studio", dependencies=[require_feature("challenges")], response_model=StudioOut)
def challenge_studio(challenge_id: uuid.UUID, db: DB, user: CurrentUser):
    c = _challenge(db, challenge_id)
    if _state(c, datetime.now(UTC)) != "open":
        raise HTTPException(status.HTTP_409_CONFLICT, "Thử thách không còn nhận bài.")
    mine = db.execute(select(ChallengeEntry).where(ChallengeEntry.challenge_id == c.id, ChallengeEntry.user_id == user.id)).scalar_one_or_none()
    return studio_payload(db, db.get(DesignJob, c.job_id), mine.design if mine else None)


@router.post("/challenges/{challenge_id}/entry", dependencies=[require_feature("challenges")])
def submit_entry(challenge_id: uuid.UUID, body: UserDesignIn, db: DB, user: CurrentUser):
    from bonsai_pipeline.studio_compose import compose

    c = _challenge(db, challenge_id)
    if _state(c, datetime.now(UTC)) != "open":
        raise HTTPException(status.HTTP_409_CONFLICT, "Thử thách không còn nhận bài.")
    if db.get(Style, body.style_key) is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Thế không hợp lệ.")
    job = db.get(DesignJob, c.job_id)
    photo = db.get(TreePhoto, job.front_photo_id)
    key = f"challenges/{c.id}/{user.id}.jpg"
    storage.put_bytes(key, compose(storage.get_bytes(photo.storage_key), Analysis.model_validate(job.analysis), body), "image/jpeg")
    entry = db.execute(select(ChallengeEntry).where(ChallengeEntry.challenge_id == c.id, ChallengeEntry.user_id == user.id)).scalar_one_or_none()
    if entry is None:
        entry = ChallengeEntry(challenge_id=c.id, user_id=user.id, design={}, image_key=key)
        db.add(entry)
    entry.design, entry.image_key = body.model_dump(mode="json"), key
    db.commit()
    return {"id": entry.id, "image_url": storage.presign_get(key)}


class ChallengeVoteIn(BaseModel):
    entry_id: int


@router.post("/challenges/{challenge_id}/vote", dependencies=[require_feature("challenges")], status_code=status.HTTP_204_NO_CONTENT)
def challenge_vote(challenge_id: uuid.UUID, body: ChallengeVoteIn, db: DB, user: CurrentUser):
    c = _challenge(db, challenge_id)
    if _state(c, datetime.now(UTC)) != "open":
        raise HTTPException(status.HTTP_409_CONFLICT, "Thử thách đã đóng bình chọn.")
    entry = db.get(ChallengeEntry, body.entry_id)
    if entry is None or entry.challenge_id != c.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy bài dự thi.")
    if entry.user_id == user.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Không tự bầu cho bài của mình.")
    old = db.execute(select(ChallengeVote).where(ChallengeVote.challenge_id == c.id, ChallengeVote.user_id == user.id)
                     .with_for_update()).scalar_one_or_none()
    if old is not None:  # đổi phiếu
        if old.entry_id == entry.id:
            return Response(status_code=status.HTTP_204_NO_CONTENT)
        prev = db.get(ChallengeEntry, old.entry_id)
        if prev is not None:
            prev.votes = max(0, prev.votes - 1)
        old.entry_id = entry.id
    else:
        db.add(ChallengeVote(challenge_id=c.id, entry_id=entry.id, user_id=user.id))
    entry.votes += 1
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------- quản trị thử thách ----------


class ChallengeIn(BaseModel):
    title: str = Field(min_length=3, max_length=160)
    description: str | None = Field(default=None, max_length=2000)
    job_id: uuid.UUID
    prize: str | None = Field(default=None, max_length=200)
    starts_at: datetime
    ends_at: datetime


@router.get("/admin/challenges")
def admin_list(db: DB, admin: Admin):
    now = datetime.now(UTC)
    return [{**_summary(db, c, now), "job_id": str(c.job_id)} for c in
            db.execute(select(Challenge).order_by(Challenge.starts_at.desc()).limit(100)).scalars()]


@router.post("/admin/challenges", status_code=status.HTTP_201_CREATED)
def admin_create(body: ChallengeIn, db: DB, admin: Admin):
    job = db.get(DesignJob, body.job_id)
    if job is None or not job.analysis or not job.targets or job.front_photo_id is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Phiên này chưa phân tích xong phôi.")
    owner = db.get(User, job.user_id)
    if owner is None or owner.role not in (UserRole.admin, UserRole.artisan):  # ảnh phôi sẽ công khai cho mọi người
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Dùng phôi do tài khoản quản trị / nghệ nhân tải lên.")
    if body.ends_at <= body.starts_at:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Ngày kết thúc phải sau ngày bắt đầu.")
    c = Challenge(**body.model_dump())
    db.add(c)
    db.flush()
    audit(db, admin, "challenge.create", "challenge", c.id, title=c.title)
    db.commit()
    return {"id": str(c.id)}


@router.delete("/admin/challenges/{challenge_id}", status_code=status.HTTP_204_NO_CONTENT)
def admin_delete(challenge_id: uuid.UUID, db: DB, admin: Admin):
    c = _challenge(db, challenge_id)
    audit(db, admin, "challenge.delete", "challenge", c.id, title=c.title)
    db.delete(c)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
