"""charge ref

Revision ID: 0005
Revises: 0004
Create Date: 2026-10-21 22:01:14.364000
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = '0005'
down_revision: str | None = '0004'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('design_jobs', sa.Column('charge_ref', sa.String(length=64), nullable=True))


def downgrade() -> None:
    op.drop_column('design_jobs', 'charge_ref')
