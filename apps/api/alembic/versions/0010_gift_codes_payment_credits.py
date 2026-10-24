"""gift codes + payment credits snapshot

Revision ID: 0010
Revises: 0009
Create Date: 2026-10-25 15:00:00
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = '0010'
down_revision: str | None = '0009'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('payments', sa.Column('credits', sa.Integer(), nullable=True))
    op.create_table('gift_codes',
    sa.Column('code', sa.String(length=32), nullable=False),
    sa.Column('credits', sa.Integer(), nullable=False),
    sa.Column('max_uses', sa.Integer(), nullable=True),
    sa.Column('used', sa.Integer(), server_default='0', nullable=False),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('active', sa.Boolean(), server_default=sa.text('true'), nullable=False),
    sa.Column('note', sa.String(length=200), nullable=True),
    sa.Column('created_by', sa.String(length=320), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint('credits > 0', name=op.f('ck_gift_codes_credits_positive')),
    sa.PrimaryKeyConstraint('code', name=op.f('pk_gift_codes'))
    )
    op.create_table('gift_redemptions',
    sa.Column('id', sa.BigInteger(), sa.Identity(always=False), nullable=False),
    sa.Column('code', sa.String(length=32), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['code'], ['gift_codes.code'], name=op.f('fk_gift_redemptions_code_gift_codes'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_gift_redemptions_user_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_gift_redemptions')),
    sa.UniqueConstraint('code', 'user_id', name='uq_gift_redemptions_code_user')
    )
    op.create_index(op.f('ix_gift_redemptions_code'), 'gift_redemptions', ['code'], unique=False)
    op.create_index(op.f('ix_gift_redemptions_user_id'), 'gift_redemptions', ['user_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_gift_redemptions_user_id'), table_name='gift_redemptions')
    op.drop_index(op.f('ix_gift_redemptions_code'), table_name='gift_redemptions')
    op.drop_table('gift_redemptions')
    op.drop_table('gift_codes')
    op.drop_column('payments', 'credits')
