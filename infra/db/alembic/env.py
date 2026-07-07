from __future__ import annotations

import os
import sys
from logging.config import fileConfig
from pathlib import Path

from alembic import context
from dotenv import load_dotenv
from sqlalchemy import engine_from_config, pool


config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

repo_root = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(repo_root))


def _load_environment() -> None:
    for name in (".env.local", ".env", ".env.example"):
        load_dotenv(repo_root / name, override=False)


def _database_url() -> str:
    database_url = os.getenv("DATABASE_URL", "").strip()
    if not database_url:
        raise RuntimeError("DATABASE_URL is required to run Alembic migrations.")

    backend = database_url.split(":", maxsplit=1)[0].split("+", maxsplit=1)[0]
    if backend != "postgresql":
        raise RuntimeError("Alembic migrations must target PostgreSQL.")
    return database_url


_load_environment()
config.set_main_option("sqlalchemy.url", _database_url().replace("%", "%%"))

from apps.api.app.database import Base  # noqa: E402
from apps.api.app import admin_audit as _admin_audit  # noqa: E402,F401
from apps.api.app import agents as _agents  # noqa: E402,F401
from apps.api.app import artifacts as _artifacts  # noqa: E402,F401
from apps.api.app import auth as _auth  # noqa: E402,F401
from apps.api.app import conversations as _conversations  # noqa: E402,F401
from apps.api.app import agent_runs as _agent_runs  # noqa: E402,F401
from apps.api.app import mcp_servers as _mcp_servers  # noqa: E402,F401
from apps.api.app import model_configurations as _model_configurations  # noqa: E402,F401
from apps.api.app import run_attachments as _run_attachments  # noqa: E402,F401
from apps.api.app import run_event_log as _run_event_log  # noqa: E402,F401
from apps.api.app import secret_vault as _secret_vault  # noqa: E402,F401

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
