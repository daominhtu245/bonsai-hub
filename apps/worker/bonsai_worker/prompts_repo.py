"""Đọc prompt đang active từ bảng `prompt_versions` (không hardcode trong code)."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from bonsai_api.db.models import PromptVersion
from bonsai_pipeline.phase_a import PromptTemplate


class PromptNotFound(LookupError):
    pass


def load_active_prompt(db: Session, step_code: str) -> PromptTemplate:
    row = db.execute(
        select(PromptVersion).where(PromptVersion.step_code == step_code, PromptVersion.active)
    ).scalar_one_or_none()
    if row is None:
        raise PromptNotFound(f"no active prompt for {step_code}; run the seed script")
    return PromptTemplate(row.step_code, row.version, row.template.get("system"), row.template["user"])
