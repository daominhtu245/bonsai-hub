"""reports (báo vi phạm), feedback resolved, users.admin_note

Revision ID: 0014
Revises: 0013
Create Date: 2026-10-25 10:00:00
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = '0014'
down_revision: str | None = '0013'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table('reports',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('reporter_id', sa.UUID(), nullable=True),
    sa.Column('target_kind', sa.String(length=24), nullable=False),
    sa.Column('target_id', sa.String(length=64), nullable=False),
    sa.Column('reason', sa.String(length=24), nullable=False),
    sa.Column('note', sa.Text(), nullable=True),
    sa.Column('status', sa.String(length=16), nullable=False),
    sa.Column('resolution', sa.Text(), nullable=True),
    sa.Column('resolved_by', sa.String(length=320), nullable=True),
    sa.Column('resolved_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['reporter_id'], ['users.id'], name=op.f('fk_reports_reporter_id_users'), ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_reports'))
    )
    op.create_index(op.f('ix_reports_reporter_id'), 'reports', ['reporter_id'], unique=False)
    op.create_index(op.f('ix_reports_status'), 'reports', ['status'], unique=False)
    op.create_index('ix_reports_target', 'reports', ['target_kind', 'target_id'], unique=False)
    op.add_column('feedback', sa.Column('resolved_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('feedback', sa.Column('admin_note', sa.Text(), nullable=True))
    op.add_column('users', sa.Column('admin_note', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'admin_note')
    op.drop_column('feedback', 'admin_note')
    op.drop_column('feedback', 'resolved_at')
    op.drop_index('ix_reports_target', table_name='reports')
    op.drop_index(op.f('ix_reports_status'), table_name='reports')
    op.drop_index(op.f('ix_reports_reporter_id'), table_name='reports')
    op.drop_table('reports')
