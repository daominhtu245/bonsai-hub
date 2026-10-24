"""Cấu hình đổi được lúc chạy (bảng app_settings). Worker đọc mỗi job; admin đổi qua /admin/settings.

- cost_mode: standard | economy — số ảnh, chất lượng ảnh, model chữ (bonsai_pipeline/cost_mode.py)
- analysis_mode: api | hybrid — hybrid: model riêng (YOLO-seg) trước, chưa tin được thì gọi P1
- design_mode: api | rules — rules: bộ thiết kế bằng luật (bonsai_pipeline/rule_designer.py) thay P2
"""

from sqlalchemy.orm import Session

from bonsai_pipeline.cost_mode import ADMIN_MODES, DEFAULT_MODE

from ..db.models import AppSetting

SETTINGS: dict[str, tuple[tuple[str, ...], str]] = {
    "cost_mode": (ADMIN_MODES, DEFAULT_MODE),
    "analysis_mode": (("api", "hybrid"), "hybrid"),  # chưa có trọng số YOLO → hybrid tự gọi P1
    "design_mode": (("api", "rules"), "api"),  # bộ luật cần nghệ nhân duyệt (Cổng 1) trước khi làm mặc định
}
COST_MODE = "cost_mode"


def get_setting(db: Session, key: str) -> str:
    allowed, default = SETTINGS[key]
    row = db.get(AppSetting, key)
    value = (row.value or {}).get("mode") if row else None
    return value if value in allowed else default


def set_setting(db: Session, key: str, value: str, *, by: str | None) -> str:
    allowed, _ = SETTINGS[key]
    if value not in allowed:
        raise ValueError(f"unknown {key}: {value}")
    row = db.get(AppSetting, key)
    if row is None:
        db.add(AppSetting(key=key, value={"mode": value}, updated_by=by))
    else:
        row.value, row.updated_by = {"mode": value}, by
    db.commit()
    return value


def get_all(db: Session) -> dict[str, str]:
    return {k: get_setting(db, k) for k in SETTINGS}


def get_cost_mode(db: Session) -> str:
    return get_setting(db, COST_MODE)


def set_cost_mode(db: Session, mode: str, *, by: str | None) -> str:
    return set_setting(db, COST_MODE, mode, by=by)


SEG_MODEL_KEY = "bonsai:worker:seg_model"  # worker ghi khi khởi động / mỗi phiên A (bonsai_worker.celery_app)


def seg_model_ready() -> bool:
    """Worker có trọng số YOLO-seg không (khóa API không xem được file của worker nên đọc qua Redis)."""
    import redis

    from ..settings import get_settings

    try:
        r = redis.Redis.from_url(get_settings().redis_url, socket_timeout=0.5, socket_connect_timeout=0.5)
        return r.get(SEG_MODEL_KEY) == b"1"
    except redis.RedisError:
        return False
