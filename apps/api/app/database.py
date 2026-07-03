from __future__ import annotations

import os

from sqlalchemy import JSON
from sqlalchemy import create_engine
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.pool import StaticPool


class Base(DeclarativeBase):
    pass


JsonPayload = JSON().with_variant(JSONB(), "postgresql")


def _database_url() -> str:
    app_profile = os.getenv("APP_PROFILE", "").strip().lower()
    database_url = os.getenv("DATABASE_URL", "").strip()
    if not database_url:
        if app_profile in {"development", "production"}:
            raise RuntimeError("DATABASE_URL is required for development and production.")
        return "sqlite+pysqlite:///:memory:"

    backend = database_url.split(":", maxsplit=1)[0].split("+", maxsplit=1)[0]
    if backend == "sqlite" and app_profile in {"", "test"}:
        return database_url
    if backend != "postgresql":
        raise RuntimeError("DATABASE_URL must point to PostgreSQL outside tests.")
    return database_url


def _create_engine():
    database_url = _database_url()
    if database_url.startswith("sqlite"):
        return create_engine(
            database_url,
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
    return create_engine(database_url, pool_pre_ping=True)


engine = _create_engine()
SessionLocal = sessionmaker(bind=engine, class_=Session, autoflush=False, expire_on_commit=False)


def reset_database() -> None:
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
