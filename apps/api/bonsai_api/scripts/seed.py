"""Seed prompt_versions từ packages/prompts/ và từ điển loài/thế. Chạy lại an toàn (idempotent).

    python -m bonsai_api.scripts.seed [--prompts-dir PATH]

Prompt đã có (cùng step_code + version) không bị ghi đè: muốn sửa prompt thì tạo version mới.
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path

import yaml
from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from bonsai_pipeline.dictionaries import SPECIES, STYLES

from ..db.models import PromptVersion, Species, Style
from ..db.session import get_sessionmaker


def default_prompts_dir() -> Path:
    if env := os.environ.get("PROMPTS_DIR"):
        return Path(env)
    return Path(__file__).resolve().parents[4] / "packages" / "prompts"


def seed_dictionaries(db: Session) -> None:
    for row in SPECIES:
        stmt = insert(Species).values(**row, ref_image_keys=[])
        db.execute(stmt.on_conflict_do_update(
            index_elements=["key"],
            set_={k: stmt.excluded[k] for k in ("name_vi", "prompt_desc_en", "growth_speed")},
        ))
    for row in STYLES:
        stmt = insert(Style).values(**row, ref_image_keys=[])
        db.execute(stmt.on_conflict_do_update(
            index_elements=["key"],
            set_={k: stmt.excluded[k] for k in ("name_vi", "name_jp", "prompt_desc_en")},
        ))


def seed_prompts(db: Session, prompts_dir: Path) -> list[str]:
    added = []
    for path in sorted(prompts_dir.glob("*.yaml")):
        doc = yaml.safe_load(path.read_text(encoding="utf-8"))
        exists = db.execute(
            select(PromptVersion.id).where(
                PromptVersion.step_code == doc["step_code"], PromptVersion.version == doc["version"]
            )
        ).first()
        if exists:
            continue
        active = bool(doc.get("active"))
        if active:
            db.execute(
                update(PromptVersion).where(PromptVersion.step_code == doc["step_code"]).values(active=False)
            )
        db.add(PromptVersion(
            step_code=doc["step_code"],
            version=doc["version"],
            kind=doc.get("kind", "llm"),
            template={"system": doc.get("system"), "user": doc["user"]},
            description=doc.get("description"),
            active=active,
        ))
        db.flush()
        added.append(f"{doc['step_code']}.{doc['version']}")
    return added


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--prompts-dir", type=Path, default=default_prompts_dir())
    args = parser.parse_args()
    with get_sessionmaker()() as db:
        seed_dictionaries(db)
        added = seed_prompts(db, args.prompts_dir)
        db.commit()
    print(f"seeded species={len(SPECIES)} styles={len(STYLES)} prompts_added={added or 'none'}")


if __name__ == "__main__":
    main()
