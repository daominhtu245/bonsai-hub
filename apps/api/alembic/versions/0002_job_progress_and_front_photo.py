"""job progress and front photo

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-21 20:19:37.014790
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = '0002'
down_revision: str | None = '0001'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # user_id: thêm nullable, điền từ trees, rồi mới NOT NULL (an toàn khi đã có dữ liệu).
    op.add_column('design_jobs', sa.Column('user_id', sa.UUID(), nullable=True))
    op.execute("UPDATE design_jobs j SET user_id = t.user_id FROM trees t WHERE t.id = j.tree_id")
    op.alter_column('design_jobs', 'user_id', nullable=False)
    op.add_column('design_jobs', sa.Column('front_photo_id', sa.UUID(), nullable=True))
    op.add_column('design_jobs', sa.Column('inputs', postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.add_column('design_jobs', sa.Column('progress', postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=False))
    op.add_column('design_jobs', sa.Column('error_code', sa.String(length=64), nullable=True))
    op.create_index('ix_design_jobs_user_created', 'design_jobs', ['user_id', 'created_at'], unique=False)
    op.create_foreign_key(op.f('fk_design_jobs_front_photo_id_tree_photos'), 'design_jobs', 'tree_photos', ['front_photo_id'], ['id'], ondelete='SET NULL')
    op.create_foreign_key(op.f('fk_design_jobs_user_id_users'), 'design_jobs', 'users', ['user_id'], ['id'], ondelete='CASCADE')
    op.add_column('design_options', sa.Column('sketch_meta', postgresql.JSONB(astext_type=sa.Text()), nullable=True))


def downgrade() -> None:
    op.drop_column('design_options', 'sketch_meta')
    op.drop_constraint(op.f('fk_design_jobs_user_id_users'), 'design_jobs', type_='foreignkey')
    op.drop_constraint(op.f('fk_design_jobs_front_photo_id_tree_photos'), 'design_jobs', type_='foreignkey')
    op.drop_index('ix_design_jobs_user_created', table_name='design_jobs')
    op.drop_column('design_jobs', 'error_code')
    op.drop_column('design_jobs', 'progress')
    op.drop_column('design_jobs', 'inputs')
    op.drop_column('design_jobs', 'front_photo_id')
    op.drop_column('design_jobs', 'user_id')
