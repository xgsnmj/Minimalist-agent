from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import Integer, String, Text, select
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.app.database import Base, JsonPayload, SessionLocal, engine


class AdminAuditEventRecord(Base):
    __tablename__ = "admin_audit_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    actor_id: Mapped[int | None] = mapped_column(Integer, index=True, nullable=True)
    target_type: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    target_id: Mapped[str] = mapped_column(String(120), index=True, nullable=False)
    action: Mapped[str] = mapped_column(String(80), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False, default="")
    before: Mapped[dict[str, Any] | None] = mapped_column(JsonPayload, nullable=True)
    after: Mapped[dict[str, Any] | None] = mapped_column(JsonPayload, nullable=True)
    created_at: Mapped[str] = mapped_column(String(64), nullable=False)


@dataclass
class AdminAuditEvent:
    id: int
    actor_id: int | None
    target_type: str
    target_id: str
    action: str
    reason: str
    before: dict[str, Any] | None
    after: dict[str, Any] | None
    created_at: str


class AdminAuditStore:
    def reset(self) -> None:
        Base.metadata.create_all(bind=engine)
        with SessionLocal() as session:
            session.query(AdminAuditEventRecord).delete()
            session.commit()

    def record(
        self,
        *,
        actor_id: int | None,
        target_type: str,
        target_id: int | str,
        action: str,
        before: dict[str, Any] | None,
        after: dict[str, Any] | None,
        reason: str = "",
    ) -> AdminAuditEvent:
        with SessionLocal() as session:
            record = AdminAuditEventRecord(
                actor_id=actor_id,
                target_type=target_type,
                target_id=str(target_id),
                action=action,
                reason=reason,
                before=before,
                after=after,
                created_at=_now(),
            )
            session.add(record)
            session.commit()
            session.refresh(record)
            return self._event_from_record(record)

    def list_events(self) -> list[AdminAuditEvent]:
        with SessionLocal() as session:
            records = session.scalars(
                select(AdminAuditEventRecord).order_by(AdminAuditEventRecord.id.asc())
            ).all()
            return [self._event_from_record(record) for record in records]

    def _event_from_record(self, record: AdminAuditEventRecord) -> AdminAuditEvent:
        return AdminAuditEvent(
            id=record.id,
            actor_id=record.actor_id,
            target_type=record.target_type,
            target_id=record.target_id,
            action=record.action,
            reason=record.reason,
            before=record.before,
            after=record.after,
            created_at=record.created_at,
        )


def _now() -> str:
    return datetime.now(UTC).isoformat()


admin_audit_store = AdminAuditStore()
