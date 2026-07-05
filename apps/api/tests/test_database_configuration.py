import pytest
from pathlib import Path
import runpy

from apps.api.app.database import _database_url


def test_database_url_allows_sqlite_fallback_for_tests(monkeypatch):
    monkeypatch.delenv("APP_PROFILE", raising=False)
    monkeypatch.delenv("DATABASE_URL", raising=False)

    assert _database_url() == "sqlite+pysqlite:///:memory:"


def test_database_url_requires_postgresql_for_development(monkeypatch):
    monkeypatch.setenv("APP_PROFILE", "development")
    monkeypatch.delenv("DATABASE_URL", raising=False)

    with pytest.raises(RuntimeError, match="DATABASE_URL is required"):
        _database_url()

    monkeypatch.setenv("DATABASE_URL", "sqlite+pysqlite:///:memory:")
    with pytest.raises(RuntimeError, match="must point to PostgreSQL"):
        _database_url()

    monkeypatch.setenv(
        "DATABASE_URL",
        "postgresql+psycopg://minimalist_agent:minimalist_agent@localhost:5432/minimalist_agent",
    )
    assert _database_url().startswith("postgresql+psycopg://")


def test_alembic_revision_ids_fit_default_version_table_column():
    versions_dir = Path("infra/db/alembic/versions")

    for migration_path in versions_dir.glob("*.py"):
        migration = runpy.run_path(str(migration_path))
        revision = migration["revision"]
        assert len(revision) <= 32, f"{migration_path} revision is too long"
