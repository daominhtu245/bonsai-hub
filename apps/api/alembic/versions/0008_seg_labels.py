"""seg labels (in-app labeling for YOLO-seg)

Revision ID: 0008
Revises: 0007
Create Date: 2026-10-24 18:00:00
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = '0008'
down_revision: str | None = '0007'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table('seg_labels',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('source', sa.String(length=16), nullable=False),
    sa.Column('job_id', sa.UUID(), nullable=True),
    sa.Column('image_key', sa.Text(), nullable=False),
    sa.Column('width', sa.Integer(), nullable=True),
    sa.Column('height', sa.Integer(), nullable=True),
    sa.Column('analysis', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column('objects', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('status', sa.Enum('pending', 'draft', 'reviewed', 'rejected', 'failed', name='seg_label_status', native_enum=False, create_constraint=False, length=32), nullable=False),
    sa.Column('draft_source', sa.String(length=16), nullable=True),
    sa.Column('error', sa.Text(), nullable=True),
    sa.Column('reviewed_by', sa.String(length=320), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("status IN ('pending', 'draft', 'reviewed', 'rejected', 'failed')", name=op.f('ck_seg_labels_seg_label_status')),
    sa.ForeignKeyConstraint(['job_id'], ['design_jobs.id'], name=op.f('fk_seg_labels_job_id_design_jobs'), ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_seg_labels')),
    sa.UniqueConstraint('job_id', name=op.f('uq_seg_labels_job_id'))
    )
    op.create_index(op.f('ix_seg_labels_status'), 'seg_labels', ['status'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_seg_labels_status'), table_name='seg_labels')
    op.drop_table('seg_labels')
