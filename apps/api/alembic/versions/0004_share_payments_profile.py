"""share payments profile

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-21 21:17:28.440728
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = '0004'
down_revision: str | None = '0003'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('design_jobs', sa.Column('share_code', sa.String(length=16), nullable=True))
    op.create_unique_constraint(op.f('uq_design_jobs_share_code'), 'design_jobs', ['share_code'])
    op.add_column('payments', sa.Column('provider', sa.String(length=16), nullable=True))
    op.add_column('payments', sa.Column('raw', postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.add_column('users', sa.Column('garden_name', sa.String(length=120), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'garden_name')
    op.drop_column('payments', 'raw')
    op.drop_column('payments', 'provider')
    op.drop_constraint(op.f('uq_design_jobs_share_code'), 'design_jobs', type_='unique')
    op.drop_column('design_jobs', 'share_code')
