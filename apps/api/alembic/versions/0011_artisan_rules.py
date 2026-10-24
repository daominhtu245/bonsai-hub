"""artisan role + rule_docs (bộ luật có phiên bản) + artisan_reviews

Revision ID: 0011
Revises: 0010
Create Date: 2026-10-25 20:00:00
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = '0011'
down_revision: str | None = '0010'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # vai trò lưu dạng chuỗi + ràng buộc CHECK (không phải enum gốc của Postgres)
    op.drop_constraint(op.f('ck_users_user_role'), 'users', type_='check')
    op.create_check_constraint(op.f('ck_users_user_role'), 'users', "role IN ('player', 'nursery', 'artisan', 'admin')")
    op.create_table('rule_docs',
    sa.Column('id', sa.BigInteger(), sa.Identity(always=False), nullable=False),
    sa.Column('doc', sa.String(length=32), nullable=False),
    sa.Column('version', sa.Integer(), nullable=False),
    sa.Column('content', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('note', sa.String(length=300), nullable=True),
    sa.Column('active', sa.Boolean(), server_default=sa.text('false'), nullable=False),
    sa.Column('created_by', sa.String(length=320), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('activated_by', sa.String(length=320), nullable=True),
    sa.Column('activated_at', sa.DateTime(timezone=True), nullable=True),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_rule_docs')),
    sa.UniqueConstraint('doc', 'version', name='uq_rule_docs_doc_version'),
    )
    op.create_index(op.f('ix_rule_docs_doc'), 'rule_docs', ['doc'], unique=False)
    # mỗi bộ luật chỉ một bản đang áp dụng
    op.create_index('uq_rule_docs_one_active', 'rule_docs', ['doc'], unique=True, postgresql_where=sa.text('active'))
    op.create_table('artisan_reviews',
    sa.Column('id', sa.BigInteger(), sa.Identity(always=False), nullable=False),
    sa.Column('kind', sa.String(length=16), nullable=False),
    sa.Column('job_id', sa.UUID(), nullable=False),
    sa.Column('render_id', sa.UUID(), nullable=True),
    sa.Column('option_id', sa.UUID(), nullable=True),
    sa.Column('reviewer_id', sa.UUID(), nullable=False),
    sa.Column('scores', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('hard_fails', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('total', sa.Numeric(precision=5, scale=2), nullable=True),
    sa.Column('passed', sa.Boolean(), nullable=False),
    sa.Column('comment', sa.Text(), nullable=True),
    sa.Column('rules_version', sa.Integer(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    sa.CheckConstraint("kind IN ('image', 'design')", name=op.f('ck_artisan_reviews_kind_valid')),
    sa.CheckConstraint('(render_id IS NOT NULL) OR (option_id IS NOT NULL)', name=op.f('ck_artisan_reviews_has_target')),
    sa.ForeignKeyConstraint(['job_id'], ['design_jobs.id'], name=op.f('fk_artisan_reviews_job_id_design_jobs'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['render_id'], ['render_images.id'], name=op.f('fk_artisan_reviews_render_id_render_images'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['option_id'], ['design_options.id'], name=op.f('fk_artisan_reviews_option_id_design_options'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['reviewer_id'], ['users.id'], name=op.f('fk_artisan_reviews_reviewer_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_artisan_reviews')),
    sa.UniqueConstraint('reviewer_id', 'render_id', name='uq_artisan_reviews_reviewer_render'),
    sa.UniqueConstraint('reviewer_id', 'option_id', name='uq_artisan_reviews_reviewer_option'),
    )
    op.create_index(op.f('ix_artisan_reviews_job_id'), 'artisan_reviews', ['job_id'], unique=False)
    op.create_index(op.f('ix_artisan_reviews_reviewer_id'), 'artisan_reviews', ['reviewer_id'], unique=False)


def downgrade() -> None:
    op.drop_table('artisan_reviews')
    op.drop_index('uq_rule_docs_one_active', table_name='rule_docs')
    op.drop_index(op.f('ix_rule_docs_doc'), table_name='rule_docs')
    op.drop_table('rule_docs')
    op.execute("UPDATE users SET role = 'player' WHERE role = 'artisan'")
    op.drop_constraint(op.f('ck_users_user_role'), 'users', type_='check')
    op.create_check_constraint(op.f('ck_users_user_role'), 'users', "role IN ('player', 'nursery', 'admin')")
