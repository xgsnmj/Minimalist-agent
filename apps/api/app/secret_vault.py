from __future__ import annotations

from datetime import UTC, datetime
import re

from sqlalchemy import Integer, String, Text, select
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.app.database import Base, SessionLocal, engine


class SecretVaultRecord(Base):
    __tablename__ = "secret_vault_entries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    reference: Mapped[str] = mapped_column(String(512), nullable=False, unique=True)
    secret_value: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[str] = mapped_column(String(64), nullable=False)
    updated_at: Mapped[str] = mapped_column(String(64), nullable=False)


class SecretVaultStore:
    def reset(self) -> None:
        Base.metadata.create_all(bind=engine)
        with SessionLocal() as session:
            session.query(SecretVaultRecord).delete()
            session.commit()

    def put(self, *, reference: str, secret_value: str) -> str:
        now = _now()
        with SessionLocal() as session:
            record = session.scalar(
                select(SecretVaultRecord).where(SecretVaultRecord.reference == reference)
            )
            if record is None:
                record = SecretVaultRecord(
                    reference=reference,
                    secret_value=secret_value,
                    created_at=now,
                    updated_at=now,
                )
                session.add(record)
            else:
                record.secret_value = secret_value
                record.updated_at = now
            session.commit()
            return reference

    def get(self, reference: str) -> str | None:
        with SessionLocal() as session:
            record = session.scalar(
                select(SecretVaultRecord).where(SecretVaultRecord.reference == reference)
            )
            return record.secret_value if record is not None else None


def secret_reference_for_model_configuration(*, provider_id: str, name: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", f"{provider_id}-{name}").strip("-").lower()
    return f"secret://models/{slug or 'model'}"


def _now() -> str:
    return datetime.now(UTC).isoformat()


secret_vault_store = SecretVaultStore()
