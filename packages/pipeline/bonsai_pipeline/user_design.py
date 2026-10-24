"""Thiết kế do người dùng tự ghép (màn Tự thiết kế): từ lựa chọn trên ảnh (cành giữ/cắt, cành mới, tầng lá, ngọn,
chậu) → DesignOption cùng schema P2, để bản vẽ và phiên B dùng chung luồng với phương án AI.

Gợi ý theo luật bonsai (`hints`) chỉ để tham khảo — người dùng là người quyết định, không chặn.
"""

from __future__ import annotations

import math
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from .rule_engine import BAR_BRANCH_RATIO_GAP, Targets
from .schemas import (
    Analysis, Apex, DesignOption, KeepBranch, NewBranch, Pad, Point, Pot, RemoveBranch, Silhouette,
)

MAX_PADS = 12
MAX_NEW = 6


class UserNewBranch(BaseModel):
    model_config = ConfigDict(extra="ignore")
    at_px: Point
    direction: Literal["left", "right", "up"]


class Accent(BaseModel):
    model_config = ConfigDict(extra="ignore")
    kind: Literal["moss", "rock"]
    center_px: Point
    width: float = Field(gt=0)
    flip: bool = False


class UserDesignIn(BaseModel):
    model_config = ConfigDict(extra="ignore")

    style_key: str
    removed: list[str] = []  # mã cành người dùng chọn cắt; cành còn lại = giữ
    new_branches: list[UserNewBranch] = Field(default=[], max_length=MAX_NEW)
    pads: list[Pad] = Field(default=[], max_length=MAX_PADS)
    apex: Point | None = None
    pot: Pot = Pot(shape="oval", color="unglazed_brown", position="center")
    pot_kind: str | None = None  # ảnh chậu trong thư viện
    pot_width: float | None = Field(default=None, gt=0)
    pot_x: float | None = None  # tâm chậu theo chiều ngang (px ảnh); gốc cây ở mặt đất của chậu
    accents: list[Accent] = Field(default=[], max_length=6)


def _clamp(p: list[float], w: int, h: int) -> list[float]:
    return [round(min(max(p[0], 0), w), 1), round(min(max(p[1], 0), h), 1)]


def build_user_option(analysis: Analysis, targets: Targets, d: UserDesignIn) -> DesignOption:
    t = analysis.trunk
    assert t is not None
    w, h = targets.image_width, targets.image_height
    known = {b.id: b for b in analysis.branches}
    removed = [i for i in dict.fromkeys(d.removed) if i in known]
    kept = sorted((b for b in analysis.branches if b.id not in removed), key=lambda b: b.height_ratio)

    lo, hi = targets.first_branch_height_ratio
    keep: list[KeepBranch] = []
    first_done = False
    for b in kept:
        r = (t.base_point_px[1] - b.start_px[1]) / max(1, targets.target_height_px)
        if not first_done and b.direction in ("left", "right") and lo - 0.12 <= r <= hi + 0.12:
            role, first_done = "first_branch", True
        elif b.direction == "back":
            role = "back_branch"
        elif b.direction == "up" and b.height_ratio > 0.75:
            role = "apex"
        else:
            role = "other"
        keep.append(KeepBranch(id=b.id, role=role))

    pads = [Pad(center_px=_clamp(p.center_px, w, h), rx=min(p.rx, w), ry=min(p.ry, h), rotation=p.rotation % 360,
                kind=p.kind, flip=p.flip) for p in d.pads]
    if pads:
        xs = [p.center_px[0] + s * p.rx for p in pads for s in (-1, 1)]
        ys = [p.center_px[1] + s * p.ry for p in pads for s in (-1, 1)]
        sil = Silhouette(width_px=max(1, round(max(xs) - min(xs))), height_px=max(1, round(max(ys) - min(ys))), pads=len(pads))
    else:
        sil = Silhouette(width_px=max(1, round(targets.target_height_px * 0.9)), height_px=max(1, round(targets.target_height_px * 0.8)), pads=1)
    apex_pt = _clamp(d.apex or list(targets.candidate_apex_px), w, h)
    lean = "slightly_left" if apex_pt[0] < t.base_point_px[0] - w * 0.02 else "slightly_right" if apex_pt[0] > t.base_point_px[0] + w * 0.02 else "forward"
    new = [NewBranch(at_px=_clamp(n.at_px, w, h), direction=n.direction, note_vi="Cành mới bạn muốn nuôi") for n in d.new_branches]
    care = []
    if removed:
        care.append(f"Bước 1: Cắt bỏ {len(removed)} cành bạn đánh dấu đỏ")
    care.append("Uốn dây các cành giữ lại theo các tầng lá trên bản vẽ")
    if new:
        care.append(f"Nuôi {len(new)} cành mới ở vị trí đánh dấu vàng")
    return DesignOption(
        style_key=d.style_key, suitability=0.0, why_vi="Thiết kế của bạn", front="Mặt tiền hiện tại",
        apex=Apex(point_px=apex_pt, lean=lean), keep_branches=keep,
        remove_branches=[RemoveBranch(id=i, reason_vi="Bạn chọn cắt") for i in removed],
        new_branches_needed=new, silhouette=sil, pot=d.pot, care_steps_vi=care, source="user", pads_layout=pads,
        accents=list(dict.fromkeys(a.kind for a in d.accents)),
    )


def _overlap(a: Pad, b: Pad) -> bool:
    dx, dy = abs(a.center_px[0] - b.center_px[0]), abs(a.center_px[1] - b.center_px[1])
    return dx < (a.rx + b.rx) * 0.7 and dy < (a.ry + b.ry) * 0.6


def hints(analysis: Analysis, targets: Targets, option: DesignOption) -> list[str]:
    """Gợi ý ngắn (tiếng Việt) theo luật tạo dáng — để người dùng cân nhắc, không bắt buộc."""
    t = analysis.trunk
    assert t is not None
    out: list[str] = []
    pads = option.pads_layout
    if not pads:
        out.append("Chưa có tầng lá nào — kéo “Tầng lá” vào ảnh.")
    branches = {b.id: b for b in analysis.branches}
    kept = [branches[k.id] for k in option.keep_branches if k.id in branches]
    for i, a in enumerate(kept):
        for b in kept[i + 1:]:
            if {a.direction, b.direction} == {"left", "right"} and abs(a.height_ratio - b.height_ratio) < BAR_BRANCH_RATIO_GAP:
                out.append(f"Cành {a.id} và {b.id} mọc ngang nhau hai bên — thường nên cắt bớt một cành.")
    for i, a in enumerate(pads):
        for j in range(i + 1, len(pads)):
            if _overlap(a, pads[j]):
                out.append(f"Tầng lá {chr(65 + i)} và {chr(65 + j)} chồng lên nhau — nên chừa khoảng trống giữa các tầng.")
    base_y = t.base_point_px[1]
    height = max(1, targets.target_height_px)
    if pads:
        lowest = max(p.center_px[1] for p in pads)
        if (base_y - lowest) / height < 0.15:
            out.append("Tầng lá thấp nhất sát gốc quá — thường bắt đầu từ khoảng 1/3 chiều cao cây.")
        top = min(p.center_px[1] - p.ry for p in pads)
        if option.apex.point_px[1] > top + 2:
            out.append("Ngọn đang thấp hơn tầng lá trên cùng — kéo điểm ngọn lên cao hơn.")
        widths = [p.rx for p in sorted(pads, key=lambda p: -p.center_px[1])]
        if len(widths) >= 3 and any(widths[k + 1] > widths[k] * 1.3 for k in range(len(widths) - 1)):
            out.append("Tầng lá phía trên to hơn tầng dưới — dáng đẹp thường nhỏ dần lên ngọn.")
    if math.isfinite(base_y) and option.apex.point_px[1] > base_y:
        out.append("Điểm ngọn đang nằm dưới gốc cây.")
    return list(dict.fromkeys(out))[:6]
