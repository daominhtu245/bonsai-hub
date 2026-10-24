"""admin audit log + credit reason adjust + catalog admin edits

Revision ID: 0009
Revises: 0008
Create Date: 2026-10-25 09:00:00
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = '0009'
down_revision: str | None = '0008'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table('admin_audit',
    sa.Column('id', sa.BigInteger(), sa.Identity(always=False), nullable=False),
    sa.Column('admin_email', sa.String(length=320), nullable=True),
    sa.Column('action', sa.String(length=64), nullable=False),
    sa.Column('target_type', sa.String(length=32), nullable=True),
    sa.Column('target_id', sa.String(length=64), nullable=True),
    sa.Column('detail', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_admin_audit'))
    )
    op.create_index(op.f('ix_admin_audit_admin_email'), 'admin_audit', ['admin_email'], unique=False)
    op.create_index(op.f('ix_admin_audit_action'), 'admin_audit', ['action'], unique=False)
    op.create_index(op.f('ix_admin_audit_target_id'), 'admin_audit', ['target_id'], unique=False)
    op.drop_constraint(op.f('ck_credit_ledger_credit_reason'), 'credit_ledger', type_='check')
    op.create_check_constraint(op.f('ck_credit_ledger_credit_reason'), 'credit_ledger',
                               "reason IN ('purchase', 'render', 'refund', 'gift', 'adjust')")
    op.add_column('species', sa.Column('admin_edited_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('styles', sa.Column('admin_edited_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('styles', 'admin_edited_at')
    op.drop_column('species', 'admin_edited_at')
    op.drop_constraint(op.f('ck_credit_ledger_credit_reason'), 'credit_ledger', type_='check')
    op.create_check_constraint(op.f('ck_credit_ledger_credit_reason'), 'credit_ledger',
                               "reason IN ('purchase', 'render', 'refund', 'gift')")
    op.drop_index(op.f('ix_admin_audit_target_id'), table_name='admin_audit')
    op.drop_index(op.f('ix_admin_audit_action'), table_name='admin_audit')
    op.drop_index(op.f('ix_admin_audit_admin_email'), table_name='admin_audit')
    op.drop_table('admin_audit')
