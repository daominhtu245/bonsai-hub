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


def test_seed_updates_unused_and_protects_used(db, tmp_path, monkeypatch):
    import yaml

    from bonsai_api.db.models import PipelineStep
    from bonsai_api.settings import get_settings

    src = default_prompts_dir() / "P5.v1.yaml"
    doc = yaml.safe_load(src.read_text())
    doc["user"] = doc["user"] + "\nThêm một dòng."
    (tmp_path / "P5.v1.yaml").write_text(yaml.safe_dump(doc, allow_unicode=True))

    monkeypatch.setattr(get_settings(), "app_env", "prod")
    db.add(PipelineStep(step_code="P5", provider="x", model="m", prompt_version="P5.v1", ok=True))
    db.flush()
    warnings = []
    assert seed_prompts(db, tmp_path, warnings=warnings) == [] and "đã dùng 1 lần" in warnings[0]

    db.rollback()  # bỏ dòng pipeline_steps → phiên bản chưa dùng
    assert seed_prompts(db, tmp_path) == ["P5.v1 (updated)"]
    row = db.execute(select(PromptVersion).where(PromptVersion.step_code == "P5")).scalar_one()
    assert row.template["user"].endswith("Thêm một dòng.")
    db.rollback()
