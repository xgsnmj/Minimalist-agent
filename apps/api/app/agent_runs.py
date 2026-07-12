from dataclasses import dataclass, field
from enum import StrEnum
import json

from fastapi import HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import Boolean, Integer, String, Text, func, select
from sqlalchemy.orm import Mapped, aliased, mapped_column

from apps.api.app.agents import Agent, AgentCapabilityPolicyResponse, AgentSdkSettingsResponse
from apps.api.app.database import Base, JsonPayload, SessionLocal, engine
from apps.api.app.model_configurations import model_configuration_store
from apps.api.app.run_event_log import RunEvent


class AgentRunStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


ACTIVE_RUN_STATUSES = {
    AgentRunStatus.QUEUED,
    AgentRunStatus.RUNNING,
}


class AgentRunCreateRequest(BaseModel):
    message: str = Field(min_length=1)


class RunCapabilitySnapshotResponse(BaseModel):
    agent_id: int
    agent_instruction_snapshot: str
    process_visibility: str
    sdk_settings: AgentSdkSettingsResponse
    selected_model_configuration_id: int | None
    selected_model_configuration_snapshot: dict[str, object] | None = None
    default_model_configuration_id: int | None
    allowed_model_configuration_ids: list[int]
    capability_policy: AgentCapabilityPolicyResponse


class AgentRunResponse(BaseModel):
    id: int
    conversation_id: int
    owner_user_id: int
    status: AgentRunStatus
    capability_snapshot: RunCapabilitySnapshotResponse
    user_message: str
    assistant_message: str | None
    process_summaries: list[str]
    error: str | None
    worker_enqueued: bool
    status_events: list[str]


@dataclass
class RunCapabilitySnapshot:
    agent_id: int
    agent_instruction_snapshot: str
    process_visibility: str
    sdk_settings: AgentSdkSettingsResponse
    selected_model_configuration_id: int | None
    selected_model_configuration_snapshot: dict[str, object] | None
    default_model_configuration_id: int | None
    allowed_model_configuration_ids: list[int]
    capability_policy: AgentCapabilityPolicyResponse


@dataclass
class AgentRun:
    id: int
    conversation_id: int
    owner_user_id: int
    status: AgentRunStatus
    capability_snapshot: RunCapabilitySnapshot
    user_message: str
    assistant_message: str | None = None
    process_summaries: list[str] = field(default_factory=list)
    full_trace: dict[str, object] = field(default_factory=dict)
    error: str | None = None
    worker_enqueued: bool = False
    events: list[str] = field(default_factory=list)
    event_log: list[RunEvent] = field(default_factory=list)

    @property
    def full_trace_available(self) -> bool:
        return bool(self.full_trace)


@dataclass
class AgentRunAuditProjection:
    id: int
    conversation_id: int
    owner_user_id: int
    status: AgentRunStatus
    capability_snapshot: RunCapabilitySnapshot
    full_trace_available: bool


class AgentRunRecord(Base):
    __tablename__ = "agent_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    conversation_id: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    owner_user_id: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    capability_snapshot: Mapped[dict] = mapped_column(JsonPayload, nullable=False)
    user_message: Mapped[str] = mapped_column(Text, nullable=False)
    assistant_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    process_summaries: Mapped[list[str]] = mapped_column(JsonPayload, nullable=False, default=list)
    full_trace: Mapped[dict] = mapped_column(JsonPayload, nullable=False, default=dict)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    worker_enqueued: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    events: Mapped[list[str]] = mapped_column(JsonPayload, nullable=False, default=list)


class AgentRunStore:
    def reset(self) -> None:
        AgentRunRecord.__table__.create(bind=engine, checkfirst=True)
        with SessionLocal() as session:
            session.query(AgentRunRecord).delete()
            session.commit()

    def create(
        self,
        *,
        conversation_id: int,
        owner_user_id: int,
        capability_snapshot: RunCapabilitySnapshot,
        user_message: str,
        events: list[str],
    ) -> AgentRun:
        with SessionLocal() as session:
            record = AgentRunRecord(
                conversation_id=conversation_id,
                owner_user_id=owner_user_id,
                status=AgentRunStatus.QUEUED.value,
                capability_snapshot=_capability_snapshot_payload(capability_snapshot),
                user_message=user_message,
                assistant_message=None,
                process_summaries=[],
                full_trace={},
                error=None,
                worker_enqueued=False,
                events=list(events),
            )
            session.add(record)
            session.commit()
            session.refresh(record)
            return self._run_from_record(record)

    def get_for_user(self, *, owner_user_id: int, run_id: int) -> AgentRun:
        run = self._run_or_404(run_id)
        if run.owner_user_id != owner_user_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Agent Run not found.",
            )
        return run

    def get(self, run_id: int) -> AgentRun:
        return self._run_or_404(run_id)

    def list_all(self) -> list[AgentRun]:
        with SessionLocal() as session:
            records = session.scalars(
                select(AgentRunRecord).order_by(AgentRunRecord.id.asc())
            ).all()
            return [self._run_from_record(record) for record in records]

    def list_all_for_audit(self) -> list[AgentRunAuditProjection]:
        with SessionLocal() as session:
            rows = session.execute(
                select(
                    AgentRunRecord.id,
                    AgentRunRecord.conversation_id,
                    AgentRunRecord.owner_user_id,
                    AgentRunRecord.status,
                    AgentRunRecord.capability_snapshot,
                    (AgentRunRecord.full_trace != {}).label("full_trace_available"),
                )
                .order_by(AgentRunRecord.id.asc())
            ).all()
            return [
                AgentRunAuditProjection(
                    id=row.id,
                    conversation_id=row.conversation_id,
                    owner_user_id=row.owner_user_id,
                    status=AgentRunStatus(row.status),
                    capability_snapshot=_capability_snapshot_from_payload(
                        row.capability_snapshot
                    ),
                    full_trace_available=bool(row.full_trace_available),
                )
                for row in rows
            ]

    def list_for_user(
        self,
        owner_user_id: int,
        *,
        limit: int | None = None,
        offset: int = 0,
    ) -> list[AgentRun]:
        with SessionLocal() as session:
            statement = (
                select(AgentRunRecord)
                .where(AgentRunRecord.owner_user_id == owner_user_id)
                .order_by(AgentRunRecord.id.desc())
            )
            if offset:
                statement = statement.offset(offset)
            if limit is not None:
                statement = statement.limit(limit)
            records = session.scalars(statement).all()
            return [self._run_from_record(record) for record in records]

    def list_for_conversations(
        self,
        *,
        owner_user_id: int,
        conversation_ids: list[int],
        limit_per_conversation: int | None = None,
    ) -> list[AgentRun]:
        if not conversation_ids:
            return []
        if limit_per_conversation == 0:
            return []
        with SessionLocal() as session:
            if limit_per_conversation is not None:
                ranked_runs = (
                    select(
                        AgentRunRecord,
                        func.row_number()
                        .over(
                            partition_by=AgentRunRecord.conversation_id,
                            order_by=AgentRunRecord.id.desc(),
                        )
                        .label("run_rank"),
                    )
                    .where(AgentRunRecord.owner_user_id == owner_user_id)
                    .where(AgentRunRecord.conversation_id.in_(conversation_ids))
                    .subquery()
                )
                run_record = aliased(AgentRunRecord, ranked_runs)
                records = session.scalars(
                    select(run_record)
                    .where(ranked_runs.c.run_rank <= limit_per_conversation)
                    .order_by(run_record.id.asc())
                ).all()
                return [self._run_from_record(record) for record in records]

            records = session.scalars(
                select(AgentRunRecord)
                .where(AgentRunRecord.owner_user_id == owner_user_id)
                .where(AgentRunRecord.conversation_id.in_(conversation_ids))
                .order_by(AgentRunRecord.id.asc())
            ).all()
            return [self._run_from_record(record) for record in records]

    def has_active_run_for_conversation(
        self,
        conversation_id: int,
        active_statuses: set[AgentRunStatus],
    ) -> bool:
        with SessionLocal() as session:
            record_id = session.scalar(
                select(AgentRunRecord.id)
                .where(AgentRunRecord.conversation_id == conversation_id)
                .where(AgentRunRecord.status.in_([status.value for status in active_statuses]))
                .limit(1)
            )
            return record_id is not None

    def latest_active_for_conversation(
        self,
        *,
        owner_user_id: int,
        conversation_id: int,
        active_statuses: set[AgentRunStatus],
    ) -> AgentRun | None:
        with SessionLocal() as session:
            record = session.scalars(
                select(AgentRunRecord)
                .where(AgentRunRecord.owner_user_id == owner_user_id)
                .where(AgentRunRecord.conversation_id == conversation_id)
                .where(AgentRunRecord.status.in_([status.value for status in active_statuses]))
                .order_by(AgentRunRecord.id.desc())
                .limit(1)
            ).first()
            return self._run_from_record(record) if record is not None else None

    def save(self, run: AgentRun) -> AgentRun:
        with SessionLocal() as session:
            record = self._record_or_404(session, run.id)
            record.conversation_id = run.conversation_id
            record.owner_user_id = run.owner_user_id
            record.status = run.status.value
            record.capability_snapshot = _capability_snapshot_payload(run.capability_snapshot)
            record.user_message = run.user_message
            record.assistant_message = run.assistant_message
            record.process_summaries = list(run.process_summaries)
            record.full_trace = dict(run.full_trace)
            record.error = run.error
            record.worker_enqueued = run.worker_enqueued
            record.events = list(run.events)
            session.commit()
            session.refresh(record)
            return self._run_from_record(record)

    def _run_or_404(self, run_id: int) -> AgentRun:
        with SessionLocal() as session:
            return self._run_from_record(self._record_or_404(session, run_id))

    def _record_or_404(self, session, run_id: int) -> AgentRunRecord:
        record = session.get(AgentRunRecord, run_id)
        if record is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Agent Run not found.",
            )
        return record

    def _run_from_record(self, record: AgentRunRecord) -> AgentRun:
        return AgentRun(
            id=record.id,
            conversation_id=record.conversation_id,
            owner_user_id=record.owner_user_id,
            status=AgentRunStatus(record.status),
            capability_snapshot=_capability_snapshot_from_payload(record.capability_snapshot),
            user_message=record.user_message,
            assistant_message=record.assistant_message,
            process_summaries=list(record.process_summaries or []),
            full_trace=dict(record.full_trace or {}),
            error=record.error,
            worker_enqueued=record.worker_enqueued,
            events=list(record.events or []),
        )


agent_run_store = AgentRunStore()


def capability_snapshot_for_agent(
    *,
    agent: Agent,
    selected_model_configuration_id: int | None,
) -> RunCapabilitySnapshot:
    selected_model_snapshot = _selected_model_configuration_snapshot(
        selected_model_configuration_id
    )
    return RunCapabilitySnapshot(
        agent_id=agent.id,
        agent_instruction_snapshot=agent.instruction,
        process_visibility=agent.process_visibility,
        sdk_settings=AgentSdkSettingsResponse(
            max_turns=agent.sdk_settings.max_turns,
            tool_use_behavior=agent.sdk_settings.tool_use_behavior,
            reset_tool_choice=agent.sdk_settings.reset_tool_choice,
        ),
        selected_model_configuration_id=selected_model_configuration_id,
        selected_model_configuration_snapshot=selected_model_snapshot,
        default_model_configuration_id=agent.default_model_configuration_id,
        allowed_model_configuration_ids=list(agent.allowed_model_configuration_ids),
        capability_policy=AgentCapabilityPolicyResponse(
            mcp_server_ids=list(agent.capability_policy.mcp_server_ids),
            search_enabled=agent.capability_policy.search_enabled,
            page_read_enabled=agent.capability_policy.page_read_enabled,
        ),
    )


def to_agent_run_response(run: AgentRun) -> AgentRunResponse:
    return AgentRunResponse(
        id=run.id,
        conversation_id=run.conversation_id,
        owner_user_id=run.owner_user_id,
        status=run.status,
        capability_snapshot=RunCapabilitySnapshotResponse(
            agent_id=run.capability_snapshot.agent_id,
            agent_instruction_snapshot=run.capability_snapshot.agent_instruction_snapshot,
            process_visibility=run.capability_snapshot.process_visibility,
            sdk_settings=run.capability_snapshot.sdk_settings,
            selected_model_configuration_id=run.capability_snapshot.selected_model_configuration_id,
            selected_model_configuration_snapshot=(
                run.capability_snapshot.selected_model_configuration_snapshot
            ),
            default_model_configuration_id=run.capability_snapshot.default_model_configuration_id,
            allowed_model_configuration_ids=run.capability_snapshot.allowed_model_configuration_ids,
            capability_policy=run.capability_snapshot.capability_policy,
        ),
        user_message=run.user_message,
        assistant_message=run.assistant_message,
        error=run.error,
        process_summaries=list(run.process_summaries),
        full_trace=run.full_trace,
        worker_enqueued=run.worker_enqueued,
        status_events=list(run.events),
    )


def _selected_model_configuration_snapshot(
    selected_model_configuration_id: int | None,
) -> dict[str, object] | None:
    if selected_model_configuration_id is None:
        return None
    configuration = model_configuration_store.get(selected_model_configuration_id)
    return {
        "id": configuration.id,
        "provider_id": configuration.provider_id,
        "name": configuration.name,
        "model_name": configuration.model_name,
        "endpoint": configuration.endpoint,
        "credential_reference": configuration.credential_reference,
        "model_settings": dict(configuration.model_settings),
        "native_tool_settings": dict(configuration.native_tool_settings),
        "enabled": configuration.enabled,
    }


def _capability_snapshot_payload(snapshot: RunCapabilitySnapshot) -> dict[str, object]:
    return {
        "agent_id": snapshot.agent_id,
        "agent_instruction_snapshot": snapshot.agent_instruction_snapshot,
        "process_visibility": snapshot.process_visibility,
        "sdk_settings": snapshot.sdk_settings.model_dump(mode="json"),
        "selected_model_configuration_id": snapshot.selected_model_configuration_id,
        "selected_model_configuration_snapshot": snapshot.selected_model_configuration_snapshot,
        "default_model_configuration_id": snapshot.default_model_configuration_id,
        "allowed_model_configuration_ids": list(snapshot.allowed_model_configuration_ids),
        "capability_policy": snapshot.capability_policy.model_dump(mode="json"),
    }


def _capability_snapshot_from_payload(payload: dict[str, object]) -> RunCapabilitySnapshot:
    return RunCapabilitySnapshot(
        agent_id=int(payload["agent_id"]),
        agent_instruction_snapshot=str(payload["agent_instruction_snapshot"]),
        process_visibility=str(payload["process_visibility"]),
        sdk_settings=AgentSdkSettingsResponse.model_validate(
            payload.get("sdk_settings", {})
        ),
        selected_model_configuration_id=payload.get("selected_model_configuration_id"),
        selected_model_configuration_snapshot=payload.get(
            "selected_model_configuration_snapshot"
        ),
        default_model_configuration_id=payload.get("default_model_configuration_id"),
        allowed_model_configuration_ids=[
            int(configuration_id)
            for configuration_id in payload.get("allowed_model_configuration_ids", [])
        ],
        capability_policy=AgentCapabilityPolicyResponse.model_validate(
            payload["capability_policy"]
        ),
    )


def format_sse_event(event: RunEvent) -> str:
    return "\n".join(
        [
            f"id: {event.sequence}",
            f"event: {event.event_type}",
            f"data: {json.dumps(event.data, separators=(',', ':'))}",
            "",
            "",
        ]
    )
