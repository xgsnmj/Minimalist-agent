"""Persist MCP server configuration.

Revision ID: 0005_persist_mcp_config
Revises: 0004_agent_sdk_config
Create Date: 2026-07-07
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0005_persist_mcp_config"
down_revision = "0004_agent_sdk_config"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "mcp_servers",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("connection_type", sa.String(length=32), nullable=False),
        sa.Column("url", sa.String(length=2048), nullable=False),
        sa.Column("header_secret_refs", postgresql.JSONB(), nullable=False),
        sa.Column("timeout_seconds", sa.Integer(), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("last_discovery_status", sa.String(length=32), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "mcp_discovered_tools",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("server_id", sa.Integer(), nullable=False),
        sa.Column("tool_name", sa.String(length=240), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("input_schema", postgresql.JSONB(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("server_id", "tool_name", name="uq_mcp_discovered_tool_name"),
    )
    op.create_index(
        "ix_mcp_discovered_tools_server_id",
        "mcp_discovered_tools",
        ["server_id"],
        unique=False,
    )

    op.create_table(
        "mcp_tool_authorizations",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("agent_id", sa.Integer(), nullable=False),
        sa.Column("server_id", sa.Integer(), nullable=False),
        sa.Column("tool_name", sa.String(length=240), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "agent_id",
            "server_id",
            "tool_name",
            name="uq_mcp_tool_authorization",
        ),
    )
    op.create_index(
        "ix_mcp_tool_authorizations_agent_id",
        "mcp_tool_authorizations",
        ["agent_id"],
        unique=False,
    )
    op.create_index(
        "ix_mcp_tool_authorizations_server_id",
        "mcp_tool_authorizations",
        ["server_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_mcp_tool_authorizations_server_id", table_name="mcp_tool_authorizations")
    op.drop_index("ix_mcp_tool_authorizations_agent_id", table_name="mcp_tool_authorizations")
    op.drop_table("mcp_tool_authorizations")

    op.drop_index("ix_mcp_discovered_tools_server_id", table_name="mcp_discovered_tools")
    op.drop_table("mcp_discovered_tools")

    op.drop_table("mcp_servers")
