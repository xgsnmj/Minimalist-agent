#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import os
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Connection, Engine


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_ENV_FILES = (ROOT / ".env.local", ROOT / ".env", ROOT / ".env.example")
DEFAULT_MIGRATIONS_DIR = ROOT / "infra" / "db" / "migrations"
MIGRATION_LOCK_NAME = "minimalist_agent_schema_migrations"


@dataclass(frozen=True)
class ColumnSpec:
    name: str
    ddl: str
    data_type: str
    nullable: bool


@dataclass(frozen=True)
class IndexSpec:
    name: str
    column: str


@dataclass(frozen=True)
class TableSpec:
    name: str
    columns: tuple[ColumnSpec, ...]
    indexes: tuple[IndexSpec, ...]


EXPECTED_TABLES = (
    TableSpec(
        name="artifacts",
        columns=(
            ColumnSpec("id", "INT NOT NULL AUTO_INCREMENT PRIMARY KEY", "int", False),
            ColumnSpec("conversation_id", "INT NOT NULL", "int", False),
            ColumnSpec("run_id", "INT NULL", "int", True),
            ColumnSpec("filename", "VARCHAR(255) NOT NULL", "varchar", False),
            ColumnSpec("content_type", "VARCHAR(255) NOT NULL", "varchar", False),
            ColumnSpec("size", "INT NOT NULL", "int", False),
            ColumnSpec("bucket", "VARCHAR(255) NOT NULL", "varchar", False),
            ColumnSpec("object_key", "VARCHAR(1024) NOT NULL", "varchar", False),
            ColumnSpec("preview_type", "VARCHAR(32) NOT NULL", "varchar", False),
            ColumnSpec("metadata", "JSON NOT NULL", "json", False),
        ),
        indexes=(
            IndexSpec("ix_artifacts_conversation_id", "conversation_id"),
            IndexSpec("ix_artifacts_run_id", "run_id"),
        ),
    ),
    TableSpec(
        name="run_attachments",
        columns=(
            ColumnSpec("id", "INT NOT NULL AUTO_INCREMENT PRIMARY KEY", "int", False),
            ColumnSpec("conversation_id", "INT NOT NULL", "int", False),
            ColumnSpec("run_id", "INT NULL", "int", True),
            ColumnSpec("filename", "VARCHAR(255) NOT NULL", "varchar", False),
            ColumnSpec("content_type", "VARCHAR(255) NOT NULL", "varchar", False),
            ColumnSpec("size", "INT NOT NULL", "int", False),
            ColumnSpec("bucket", "VARCHAR(255) NOT NULL", "varchar", False),
            ColumnSpec("object_key", "VARCHAR(1024) NOT NULL", "varchar", False),
            ColumnSpec("preview_type", "VARCHAR(32) NOT NULL", "varchar", False),
            ColumnSpec("metadata", "JSON NOT NULL", "json", False),
        ),
        indexes=(
            IndexSpec("ix_run_attachments_conversation_id", "conversation_id"),
            IndexSpec("ix_run_attachments_run_id", "run_id"),
        ),
    ),
    TableSpec(
        name="agent_run_events",
        columns=(
            ColumnSpec("id", "INT NOT NULL AUTO_INCREMENT PRIMARY KEY", "int", False),
            ColumnSpec("run_id", "INT NOT NULL", "int", False),
            ColumnSpec("sequence", "INT NOT NULL", "int", False),
            ColumnSpec("event_type", "VARCHAR(80) NOT NULL", "varchar", False),
            ColumnSpec("data", "JSON NOT NULL", "json", False),
        ),
        indexes=(
            IndexSpec("ix_agent_run_events_run_id", "run_id"),
            IndexSpec("ix_agent_run_events_sequence", "sequence"),
        ),
    ),
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Apply Minimalist Agent database migrations.")
    parser.add_argument(
        "--env-file",
        type=Path,
        default=None,
        help="Environment file to load before reading MYSQL_DSN.",
    )
    parser.add_argument(
        "--migrations-dir",
        type=Path,
        default=DEFAULT_MIGRATIONS_DIR,
        help="Directory containing versioned .sql migrations.",
    )
    parser.add_argument(
        "--wait",
        type=int,
        default=60,
        help="Seconds to wait for MySQL before failing.",
    )
    parser.add_argument(
        "--check-only",
        action="store_true",
        help="Inspect schema and pending migrations without changing the database.",
    )
    parser.add_argument(
        "--skip-repair",
        action="store_true",
        help="Do not add missing columns or indexes after migrations.",
    )
    return parser.parse_args()


def load_environment(env_file: Path | None) -> Path | None:
    if env_file is not None:
        if not env_file.exists():
            raise SystemExit(f"Environment file not found: {env_file}")
        load_dotenv(env_file, override=False)
        return env_file

    for candidate in DEFAULT_ENV_FILES:
        if candidate.exists():
            load_dotenv(candidate, override=False)
            return candidate

    return None


def require_mysql_dsn() -> str:
    dsn = os.getenv("MYSQL_DSN", "").strip()
    if not dsn:
        raise SystemExit("MYSQL_DSN is required.")
    placeholder_tokens = ("<", ">", "CHANGE_ME", "MYSQL_USER", "MYSQL_PASSWORD", "MYSQL_HOST", "MYSQL_DATABASE")
    if any(token in dsn for token in placeholder_tokens):
        raise SystemExit("MYSQL_DSN still contains placeholder values. Fill .env.local first.")
    return dsn


def create_mysql_engine(dsn: str) -> Engine:
    engine = create_engine(dsn, pool_pre_ping=True)
    backend = engine.url.get_backend_name().split("+", maxsplit=1)[0]
    if backend != "mysql":
        raise SystemExit(f"Only MySQL DSNs are supported by this migration runner, got: {backend}")
    return engine


def wait_for_database(engine: Engine, timeout_seconds: int) -> None:
    deadline = time.monotonic() + timeout_seconds
    last_error: Exception | None = None

    while time.monotonic() <= deadline:
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            print("MySQL connection is ready.")
            return
        except Exception as exc:  # noqa: BLE001 - surface the final connection error.
            last_error = exc
            time.sleep(2)

    raise SystemExit(f"Timed out waiting for MySQL. Last error: {last_error}")


def sql_identifier(identifier: str) -> str:
    return f"`{identifier.replace('`', '``')}`"


def split_sql_script(sql: str) -> list[str]:
    lines = []
    for line in sql.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("--"):
            continue
        lines.append(line)
    return [statement.strip() for statement in "\n".join(lines).split(";") if statement.strip()]


def checksum_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def migration_files(migrations_dir: Path) -> list[Path]:
    if not migrations_dir.exists():
        raise SystemExit(f"Migrations directory not found: {migrations_dir}")
    return sorted(path for path in migrations_dir.glob("*.sql") if path.is_file())


def migration_version(path: Path) -> tuple[str, str]:
    stem = path.stem
    if "_" not in stem:
        return stem, stem
    version, name = stem.split("_", maxsplit=1)
    return version, name


def acquire_lock(conn: Connection) -> None:
    acquired = conn.execute(
        text("SELECT GET_LOCK(:lock_name, 30)"),
        {"lock_name": MIGRATION_LOCK_NAME},
    ).scalar()
    if acquired != 1:
        raise SystemExit("Could not acquire database migration lock.")


def release_lock(conn: Connection) -> None:
    conn.execute(text("SELECT RELEASE_LOCK(:lock_name)"), {"lock_name": MIGRATION_LOCK_NAME})


def ensure_schema_migrations_table(conn: Connection) -> None:
    conn.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS schema_migrations (
              version VARCHAR(255) NOT NULL,
              name VARCHAR(255) NOT NULL,
              checksum CHAR(64) NOT NULL,
              applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
              PRIMARY KEY (version)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """
        )
    )
    conn.commit()


def applied_migrations(conn: Connection) -> dict[str, str]:
    rows = conn.execute(text("SELECT version, checksum FROM schema_migrations")).mappings().all()
    return {str(row["version"]): str(row["checksum"]) for row in rows}


def apply_migration(conn: Connection, path: Path) -> None:
    version, name = migration_version(path)
    sql = path.read_text(encoding="utf-8")
    statements = split_sql_script(sql)
    print(f"Applying migration {version}: {name}")
    for statement in statements:
        conn.execute(text(statement))
    conn.execute(
        text(
            """
            INSERT INTO schema_migrations (version, name, checksum)
            VALUES (:version, :name, :checksum)
            """
        ),
        {
            "version": version,
            "name": name,
            "checksum": checksum_file(path),
        },
    )
    conn.commit()


def table_exists(conn: Connection, table_name: str) -> bool:
    return bool(
        conn.execute(
            text(
                """
                SELECT COUNT(*)
                FROM information_schema.tables
                WHERE table_schema = DATABASE()
                  AND table_name = :table_name
                """
            ),
            {"table_name": table_name},
        ).scalar()
    )


def current_columns(conn: Connection, table_name: str) -> dict[str, dict[str, str]]:
    rows = conn.execute(
        text(
            """
            SELECT column_name, data_type, column_type, is_nullable
            FROM information_schema.columns
            WHERE table_schema = DATABASE()
              AND table_name = :table_name
            """
        ),
        {"table_name": table_name},
    ).mappings()
    return {str(row["column_name"]): dict(row) for row in rows}


def current_indexes(conn: Connection, table_name: str) -> set[str]:
    rows = conn.execute(
        text(
            """
            SELECT DISTINCT index_name
            FROM information_schema.statistics
            WHERE table_schema = DATABASE()
              AND table_name = :table_name
            """
        ),
        {"table_name": table_name},
    )
    return {str(row[0]) for row in rows}


def inspect_schema(conn: Connection) -> tuple[list[str], list[str], list[str], list[str]]:
    missing_tables: list[str] = []
    missing_columns: list[str] = []
    missing_indexes: list[str] = []
    warnings: list[str] = []

    for table in EXPECTED_TABLES:
        if not table_exists(conn, table.name):
            missing_tables.append(table.name)
            continue

        columns = current_columns(conn, table.name)
        for column in table.columns:
            existing = columns.get(column.name)
            if existing is None:
                missing_columns.append(f"{table.name}.{column.name}")
                continue

            data_type = str(existing["data_type"]).lower()
            is_nullable = str(existing["is_nullable"]).upper() == "YES"
            if column.data_type == "json":
                compatible_type = data_type in {"json", "longtext"}
            else:
                compatible_type = data_type == column.data_type
            if not compatible_type:
                warnings.append(
                    f"{table.name}.{column.name} type is {existing['column_type']}, expected {column.data_type}"
                )
            if is_nullable != column.nullable:
                expected = "nullable" if column.nullable else "not nullable"
                actual = "nullable" if is_nullable else "not nullable"
                warnings.append(f"{table.name}.{column.name} is {actual}, expected {expected}")

        indexes = current_indexes(conn, table.name)
        for index in table.indexes:
            if index.name not in indexes:
                missing_indexes.append(f"{table.name}.{index.name}")

    return missing_tables, missing_columns, missing_indexes, warnings


def create_missing_column(conn: Connection, table: TableSpec, column: ColumnSpec) -> None:
    conn.execute(
        text(
            "ALTER TABLE "
            f"{sql_identifier(table.name)} ADD COLUMN {sql_identifier(column.name)} {column.ddl}"
        )
    )


def create_missing_index(conn: Connection, table: TableSpec, index: IndexSpec) -> None:
    conn.execute(
        text(
            "CREATE INDEX "
            f"{sql_identifier(index.name)} ON {sql_identifier(table.name)} "
            f"({sql_identifier(index.column)})"
        )
    )


def repair_schema(conn: Connection) -> None:
    for table in EXPECTED_TABLES:
        if not table_exists(conn, table.name):
            raise SystemExit(
                f"Required table {table.name!r} is missing after migrations. "
                "Check migration files before starting the app."
            )

        columns = current_columns(conn, table.name)
        for column in table.columns:
            if column.name not in columns:
                print(f"Adding missing column {table.name}.{column.name}")
                create_missing_column(conn, table, column)

        indexes = current_indexes(conn, table.name)
        for index in table.indexes:
            if index.name not in indexes:
                print(f"Adding missing index {table.name}.{index.name}")
                create_missing_index(conn, table, index)

    conn.commit()


def print_schema_report(
    *,
    pending: Iterable[Path],
    missing_tables: list[str],
    missing_columns: list[str],
    missing_indexes: list[str],
    warnings: list[str],
) -> None:
    pending_list = list(pending)
    if pending_list:
        print("Pending migrations:")
        for path in pending_list:
            version, name = migration_version(path)
            print(f"  - {version}: {name}")
    else:
        print("No pending migrations.")

    if missing_tables:
        print("Missing tables:")
        for item in missing_tables:
            print(f"  - {item}")
    if missing_columns:
        print("Missing columns:")
        for item in missing_columns:
            print(f"  - {item}")
    if missing_indexes:
        print("Missing indexes:")
        for item in missing_indexes:
            print(f"  - {item}")
    if warnings:
        print("Schema warnings:")
        for item in warnings:
            print(f"  - {item}")


def main() -> int:
    args = parse_args()
    env_file = load_environment(args.env_file)
    if env_file is not None:
        print(f"Loaded environment from {env_file}")

    dsn = require_mysql_dsn()
    engine = create_mysql_engine(dsn)
    wait_for_database(engine, args.wait)
    files = migration_files(args.migrations_dir)

    with engine.connect() as conn:
        acquire_lock(conn)
        try:
            ensure_schema_migrations_table(conn)
            applied = applied_migrations(conn)
            pending: list[Path] = []

            for path in files:
                version, _name = migration_version(path)
                checksum = checksum_file(path)
                if version in applied:
                    if applied[version] != checksum:
                        raise SystemExit(
                            f"Migration {version} was already applied with a different checksum."
                        )
                    continue
                pending.append(path)

            missing_tables, missing_columns, missing_indexes, warnings = inspect_schema(conn)

            if args.check_only:
                print_schema_report(
                    pending=pending,
                    missing_tables=missing_tables,
                    missing_columns=missing_columns,
                    missing_indexes=missing_indexes,
                    warnings=warnings,
                )
                return 1 if pending or missing_tables or missing_columns or missing_indexes else 0

            for path in pending:
                apply_migration(conn, path)

            if args.skip_repair:
                print("Skipping schema repair.")
            else:
                repair_schema(conn)

            _missing_tables, _missing_columns, _missing_indexes, final_warnings = inspect_schema(conn)
            if final_warnings:
                print("Schema warnings:")
                for warning in final_warnings:
                    print(f"  - {warning}")

            print("Database schema is ready.")
            return 0
        finally:
            release_lock(conn)


if __name__ == "__main__":
    sys.exit(main())
