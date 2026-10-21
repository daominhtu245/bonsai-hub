from sqlalchemy import func, select

from bonsai_api.db.models import PromptVersion
from bonsai_api.scripts.seed import default_prompts_dir, seed_prompts


def test_seed_is_idempotent_and_one_active_per_step(db):
    assert seed_prompts(db, default_prompts_dir()) == []
    rows = db.execute(select(PromptVersion.step_code, func.count()).where(PromptVersion.active)
                      .group_by(PromptVersion.step_code)).all()
    assert rows and all(n == 1 for _, n in rows)
    p1 = db.execute(select(PromptVersion).where(PromptVersion.step_code == "P1")).scalar_one()
    assert "{{species_or_unknown}}" in p1.template["user"] and p1.template["system"]
