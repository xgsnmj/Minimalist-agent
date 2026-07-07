"""Align administrator configuration tables with Agents SDK settings.

Revision ID: 0004_agent_sdk_config
Revises: 0003_persist_runs
Create Date: 2026-07-07
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0004_agent_sdk_config"
down_revision = "0003_persist_runs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "model_configurations",
        sa.Column(
            "model_settings",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )
    op.add_column(
        "model_configurations",
        sa.Column(
            "native_tool_settings",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )
    op.execute(
        sa.text(
            """
            UPDATE model_configurations
            SET model_settings = COALESCE(default_parameters, '{}'::jsonb)
            WHERE model_settings = '{}'::jsonb
            """
        )
    )
    op.alter_column("model_configurations", "model_settings", server_default=None)
    op.alter_column("model_configurations", "native_tool_settings", server_default=None)
    op.drop_column("model_configurations", "default_parameters")

    op.add_column(
        "agents",
        sa.Column(
            "sdk_settings",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text(
                """'{"max_turns": 10, "tool_use_behavior": "run_llm_again", "reset_tool_choice": true}'::jsonb"""
            ),
        ),
    )
    op.alter_column("agents", "sdk_settings", server_default=None)


def downgrade() -> None:
    op.add_column(
        "model_configurations",
        sa.Column(
            "default_parameters",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )
    op.execute(
        sa.text(
            """
            UPDATE model_configurations
            SET default_parameters = COALESCE(model_settings, '{}'::jsonb)
            """
        )
    )
    op.alter_column("model_configurations", "default_parameters", server_default=None)
    op.drop_column("model_configurations", "native_tool_settings")
    op.drop_column("model_configurations", "model_settings")
    op.drop_column("agents", "sdk_settings")
