"""report and task checks

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-21 21:02:19.547701
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = '0003'
down_revision: str | None = '0002'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table('stage_task_checks',
    sa.Column('id', sa.BigInteger(), sa.Identity(always=False), nullable=False),
    sa.Column('job_id', sa.UUID(), nullable=False),
    sa.Column('stage_code', sa.String(length=2), nullable=False),
    sa.Column('task_index', sa.SmallInteger(), nullable=False),
    sa.Column('done_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['job_id'], ['design_jobs.id'], name=op.f('fk_stage_task_checks_job_id_design_jobs'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_stage_task_checks')),
    sa.UniqueConstraint('job_id', 'stage_code', 'task_index', name='uq_stage_task_checks_task')
    )
    op.create_index(op.f('ix_stage_task_checks_job_id'), 'stage_task_checks', ['job_id'], unique=False)
    op.add_column('design_jobs', sa.Column('report', postgresql.JSONB(astext_type=sa.Text()), nullable=True))


def downgrade() -> None:
    op.drop_column('design_jobs', 'report')
    op.drop_index(op.f('ix_stage_task_checks_job_id'), table_name='stage_task_checks')
    op.drop_table('stage_task_checks')
