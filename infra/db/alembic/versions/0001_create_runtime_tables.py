"""Create runtime persistence tables.

Revision ID: 0001_create_runtime_tables
Revises:
Create Date: 2026-07-03
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0001_create_runtime_tables"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "agent_run_events",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("run_id", sa.Integer(), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("event_type", sa.String(length=80), nullable=False),
        sa.Column("data", postgresql.JSONB(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_agent_run_events_run_id",
        "agent_run_events",
        ["run_id"],
        unique=False,
    )
    op.create_index(
        "ix_agent_run_events_sequence",
        "agent_run_events",
        ["sequence"],
        unique=False,
    )

    op.create_table(
        "artifacts",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("conversation_id", sa.Integer(), nullable=False),
        sa.Column("run_id", sa.Integer(), nullable=True),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("content_type", sa.String(length=255), nullable=False),
        sa.Column("size", sa.Integer(), nullable=False),
        sa.Column("bucket", sa.String(length=255), nullable=False),
        sa.Column("object_key", sa.String(length=1024), nullable=False),
        sa.Column("preview_type", sa.String(length=32), nullable=False),
        sa.Column("metadata", postgresql.JSONB(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_artifacts_conversation_id",
        "artifacts",
        ["conversation_id"],
        unique=False,
    )
    op.create_index(
        "ix_artifacts_run_id",
        "artifacts",
        ["run_id"],
        unique=False,
    )

    op.create_table(
        "run_attachments",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("conversation_id", sa.Integer(), nullable=False),
        sa.Column("run_id", sa.Integer(), nullable=True),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("content_type", sa.String(length=255), nullable=False),
        sa.Column("size", sa.Integer(), nullable=False),
        sa.Column("bucket", sa.String(length=255), nullable=False),
        sa.Column("object_key", sa.String(length=1024), nullable=False),
        sa.Column("preview_type", sa.String(length=32), nullable=False),
        sa.Column("metadata", postgresql.JSONB(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_run_attachments_conversation_id",
        "run_attachments",
        ["conversation_id"],
        unique=False,
    )
    op.create_index(
        "ix_run_attachments_run_id",
        "run_attachments",
        ["run_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_run_attachments_run_id", table_name="run_attachments")
    op.drop_index("ix_run_attachments_conversation_id", table_name="run_attachments")
    op.drop_table("run_attachments")

    op.drop_index("ix_artifacts_run_id", table_name="artifacts")
    op.drop_index("ix_artifacts_conversation_id", table_name="artifacts")
    op.drop_table("artifacts")

    op.drop_index("ix_agent_run_events_sequence", table_name="agent_run_events")
    op.drop_index("ix_agent_run_events_run_id", table_name="agent_run_events")
    op.drop_table("agent_run_events")
