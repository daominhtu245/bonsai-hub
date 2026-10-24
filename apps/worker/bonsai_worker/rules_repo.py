"""Nạp bộ luật đang áp dụng (bảng rule_docs — nghệ nhân chỉnh trên giao diện) cho phiên đang chạy."""

from __future__ import annotations

from contextlib import contextmanager

from sqlalchemy import select
from sqlalchemy.orm import Session

from bonsai_api.db.models import RuleDoc
from bonsai_pipeline.dictionaries import ordered_rule_doc, use_rules


def load_active_rules(db: Session) -> tuple[dict[str, dict], dict[str, int]]:
    rows = db.execute(select(RuleDoc).where(RuleDoc.active)).scalars().all()
    return {r.doc: ordered_rule_doc(r.doc, r.content) for r in rows}, {r.doc: r.version for r in rows}


@contextmanager
def active_rules(db: Session):
    """Trong khối này pipeline dùng bộ luật của DB (thiếu bộ nào thì dùng file gốc). Trả {bộ luật: phiên bản}."""
    docs, versions = load_active_rules(db)
    use_rules(docs)
    try:
        yield versions
    finally:
        use_rules(None)
