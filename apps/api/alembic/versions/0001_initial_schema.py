"""initial schema

Revision ID: 0001
Revises: 
Create Date: 2026-10-21 17:52:58.256811
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = '0001'
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Enum lưu dạng chuỗi; CHECK được khai báo riêng bên dưới (create_constraint=False để không tạo trùng).
    op.create_table('prompt_versions',
    sa.Column('id', sa.Integer(), sa.Identity(always=False), nullable=False),
    sa.Column('step_code', sa.String(length=32), nullable=False),
    sa.Column('version', sa.String(length=32), nullable=False),
    sa.Column('kind', sa.String(length=16), nullable=False),
    sa.Column('template', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('description', sa.Text(), nullable=True),
    sa.Column('active', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_prompt_versions')),
    sa.UniqueConstraint('step_code', 'version', name='uq_prompt_versions_step_version')
    )
    op.create_index('uq_prompt_versions_one_active', 'prompt_versions', ['step_code'], unique=True, postgresql_where=sa.text('active'))
    op.create_table('species',
    sa.Column('key', sa.String(length=32), nullable=False),
    sa.Column('name_vi', sa.String(length=100), nullable=False),
    sa.Column('prompt_desc_en', sa.Text(), nullable=False),
    sa.Column('growth_speed', sa.String(length=16), nullable=False),
    sa.Column('ref_image_keys', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.CheckConstraint("growth_speed IN ('slow','medium','fast')", name=op.f('ck_species_growth_speed_valid')),
    sa.PrimaryKeyConstraint('key', name=op.f('pk_species'))
    )
    op.create_table('styles',
    sa.Column('key', sa.String(length=32), nullable=False),
    sa.Column('name_vi', sa.String(length=100), nullable=False),
    sa.Column('name_jp', sa.String(length=100), nullable=True),
    sa.Column('prompt_desc_en', sa.Text(), nullable=False),
    sa.Column('growth_speed', sa.String(length=16), nullable=True),
    sa.Column('ref_image_keys', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.PrimaryKeyConstraint('key', name=op.f('pk_styles'))
    )
    op.create_table('users',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('auth_provider', sa.Enum('google', 'zalo', 'dev', name='auth_provider', native_enum=False, create_constraint=False, length=32), nullable=False),
    sa.Column('email', sa.String(length=320), nullable=True),
    sa.Column('google_sub', sa.String(length=64), nullable=True),
    sa.Column('zalo_id', sa.String(length=64), nullable=True),
    sa.Column('name', sa.String(length=200), nullable=True),
    sa.Column('avatar_url', sa.Text(), nullable=True),
    sa.Column('phone', sa.String(length=32), nullable=True),
    sa.Column('role', sa.Enum('player', 'nursery', 'admin', name='user_role', native_enum=False, create_constraint=False, length=32), nullable=False),
    sa.Column('credits', sa.Integer(), server_default='0', nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("auth_provider IN ('google', 'zalo', 'dev')", name=op.f('ck_users_auth_provider')),
    sa.CheckConstraint("role IN ('player', 'nursery', 'admin')", name=op.f('ck_users_user_role')),
    sa.CheckConstraint('credits >= 0', name=op.f('ck_users_credits_non_negative')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_users')),
    sa.UniqueConstraint('email', name=op.f('uq_users_email')),
    sa.UniqueConstraint('google_sub', name=op.f('uq_users_google_sub')),
    sa.UniqueConstraint('zalo_id', name=op.f('uq_users_zalo_id'))
    )
    op.create_table('credit_ledger',
    sa.Column('id', sa.BigInteger(), sa.Identity(always=False), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('delta', sa.Integer(), nullable=False),
    sa.Column('reason', sa.Enum('purchase', 'render', 'refund', 'gift', name='credit_reason', native_enum=False, create_constraint=False, length=32), nullable=False),
    sa.Column('ref_id', sa.String(length=64), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("reason IN ('purchase', 'render', 'refund', 'gift')", name=op.f('ck_credit_ledger_credit_reason')),
    sa.CheckConstraint('delta <> 0', name=op.f('ck_credit_ledger_delta_non_zero')),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_credit_ledger_user_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_credit_ledger'))
    )
    op.create_index(op.f('ix_credit_ledger_user_id'), 'credit_ledger', ['user_id'], unique=False)
    op.create_index('uq_credit_ledger_user_reason_ref', 'credit_ledger', ['user_id', 'reason', 'ref_id'], unique=True, postgresql_where=sa.text('ref_id IS NOT NULL'))
    op.create_table('payments',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('amount_vnd', sa.Integer(), nullable=False),
    sa.Column('package_code', sa.String(length=32), nullable=False),
    sa.Column('transfer_code', sa.String(length=32), nullable=False),
    sa.Column('status', sa.Enum('pending', 'paid', 'expired', 'cancelled', name='payment_status', native_enum=False, create_constraint=False, length=32), nullable=False),
    sa.Column('provider_txn_id', sa.String(length=100), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('paid_at', sa.DateTime(timezone=True), nullable=True),
    sa.CheckConstraint("status IN ('pending', 'paid', 'expired', 'cancelled')", name=op.f('ck_payments_payment_status')),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_payments_user_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_payments')),
    sa.UniqueConstraint('provider_txn_id', name=op.f('uq_payments_provider_txn_id')),
    sa.UniqueConstraint('transfer_code', name=op.f('uq_payments_transfer_code'))
    )
    op.create_index(op.f('ix_payments_user_id'), 'payments', ['user_id'], unique=False)
    op.create_table('trees',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('nickname', sa.String(length=120), nullable=True),
    sa.Column('species_key', sa.String(length=32), nullable=True),
    sa.Column('real_height_cm', sa.Float(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['species_key'], ['species.key'], name=op.f('fk_trees_species_key_species')),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_trees_user_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_trees'))
    )
    op.create_index(op.f('ix_trees_user_id'), 'trees', ['user_id'], unique=False)
    op.create_table('design_jobs',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('tree_id', sa.UUID(), nullable=False),
    sa.Column('status', sa.Enum('queued', 'analyzing', 'designing', 'awaiting_choice', 'rendering_final', 'judging', 'rendering_stages', 'writing_guide', 'done', 'failed', name='job_status', native_enum=False, create_constraint=False, length=32), nullable=False),
    sa.Column('analysis', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column('targets', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column('chosen_option_id', sa.UUID(), nullable=True),
    sa.Column('prompt_version', sa.String(length=64), nullable=True),
    sa.Column('error', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('started_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('finished_at', sa.DateTime(timezone=True), nullable=True),
    sa.CheckConstraint("status IN ('queued', 'analyzing', 'designing', 'awaiting_choice', 'rendering_final', 'judging', 'rendering_stages', 'writing_guide', 'done', 'failed')", name=op.f('ck_design_jobs_job_status')),
    sa.ForeignKeyConstraint(['tree_id'], ['trees.id'], name=op.f('fk_design_jobs_tree_id_trees'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_design_jobs'))
    )
    op.create_index(op.f('ix_design_jobs_tree_id'), 'design_jobs', ['tree_id'], unique=False)
    op.create_table('tree_photos',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('tree_id', sa.UUID(), nullable=False),
    sa.Column('storage_key', sa.Text(), nullable=False),
    sa.Column('width', sa.Integer(), nullable=True),
    sa.Column('height', sa.Integer(), nullable=True),
    sa.Column('view_index', sa.SmallInteger(), nullable=False),
    sa.Column('is_front', sa.Boolean(), nullable=False),
    sa.Column('taken_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('source', sa.Enum('upload', 'progress', name='photo_source', native_enum=False, create_constraint=False, length=32), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("source IN ('upload', 'progress')", name=op.f('ck_tree_photos_photo_source')),
    sa.ForeignKeyConstraint(['tree_id'], ['trees.id'], name=op.f('fk_tree_photos_tree_id_trees'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_tree_photos'))
    )
    op.create_index(op.f('ix_tree_photos_tree_id'), 'tree_photos', ['tree_id'], unique=False)
    op.create_table('design_options',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('job_id', sa.UUID(), nullable=False),
    sa.Column('rank', sa.SmallInteger(), nullable=False),
    sa.Column('style_key', sa.String(length=32), nullable=False),
    sa.Column('suitability', sa.Float(), nullable=False),
    sa.Column('design', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('sketch_svg_key', sa.Text(), nullable=True),
    sa.Column('sketch_png_key', sa.Text(), nullable=True),
    sa.ForeignKeyConstraint(['job_id'], ['design_jobs.id'], name=op.f('fk_design_options_job_id_design_jobs'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['style_key'], ['styles.key'], name=op.f('fk_design_options_style_key_styles')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_design_options')),
    sa.UniqueConstraint('job_id', 'rank', name='uq_design_options_job_rank')
    )
    op.create_index(op.f('ix_design_options_job_id'), 'design_options', ['job_id'], unique=False)
    op.create_table('feedback',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('job_id', sa.UUID(), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('rating', sa.SmallInteger(), nullable=False),
    sa.Column('reason_tags', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('comment', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint('rating IN (-1, 1)', name=op.f('ck_feedback_rating_valid')),
    sa.ForeignKeyConstraint(['job_id'], ['design_jobs.id'], name=op.f('fk_feedback_job_id_design_jobs'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_feedback_user_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_feedback')),
    sa.UniqueConstraint('job_id', 'user_id', name='uq_feedback_job_user')
    )
    op.create_index(op.f('ix_feedback_job_id'), 'feedback', ['job_id'], unique=False)
    op.create_table('pipeline_steps',
    sa.Column('id', sa.BigInteger(), sa.Identity(always=False), nullable=False),
    sa.Column('job_id', sa.UUID(), nullable=True),
    sa.Column('step_code', sa.String(length=32), nullable=False),
    sa.Column('provider', sa.String(length=32), nullable=False),
    sa.Column('model', sa.String(length=100), nullable=False),
    sa.Column('prompt_version', sa.String(length=64), nullable=True),
    sa.Column('input_ref', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column('output', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column('tokens_in', sa.Integer(), nullable=False),
    sa.Column('tokens_out', sa.Integer(), nullable=False),
    sa.Column('images_out', sa.Integer(), nullable=False),
    sa.Column('cost_usd', sa.Numeric(precision=10, scale=6), nullable=False),
    sa.Column('latency_ms', sa.Integer(), nullable=False),
    sa.Column('ok', sa.Boolean(), nullable=False),
    sa.Column('error', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['job_id'], ['design_jobs.id'], name=op.f('fk_pipeline_steps_job_id_design_jobs'), ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_pipeline_steps'))
    )
    op.create_index('ix_pipeline_steps_created_at', 'pipeline_steps', ['created_at'], unique=False)
    op.create_index(op.f('ix_pipeline_steps_job_id'), 'pipeline_steps', ['job_id'], unique=False)
    op.create_table('render_images',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('job_id', sa.UUID(), nullable=False),
    sa.Column('stage_code', sa.String(length=2), nullable=False),
    sa.Column('attempt', sa.SmallInteger(), nullable=False),
    sa.Column('storage_key', sa.Text(), nullable=False),
    sa.Column('model', sa.String(length=100), nullable=False),
    sa.Column('prompt_hash', sa.String(length=64), nullable=True),
    sa.Column('cv_checks', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column('judge', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column('total_score', sa.Float(), nullable=True),
    sa.Column('selected', sa.Boolean(), server_default=sa.text('false'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['job_id'], ['design_jobs.id'], name=op.f('fk_render_images_job_id_design_jobs'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_render_images'))
    )
    op.create_index(op.f('ix_render_images_job_id'), 'render_images', ['job_id'], unique=False)
    op.create_table('stages',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('job_id', sa.UUID(), nullable=False),
    sa.Column('code', sa.String(length=2), nullable=False),
    sa.Column('time_from_start', sa.String(length=64), nullable=True),
    sa.Column('plan', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column('guide_vi', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column('image_id', sa.UUID(), nullable=True),
    sa.CheckConstraint("code IN ('S0','S1','S2','S3','S4')", name=op.f('ck_stages_code_valid')),
    sa.ForeignKeyConstraint(['image_id'], ['render_images.id'], name=op.f('fk_stages_image_id_render_images'), ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['job_id'], ['design_jobs.id'], name=op.f('fk_stages_job_id_design_jobs'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_stages')),
    sa.UniqueConstraint('job_id', 'code', name='uq_stages_job_code')
    )
    op.create_index(op.f('ix_stages_job_id'), 'stages', ['job_id'], unique=False)
    # design_jobs <-> design_options tham chiếu vòng nên tạo FK sau cùng.
    op.create_foreign_key(op.f('fk_design_jobs_chosen_option_id_design_options'), 'design_jobs', 'design_options',
                          ['chosen_option_id'], ['id'], ondelete='SET NULL')


def downgrade() -> None:
    op.drop_constraint(op.f('fk_design_jobs_chosen_option_id_design_options'), 'design_jobs', type_='foreignkey')
    op.drop_index(op.f('ix_stages_job_id'), table_name='stages')
    op.drop_table('stages')
    op.drop_index(op.f('ix_render_images_job_id'), table_name='render_images')
    op.drop_table('render_images')
    op.drop_index(op.f('ix_pipeline_steps_job_id'), table_name='pipeline_steps')
    op.drop_index('ix_pipeline_steps_created_at', table_name='pipeline_steps')
    op.drop_table('pipeline_steps')
    op.drop_index(op.f('ix_feedback_job_id'), table_name='feedback')
    op.drop_table('feedback')
    op.drop_index(op.f('ix_design_options_job_id'), table_name='design_options')
    op.drop_table('design_options')
    op.drop_index(op.f('ix_tree_photos_tree_id'), table_name='tree_photos')
    op.drop_table('tree_photos')
    op.drop_index(op.f('ix_design_jobs_tree_id'), table_name='design_jobs')
    op.drop_table('design_jobs')
    op.drop_index(op.f('ix_trees_user_id'), table_name='trees')
    op.drop_table('trees')
    op.drop_index(op.f('ix_payments_user_id'), table_name='payments')
    op.drop_table('payments')
    op.drop_index('uq_credit_ledger_user_reason_ref', table_name='credit_ledger', postgresql_where=sa.text('ref_id IS NOT NULL'))
    op.drop_index(op.f('ix_credit_ledger_user_id'), table_name='credit_ledger')
    op.drop_table('credit_ledger')
    op.drop_table('users')
    op.drop_table('styles')
    op.drop_table('species')
    op.drop_index('uq_prompt_versions_one_active', table_name='prompt_versions', postgresql_where=sa.text('active'))
    op.drop_table('prompt_versions')
