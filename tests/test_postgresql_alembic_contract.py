from pathlib import Path
import tomllib


ROOT = Path(__file__).resolve().parents[1]


def test_python_dependencies_use_postgresql_driver_not_mysql_driver():
    pyproject = tomllib.loads((ROOT / "pyproject.toml").read_text())
    dependencies = "\n".join(pyproject["project"]["dependencies"])

    assert "psycopg[binary]" in dependencies
    assert "pymysql" not in dependencies


def test_environment_and_compose_target_postgresql():
    env_example = (ROOT / ".env.example").read_text()
    compose = (ROOT / "infra" / "docker-compose.yml").read_text()

    assert "DATABASE_URL=postgresql+psycopg://" in env_example
    assert "MYSQL_DSN" not in env_example
    assert "postgres:18-alpine" in compose
    assert "mysql:" not in compose
    assert "MYSQL_" not in compose


def test_alembic_is_the_database_migration_path():
    readme = (ROOT / "README.md").read_text()
    start_local = (ROOT / "scripts" / "start-local.sh").read_text()

    assert (ROOT / "alembic.ini").exists()
    assert (ROOT / "infra" / "db" / "alembic" / "env.py").exists()
    assert list((ROOT / "infra" / "db" / "alembic" / "versions").glob("*.py"))
    assert not (ROOT / "scripts" / "db-migrate.py").exists()
    assert not (ROOT / "infra" / "db" / "migrations" / "0001_create_runtime_tables.sql").exists()
    assert "alembic upgrade head" in start_local
    assert "scripts/db-migrate.py" not in readme
    assert "schema_migrations" not in readme


def test_database_module_uses_database_url_with_sqlite_only_for_tests():
    database_module = (ROOT / "apps" / "api" / "app" / "database.py").read_text()

    assert "DATABASE_URL" in database_module
    assert "MYSQL_DSN" not in database_module
    assert "APP_PROFILE" in database_module
    assert "sqlite+pysqlite:///:memory:" in database_module
