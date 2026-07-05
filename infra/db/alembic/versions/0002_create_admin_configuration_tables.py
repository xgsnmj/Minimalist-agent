"""Create administrator configuration persistence tables.

Revision ID: 0002_admin_config
Revises: 0001_create_runtime_tables
Create Date: 2026-07-05
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0002_admin_config"
down_revision = "0001_create_runtime_tables"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "model_configurations",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("provider_id", sa.String(length=120), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("model_name", sa.String(length=255), nullable=False),
        sa.Column("endpoint", sa.String(length=1024), nullable=False),
        sa.Column("credential_reference", sa.String(length=512), nullable=False),
        sa.Column("default_parameters", postgresql.JSONB(), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("health_status", sa.String(length=32), nullable=False),
        sa.Column("last_checked_at", sa.String(length=64), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "model_health_checks",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("model_configuration_id", sa.Integer(), nullable=False),
        sa.Column("health_status", sa.String(length=32), nullable=False),
        sa.Column("checked_at", sa.String(length=64), nullable=False),
        sa.Column("message", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_model_health_checks_model_configuration_id",
        "model_health_checks",
        ["model_configuration_id"],
        unique=False,
    )

    op.create_table(
        "agents",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("icon", sa.String(length=80), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("is_default", sa.Boolean(), nullable=False),
        sa.Column("instruction", sa.Text(), nullable=False),
        sa.Column("process_visibility", sa.String(length=32), nullable=False),
        sa.Column("default_model_configuration_id", sa.Integer(), nullable=True),
        sa.Column("allowed_model_configuration_ids", postgresql.JSONB(), nullable=False),
        sa.Column("capability_policy", postgresql.JSONB(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "local_accounts",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("username", sa.String(length=80), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("password", sa.String(length=255), nullable=False),
        sa.Column("role", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("note", sa.Text(), nullable=False),
        sa.Column("status_reason", sa.Text(), nullable=False),
        sa.Column("created_at", sa.String(length=64), nullable=False),
        sa.Column("updated_at", sa.String(length=64), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
        sa.UniqueConstraint("username"),
    )

    op.create_table(
        "account_audit_events",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("account_id", sa.Integer(), nullable=False),
        sa.Column("actor_id", sa.Integer(), nullable=True),
        sa.Column("action", sa.String(length=32), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("note", sa.Text(), nullable=False),
        sa.Column("created_at", sa.String(length=64), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_account_audit_events_account_id",
        "account_audit_events",
        ["account_id"],
        unique=False,
    )

    op.create_table(
        "local_sessions",
        sa.Column("token", sa.String(length=96), nullable=False),
        sa.Column("account_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.String(length=64), nullable=False),
        sa.PrimaryKeyConstraint("token"),
    )
    op.create_index(
        "ix_local_sessions_account_id",
        "local_sessions",
        ["account_id"],
        unique=False,
    )

    op.create_table(
        "secret_vault_entries",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("reference", sa.String(length=512), nullable=False),
        sa.Column("secret_value", sa.Text(), nullable=False),
        sa.Column("created_at", sa.String(length=64), nullable=False),
        sa.Column("updated_at", sa.String(length=64), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("reference"),
    )

    op.create_table(
        "admin_audit_events",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("actor_id", sa.Integer(), nullable=True),
        sa.Column("target_type", sa.String(length=80), nullable=False),
        sa.Column("target_id", sa.String(length=120), nullable=False),
        sa.Column("action", sa.String(length=80), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("before", postgresql.JSONB(), nullable=True),
        sa.Column("after", postgresql.JSONB(), nullable=True),
        sa.Column("created_at", sa.String(length=64), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_admin_audit_events_actor_id",
        "admin_audit_events",
        ["actor_id"],
        unique=False,
    )
    op.create_index(
        "ix_admin_audit_events_target_id",
        "admin_audit_events",
        ["target_id"],
        unique=False,
    )
    op.create_index(
        "ix_admin_audit_events_target_type",
        "admin_audit_events",
        ["target_type"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_admin_audit_events_target_type", table_name="admin_audit_events")
    op.drop_index("ix_admin_audit_events_target_id", table_name="admin_audit_events")
    op.drop_index("ix_admin_audit_events_actor_id", table_name="admin_audit_events")
    op.drop_table("admin_audit_events")

    op.drop_table("secret_vault_entries")

    op.drop_index("ix_local_sessions_account_id", table_name="local_sessions")
    op.drop_table("local_sessions")

    op.drop_index("ix_account_audit_events_account_id", table_name="account_audit_events")
    op.drop_table("account_audit_events")
    op.drop_table("local_accounts")

    op.drop_table("agents")

    op.drop_index(
        "ix_model_health_checks_model_configuration_id",
        table_name="model_health_checks",
    )
    op.drop_table("model_health_checks")
    op.drop_table("model_configurations")
