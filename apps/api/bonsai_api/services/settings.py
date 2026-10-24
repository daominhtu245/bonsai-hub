"""Cấu hình đổi được lúc chạy (bảng app_settings). Worker đọc mỗi job; admin đổi qua /admin/settings."""

from sqlalchemy.orm import Session

from bonsai_pipeline.cost_mode import ADMIN_MODES, DEFAULT_MODE

from ..db.models import AppSetting

COST_MODE = "cost_mode"


def get_cost_mode(db: Session) -> str:
    row = db.get(AppSetting, COST_MODE)
    mode = (row.value or {}).get("mode") if row else None
    return mode if mode in ADMIN_MODES else DEFAULT_MODE


def set_cost_mode(db: Session, mode: str, *, by: str | None) -> str:
    if mode not in ADMIN_MODES:
        raise ValueError(f"unknown cost mode: {mode}")
    row = db.get(AppSetting, COST_MODE)
    if row is None:
        row = AppSetting(key=COST_MODE, value={"mode": mode}, updated_by=by)
        db.add(row)
    else:
        row.value, row.updated_by = {"mode": mode}, by
    db.commit()
    return mode
