from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from sqlalchemy import JSON, Integer, String, select
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.app.database import Base, SessionLocal, engine


class RunEventRecord(Base):
    __tablename__ = "agent_run_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    run_id: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    sequence: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    event_type: Mapped[str] = mapped_column(String(80), nullable=False)
    data: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)


@dataclass
class RunEvent:
    run_id: int
    sequence: int
    event_type: str
    data: dict[str, Any]


class RunEventLogStore:
    def append(self, *, run_id: int, event_type: str, data: dict[str, Any]) -> RunEvent:
        with SessionLocal() as session:
            next_sequence = self._next_sequence(session, run_id)
            record = RunEventRecord(
                run_id=run_id,
                sequence=next_sequence,
                event_type=event_type,
                data={"run_id": run_id, **data},
            )
            session.add(record)
            session.commit()
            return RunEvent(
                run_id=record.run_id,
                sequence=record.sequence,
                event_type=record.event_type,
                data=record.data,
            )

    def list_after(self, *, run_id: int, after_sequence: int) -> list[RunEvent]:
        with SessionLocal() as session:
            records = session.scalars(
                select(RunEventRecord)
                .where(RunEventRecord.run_id == run_id)
                .where(RunEventRecord.sequence > after_sequence)
                .order_by(RunEventRecord.sequence.asc())
            ).all()
            return [
                RunEvent(
                    run_id=record.run_id,
                    sequence=record.sequence,
                    event_type=record.event_type,
                    data=record.data,
                )
                for record in records
            ]

    def reset_for_tests(self) -> None:
        from apps.api.app.database import reset_database

        reset_database()

    def _next_sequence(self, session, run_id: int) -> int:
        result = session.scalar(
            select(RunEventRecord.sequence)
            .where(RunEventRecord.run_id == run_id)
            .order_by(RunEventRecord.sequence.desc())
            .limit(1)
        )
        return int(result or 0) + 1


run_event_log_store = RunEventLogStore()

Base.metadata.create_all(bind=engine)
