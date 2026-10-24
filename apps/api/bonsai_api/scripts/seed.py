"""Seed prompt_versions từ packages/prompts/ và từ điển loài/thế. Chạy lại an toàn (idempotent).

    python -m bonsai_api.scripts.seed [--prompts-dir PATH]

Prompt đã có (cùng step_code + version) mà nội dung file khác DB:
- phiên bản chưa từng được dùng (không có dòng pipeline_steps nào) hoặc APP_ENV=dev → cập nhật theo file;
- đã dùng ở staging/prod → giữ nguyên DB và cảnh báo: hãy tạo phiên bản mới (vN+1) để kết quả cũ truy được đúng prompt.
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path

import yaml
from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from bonsai_pipeline.dictionaries import SPECIES, STYLES

from ..db.models import PipelineStep, PromptVersion, RuleDoc, Species, Style
from ..db.session import get_sessionmaker
from ..settings import get_settings


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
            where=Species.admin_edited_at.is_(None),  # admin đã sửa ở /admin → Danh mục: giữ bản của admin
        ))
    for row in STYLES:
        stmt = insert(Style).values(**row, ref_image_keys=[])
        db.execute(stmt.on_conflict_do_update(
            index_elements=["key"],
            set_={k: stmt.excluded[k] for k in ("name_vi", "name_jp", "prompt_desc_en")},
            where=Style.admin_edited_at.is_(None),
        ))


SEED_AUTHOR = "seed"


def seed_rules(db: Session) -> list[str]:
    """Bộ luật từ rules/*.yaml vào bảng rule_docs (có phiên bản).

    Chưa có → bản 1, áp dụng ngay. File đổi so với bản seed gần nhất → thêm bản mới; chỉ tự áp dụng khi bản đang
    dùng cũng là bản seed (nghệ nhân đã chỉnh thì giữ bản của nghệ nhân, bản seed mới để họ so sánh / chọn).
    """
    from bonsai_pipeline.dictionaries import RULE_DOCS, default_rule_doc

    added = []
    for name in RULE_DOCS:
        content = default_rule_doc(name)
        rows = db.execute(select(RuleDoc).where(RuleDoc.doc == name).order_by(RuleDoc.version)).scalars().all()
        last_seed = next((r for r in reversed(rows) if r.created_by == SEED_AUTHOR), None)
        if last_seed is not None and last_seed.content == content:
            continue
        active = next((r for r in rows if r.active), None)
        take_over = active is None or active.created_by == SEED_AUTHOR
        if take_over and active is not None:
            active.active = False
            db.flush()
        db.add(RuleDoc(doc=name, version=(rows[-1].version + 1) if rows else 1, content=content, active=take_over,
                       note="Từ file rules/" + RULE_DOCS[name]["file"], created_by=SEED_AUTHOR,
                       activated_by=SEED_AUTHOR if take_over else None, activated_at=func.now() if take_over else None))
        db.flush()
        added.append(f"{name}{'' if take_over else ' (chưa áp dụng — đang dùng bản nghệ nhân)'}")
    return added


def seed_prompts(db: Session, prompts_dir: Path, *, warnings: list[str] | None = None) -> list[str]:
    """Trả danh sách phiên bản đã thêm/cập nhật. Cảnh báo (phiên bản đã dùng bị sửa file) ghi vào `warnings`."""
    added = []
    allow_update_used = get_settings().is_dev
    for path in sorted(prompts_dir.glob("*.yaml")):
        doc = yaml.safe_load(path.read_text(encoding="utf-8"))
        tag = f"{doc['step_code']}.{doc['version']}"
        template = {"system": doc.get("system"), "user": doc["user"]}
        existing = db.execute(
            select(PromptVersion).where(PromptVersion.step_code == doc["step_code"], PromptVersion.version == doc["version"])
        ).scalar_one_or_none()
        if existing is not None:
            if existing.template == template:
                continue
            used = db.execute(select(func.count()).select_from(PipelineStep).where(PipelineStep.prompt_version == tag)).scalar_one()
            if used and not allow_update_used:
                msg = f"{tag}: file khác DB nhưng đã dùng {used} lần — giữ DB; hãy tạo {doc['step_code']}.v<N+1>"
                if warnings is not None:
                    warnings.append(msg)
                continue
            existing.template = template
            existing.description = doc.get("description")
            db.flush()
            added.append(f"{tag} (updated)")
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
            template=template,
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
        warnings: list[str] = []
        added = seed_prompts(db, args.prompts_dir, warnings=warnings)
        rules = seed_rules(db)
        db.commit()
    print(f"seeded species={len(SPECIES)} styles={len(STYLES)} prompts={added or 'none'} rules={rules or 'none'}")
    for w in warnings:
        print(f"WARNING {w}")


if __name__ == "__main__":
    main()
