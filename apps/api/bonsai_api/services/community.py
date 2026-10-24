"""Giữ chân và cộng đồng (docs/ideas.md B2, B3, B6, B7): mốc nhật ký có thưởng, so dự đoán với thực tế, quẹt chọn dáng,
bậc tay nghề. Chỉ dùng dữ liệu sẵn có, không gọi AI."""

from __future__ import annotations

import random
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db.models import (
    ChallengeEntry, CreditLedger, CreditReason, DesignJob, DesignOption, DesignVote, JobStatus, PhotoSource, Tree, TreePhoto, User,
)
from .credits import apply_credit
from .ops import get_ops

# ---------- B2: nhật ký đúng mốc ----------

MILESTONE_MONTHS = (1, 3, 6)
EARLY, LATE = timedelta(days=7), timedelta(days=21)  # chụp sớm 1 tuần / muộn 3 tuần vẫn tính


@dataclass
class Milestone:
    month: int
    due: datetime
    open_from: datetime
    open_to: datetime
    rewarded: bool
    photo_taken: bool


def roadmap_start(db: Session, tree: Tree) -> datetime | None:
    """Mốc 0 = lúc lộ trình đầu tiên của cây làm xong."""
    return db.execute(select(func.min(func.coalesce(DesignJob.finished_at, DesignJob.created_at))).where(
        DesignJob.tree_id == tree.id, DesignJob.status == JobStatus.done)).scalar_one_or_none()


def _ref(tree: Tree, month: int) -> str:
    return f"diary:{tree.id}:{month}"


def milestones(db: Session, tree: Tree) -> list[Milestone]:
    start = roadmap_start(db, tree)
    if start is None:
        return []
    photos = [p for (p,) in db.execute(select(TreePhoto.taken_at).where(
        TreePhoto.tree_id == tree.id, TreePhoto.source == PhotoSource.progress)).all() if p]
    paid = {r for (r,) in db.execute(select(CreditLedger.ref_id).where(
        CreditLedger.user_id == tree.user_id, CreditLedger.reason == CreditReason.reward,
        CreditLedger.ref_id.like(f"diary:{tree.id}:%"))).all()}
    out = []
    for m in MILESTONE_MONTHS:
        due = start + timedelta(days=30 * m)
        lo, hi = due - EARLY, due + LATE
        out.append(Milestone(m, due, lo, hi, _ref(tree, m) in paid, any(lo <= p <= hi for p in photos)))
    return out


def diary_reward(db: Session, tree: Tree, taken_at: datetime) -> int:
    """Ảnh nhật ký chụp trong cửa sổ một mốc chưa thưởng → tặng lượt (một lần mỗi mốc). Không commit."""
    credits = int(get_ops(db).get("diary_reward_credits") or 0)
    if credits <= 0:
        return 0
    for ms in milestones(db, tree):
        if not ms.rewarded and ms.open_from <= taken_at <= ms.open_to:
            return credits if apply_credit(db, tree.user_id, credits, CreditReason.reward, _ref(tree, ms.month)) else 0
    return 0


# ---------- B3: dự đoán và thực tế ----------


def expected_stage(job: DesignJob, months: float) -> str:
    """Giai đoạn đáng lẽ đang ở sau `months` tháng, theo số năm của lộ trình (chia đều S1–S4)."""
    years = float(((job.progress or {}).get("result") or {}).get("years") or 4)
    k = months / (years * 12)
    return "S1" if k < 0.25 else "S2" if k < 0.5 else "S3" if k < 0.85 else "S4"


# ---------- B6: quẹt chọn dáng ----------


def vote_pair(db: Session, user: User, rng: random.Random | None = None) -> tuple[DesignJob, DesignOption, DesignOption] | None:
    """Hai phương án AI của cùng một phôi mà chủ đã chia sẻ công khai (có link), người này chưa bình chọn cặp đó."""
    rng = rng or random.Random()
    voted = {(w, lo) for w, lo in db.execute(select(DesignVote.winner_id, DesignVote.loser_id).where(DesignVote.user_id == user.id)).all()}
    jobs = db.execute(select(DesignJob).where(DesignJob.share_code.is_not(None), DesignJob.user_id != user.id)
                      .order_by(func.random()).limit(30)).scalars().all()
    for job in jobs:
        opts = [o for o in db.execute(select(DesignOption).where(DesignOption.job_id == job.id, DesignOption.sketch_png_key.is_not(None))
                                      .order_by(DesignOption.rank)).scalars() if (o.design or {}).get("source", "ai") == "ai"]
        pairs = [(a, b) for i, a in enumerate(opts) for b in opts[i + 1:]
                 if (a.id, b.id) not in voted and (b.id, a.id) not in voted]
        if pairs:
            a, b = rng.choice(pairs)
            return (job, a, b) if rng.random() < 0.5 else (job, b, a)
    return None


def option_win_rates(db: Session, job_id: uuid.UUID) -> dict[uuid.UUID, tuple[int, int]]:
    """{phương án: (thắng, tổng lượt)} — dữ liệu thẩm mỹ để sau huấn luyện model chấm dáng."""
    out: dict[uuid.UUID, list[int]] = {}
    for w, lo in db.execute(select(DesignVote.winner_id, DesignVote.loser_id).where(DesignVote.job_id == job_id)).all():
        out.setdefault(w, [0, 0])
        out.setdefault(lo, [0, 0])
        out[w][0] += 1
        out[w][1] += 1
        out[lo][1] += 1
    return {k: (v[0], v[1]) for k, v in out.items()}


# ---------- B7: bậc tay nghề ----------

LEVELS = [
    ("hoc_tro", "Học trò", {}),
    ("tho", "Thợ", {"designs": 3, "diary": 5, "votes": 20}),
    ("nghe_nhan", "Nghệ nhân", {"designs": 10, "diary": 20, "diary_months": 6, "votes": 100, "challenge_votes": 5}),
]
METRIC_VI = {"designs": "Bản thiết kế đã tạo ảnh", "diary": "Ảnh nhật ký cây", "diary_months": "Số tháng có ghi nhật ký",
             "votes": "Lượt chọn dáng", "challenge_votes": "Phiếu bầu nhận ở thử thách"}


def skill_metrics(db: Session, user: User) -> dict[str, int]:
    tree_ids = select(Tree.id).where(Tree.user_id == user.id)
    diary = db.execute(select(TreePhoto.taken_at).where(TreePhoto.tree_id.in_(tree_ids), TreePhoto.source == PhotoSource.progress)).all()
    months = {(t.year, t.month) for (t,) in diary if t}
    return {
        "designs": db.execute(select(func.count()).select_from(DesignJob).where(
            DesignJob.user_id == user.id, DesignJob.status == JobStatus.done)).scalar_one(),
        "diary": len(diary),
        "diary_months": len(months),
        "votes": db.execute(select(func.count()).select_from(DesignVote).where(DesignVote.user_id == user.id)).scalar_one(),
        "challenge_votes": int(db.execute(select(func.coalesce(func.max(ChallengeEntry.votes), 0)).where(
            ChallengeEntry.user_id == user.id)).scalar_one()),
    }


def skill(db: Session, user: User) -> dict:
    m = skill_metrics(db, user)
    level = 0
    for i, (_, _, need) in enumerate(LEVELS):
        if all(m.get(k, 0) >= v for k, v in need.items()):
            level = i
        else:
            break
    nxt = LEVELS[level + 1] if level + 1 < len(LEVELS) else None
    return {
        "level": LEVELS[level][0], "level_vi": LEVELS[level][1],
        "next_vi": nxt[1] if nxt else None,
        "progress": [{"key": k, "label_vi": METRIC_VI[k], "have": m.get(k, 0), "need": v} for k, v in (nxt[2] if nxt else {}).items()],
    }
