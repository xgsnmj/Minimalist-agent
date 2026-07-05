"""Persist conversations and agent runs.

Revision ID: 0003_persist_runs
Revises: 0002_admin_config
Create Date: 2026-07-05
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0003_persist_runs"
down_revision = "0002_admin_config"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "agent_conversations",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("owner_user_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("agent_id", sa.Integer(), nullable=False),
        sa.Column("selected_model_configuration_id", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("updated_at", sa.String(length=64), nullable=False),
        sa.Column("deleted", sa.Boolean(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        if_not_exists=True,
    )
    op.create_index(
        "ix_agent_conversations_owner_user_id",
        "agent_conversations",
        ["owner_user_id"],
        unique=False,
        if_not_exists=True,
    )

    op.create_table(
        "agent_conversation_messages",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("conversation_id", sa.Integer(), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("role", sa.String(length=32), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("artifact_reference", postgresql.JSONB(), nullable=True),
        sa.Column("card", postgresql.JSONB(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        if_not_exists=True,
    )
    op.create_index(
        "ix_agent_conversation_messages_conversation_id",
        "agent_conversation_messages",
        ["conversation_id"],
        unique=False,
        if_not_exists=True,
    )

    op.create_table(
        "agent_runs",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("conversation_id", sa.Integer(), nullable=False),
        sa.Column("owner_user_id", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("capability_snapshot", postgresql.JSONB(), nullable=False),
        sa.Column("user_message", sa.Text(), nullable=False),
        sa.Column("assistant_message", sa.Text(), nullable=True),
        sa.Column("process_summaries", postgresql.JSONB(), nullable=False),
        sa.Column("full_trace", postgresql.JSONB(), nullable=False),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("worker_enqueued", sa.Boolean(), nullable=False),
        sa.Column("events", postgresql.JSONB(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        if_not_exists=True,
    )
    op.create_index(
        "ix_agent_runs_conversation_id",
        "agent_runs",
        ["conversation_id"],
        unique=False,
        if_not_exists=True,
    )
    op.create_index(
        "ix_agent_runs_owner_user_id",
        "agent_runs",
        ["owner_user_id"],
        unique=False,
        if_not_exists=True,
    )


def downgrade() -> None:
    op.drop_index("ix_agent_runs_owner_user_id", table_name="agent_runs", if_exists=True)
    op.drop_index("ix_agent_runs_conversation_id", table_name="agent_runs", if_exists=True)
    op.drop_table("agent_runs", if_exists=True)

    op.drop_index(
        "ix_agent_conversation_messages_conversation_id",
        table_name="agent_conversation_messages",
        if_exists=True,
    )
    op.drop_table("agent_conversation_messages", if_exists=True)

    op.drop_index(
        "ix_agent_conversations_owner_user_id",
        table_name="agent_conversations",
        if_exists=True,
    )
    op.drop_table("agent_conversations", if_exists=True)
