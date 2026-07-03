# PostgreSQL as the primary relational database

Minimalist Agent will replace MySQL with PostgreSQL as its only relational database, updating the database portion of ADR-0007 while keeping FastAPI, Pydantic v2, SQLAlchemy 2, Alembic, Redis, MinIO, and Celery as the rest of the backend foundation. We chose a full replacement rather than dual MySQL/PostgreSQL support because the MVP has no committed MySQL deployment to preserve, and PostgreSQL is a better long-term fit for Agent Run Event Log, Run Audit, Full Trace, Tool Call, Card payload, and Run Capability Snapshot data that will benefit from JSONB, mature indexing, transactions, locking, and operational ecosystem depth.

Tests may continue to use the in-memory SQLite fallback for fast feedback, while local development and deployed runtime environments use PostgreSQL.

PostgreSQL schema changes will use Alembic as the primary migration system. The custom MySQL-oriented migration runner is retired and will not remain a runtime or release path.

SQLAlchemy model metadata is the schema authority. Alembic revisions are the reviewed, executable change history and may be generated from metadata, but PostgreSQL-specific details such as JSONB, indexes, and constraints must be reviewed explicitly.

The replacement does not include a MySQL-to-PostgreSQL data migration path. Existing local and development data can be recreated from PostgreSQL migrations.

The application and migration tooling will use `DATABASE_URL` as the primary database connection variable. Outside tests, `DATABASE_URL` should point to PostgreSQL.

SQLite fallback is only for tests. Development and production startup should fail if `DATABASE_URL` is missing or points to a non-PostgreSQL database.

Local development will target PostgreSQL 18.

Deployment may use either Docker-managed PostgreSQL or an existing external PostgreSQL instance. The application should depend on `DATABASE_URL`, not on a specific middleware hosting mode.

Production deployments should run Alembic migrations as an explicit release step before starting API and worker processes. Local development scripts may run migrations automatically for convenience.

The synchronous SQLAlchemy connection will use `psycopg[binary]` and PostgreSQL URLs in the `postgresql+psycopg://...` form. The MySQL `pymysql` dependency will be removed.

PostgreSQL JSON payload columns will use `JSONB`, including Agent Run Event Log data and Artifact or Run Attachment metadata. If a future feature needs byte-for-byte raw JSON preservation, it should store raw text or an object reference separately rather than weakening these queryable payload columns.

Alembic migrations assume the target PostgreSQL database already exists. Docker-based local development may create the database through container environment variables, while deployments that use existing middleware must provision the database and account before running migrations.
