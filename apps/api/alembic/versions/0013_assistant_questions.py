"""assistant questions (E4)

Revision ID: 0013
Revises: 0012
Create Date: 2026-10-25 03:10:00
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = '0013'
down_revision: str | None = '0012'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table('assistant_questions',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('tree_id', sa.UUID(), nullable=True),
    sa.Column('question', sa.Text(), nullable=False),
    sa.Column('status', sa.String(length=16), nullable=False),
    sa.Column('answer', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['tree_id'], ['trees.id'], name=op.f('fk_assistant_questions_tree_id_trees'), ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_assistant_questions_user_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_assistant_questions'))
    )
    op.create_index(op.f('ix_assistant_questions_user_id'), 'assistant_questions', ['user_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_assistant_questions_user_id'), table_name='assistant_questions')
    op.drop_table('assistant_questions')
