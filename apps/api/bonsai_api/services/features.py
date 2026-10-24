"""Bật / tắt từng tính năng cho người dùng (admin → Tính năng). Lưu ở app_settings["features"].

Mỗi tính năng: on (mọi người) | staff (chỉ nội bộ: quản trị, nghệ nhân, email trong danh sách người thử) | off.
Api chặn bằng `require_feature(...)`; web đọc GET /features để ẩn mục, nút, trang.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..db.models import AppSetting, User, UserRole
from ..db.session import get_db
from ..security import get_optional_user

State = Literal["on", "staff", "off"]
KEY = "features"


@dataclass(frozen=True)
class Feature:
    key: str
    label_vi: str
    group_vi: str


FEATURES: list[Feature] = [
    Feature("art_styles", "Xem kiểu tranh (bút chì, thủy mặc)", "Màn Kết quả"),
    Feature("timelapse", "Video tua nhanh", "Màn Kết quả"),
    Feature("tech_drawing", "Bản vẽ kỹ thuật", "Màn Kết quả"),
    Feature("worksheet", "Phiếu tập vẽ", "Màn Kết quả"),
    Feature("room_place", "Đặt vào phòng / xem qua camera", "Màn Kết quả"),
    Feature("tree_tools", "Công cụ cho cây (dây uốn, ghép cành, định giá)", "Màn Kết quả"),
    Feature("read_aloud", "Đọc to hướng dẫn", "Màn Kết quả"),
    Feature("diary_rewards", "Mốc nhật ký có thưởng", "Nhật ký cây"),
    Feature("reality", "Dự đoán và thực tế", "Nhật ký cây"),
    Feature("passport", "Sổ cây (QR, chuyển chủ, báo mất)", "Nhật ký cây"),
    Feature("assistant", "Hỏi cách chăm (giọng nói)", "Tiện ích chăm cây"),
    Feature("health_check", "Lá có bệnh? (đoán sâu bệnh)", "Tiện ích chăm cây"),
    Feature("weather", "Thời tiết & thông báo", "Tiện ích chăm cây"),
    Feature("mai_tet", "Mai kịp Tết", "Tiện ích chăm cây"),
    Feature("rescue", "Cấp cứu cây", "Tiện ích chăm cây"),
    Feature("menh", "Cây hợp mệnh", "Tiện ích chăm cây"),
    Feature("market", "Chợ phôi (tin đăng, thẻ QR)", "Mua bán"),
    Feature("price_index", "Giá thị trường", "Mua bán"),
    Feature("partner_pots", "Chậu hợp dáng (đối tác)", "Mua bán"),
    Feature("consults", "Hỏi nghệ nhân (trả lượt)", "Nghệ nhân & dịch vụ"),
    Feature("public_profiles", "Trang công khai nhà vườn / nghệ nhân", "Nghệ nhân & dịch vụ"),
    Feature("care", "Chăm hộ / nuôi hộ", "Nghệ nhân & dịch vụ"),
    Feature("challenges", "Thử thách phôi", "Cộng đồng"),
    Feature("design_votes", "Chọn dáng đẹp", "Cộng đồng"),
    Feature("skill_levels", "Bậc tay nghề", "Cộng đồng"),
    Feature("referral", "Giới thiệu bạn (tặng lượt)", "Cộng đồng"),
]
BY_KEY = {f.key: f for f in FEATURES}
STATES: tuple[State, ...] = ("on", "staff", "off")


def load(db: Session) -> dict:
    row = db.get(AppSetting, KEY)
    v = row.value if row and isinstance(row.value, dict) else {}
    flags = {k: s for k, s in (v.get("flags") or {}).items() if k in BY_KEY and s in STATES}
    return {"flags": {f.key: flags.get(f.key, "on") for f in FEATURES}, "testers": list(v.get("testers") or [])}


def save(db: Session, flags: dict[str, State] | None, testers: list[str] | None, *, by: str | None) -> dict:
    cur = load(db)
    if flags:
        cur["flags"].update({k: s for k, s in flags.items() if k in BY_KEY and s in STATES})
    if testers is not None:
        cur["testers"] = sorted({t.strip().lower() for t in testers if t.strip()})
    row = db.get(AppSetting, KEY)
    if row is None:
        db.add(AppSetting(key=KEY, value=cur, updated_by=by))
    else:
        row.value, row.updated_by = cur, by
    return cur


def is_staff(user: User | None, testers: list[str]) -> bool:
    if user is None:
        return False
    return user.role in (UserRole.admin, UserRole.artisan) or (user.email or "").lower() in testers


def enabled(db: Session, key: str, user: User | None) -> bool:
    cfg = load(db)
    state = cfg["flags"].get(key, "on")
    return state == "on" or (state == "staff" and is_staff(user, cfg["testers"]))


def effective(db: Session, user: User | None) -> dict[str, bool]:
    cfg = load(db)
    staff = is_staff(user, cfg["testers"])
    return {k: s == "on" or (s == "staff" and staff) for k, s in cfg["flags"].items()}


def require_feature(*keys: str):
    """Dependency: chặn khi mọi tính năng trong `keys` đều đóng với người gọi (một cái mở là cho qua)."""

    def dep(db: Session = Depends(get_db), user: User | None = Depends(get_optional_user)) -> None:
        if not any(enabled(db, k, user) for k in keys):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Tính năng này đang tạm đóng.")

    return Depends(dep)
