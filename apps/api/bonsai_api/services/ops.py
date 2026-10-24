"""Cấu hình vận hành đổi được lúc chạy (admin → Cấu hình vận hành), lưu ở app_settings.

- "ops": lượt tặng khi đăng ký, giới hạn phân tích/ngày, tỉ giá, tạm dừng phân tích / tạo ảnh, thông báo chung.
- "packages": giá, số lượt, bật/tắt từng gói (mã gói cố định: le, player, nursery).
Giá trị mặc định lấy từ biến môi trường (settings.py) và PACKAGES trong services/payments.py.
"""

from dataclasses import replace

from sqlalchemy.orm import Session

from ..db.models import AppSetting
from ..settings import get_settings
from .payments import PACKAGES, Package

OPS_KEY = "ops"
PACKAGES_KEY = "packages"


def ops_defaults() -> dict:
    s = get_settings()
    return {
        "trial_credits": s.trial_credits,
        "phase_a_daily_limit": s.phase_a_daily_limit,
        "usd_vnd_rate": s.usd_vnd_rate,
        "pause_analysis": False,
        "pause_render": False,
        "pause_message": "Hệ thống đang bảo trì, bạn quay lại sau ít phút nhé.",
        "announcement": {"active": False, "text": "", "tone": "info"},
        "referral_credits": 1,  # giới thiệu bạn: mỗi bên được tặng
        "diary_reward_credits": 1,  # nhật ký đúng mốc 1 / 3 / 6 tháng
        "consult_credits": 2,  # hỏi nghệ nhân
        "nursery_listing_free": 3,  # nhà vườn chưa có gói: số tin đăng miễn phí
    }


def _row(db: Session, key: str) -> AppSetting | None:
    return db.get(AppSetting, key)


def get_ops(db: Session) -> dict:
    out = ops_defaults()
    row = _row(db, OPS_KEY)
    if row and isinstance(row.value, dict):
        for k, v in row.value.items():
            if k in out:
                out[k] = {**out[k], **v} if isinstance(out[k], dict) and isinstance(v, dict) else v
    return out


def set_ops(db: Session, patch: dict, *, by: str | None) -> dict:
    current = get_ops(db)
    merged = {**current, **{k: v for k, v in patch.items() if k in current}}
    row = _row(db, OPS_KEY)
    if row is None:
        db.add(AppSetting(key=OPS_KEY, value=merged, updated_by=by))
    else:
        row.value, row.updated_by = merged, by
    return merged


def get_packages(db: Session, *, include_inactive: bool = False) -> list[Package]:
    """Gói bán hiện hành: mặc định trong code + phần admin đã sửa (giá, số lượt, mô tả, bật/tắt)."""
    row = _row(db, PACKAGES_KEY)
    overrides = row.value if row and isinstance(row.value, dict) else {}
    out = []
    for p in PACKAGES:
        o = overrides.get(p.code) or {}
        pkg = replace(p, **{k: o[k] for k in ("name_vi", "credits", "amount_vnd", "note_vi", "popular") if k in o})
        if include_inactive or o.get("active", True):
            out.append(pkg)
    return out


def package_active(db: Session, code: str) -> bool:
    row = _row(db, PACKAGES_KEY)
    overrides = row.value if row and isinstance(row.value, dict) else {}
    return bool((overrides.get(code) or {}).get("active", True))


def set_packages(db: Session, patch: dict[str, dict], *, by: str | None) -> None:
    row = _row(db, PACKAGES_KEY)
    current = dict(row.value) if row and isinstance(row.value, dict) else {}
    for code, fields in patch.items():
        current[code] = {**current.get(code, {}), **fields}
    if row is None:
        db.add(AppSetting(key=PACKAGES_KEY, value=current, updated_by=by))
    else:
        row.value, row.updated_by = current, by


def package_by_code(db: Session, code: str) -> Package | None:
    return next((p for p in get_packages(db, include_inactive=True) if p.code == code), None)
