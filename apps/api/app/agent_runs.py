from dataclasses import dataclass, field
from enum import StrEnum
import json

from fastapi import HTTPException, status
from pydantic import BaseModel, Field

from apps.api.app.agents import Agent, AgentCapabilityPolicyResponse
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
    selected_model_configuration_id: int | None
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
    selected_model_configuration_id: int | None
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


class AgentRunStore:
    def __init__(self) -> None:
        self.reset()

    def reset(self) -> None:
        self._next_id = 1
        self._runs: dict[int, AgentRun] = {}

    def create(
        self,
        *,
        conversation_id: int,
        owner_user_id: int,
        capability_snapshot: RunCapabilitySnapshot,
        user_message: str,
        events: list[str],
    ) -> AgentRun:
        run = AgentRun(
            id=self._next_id,
            conversation_id=conversation_id,
            owner_user_id=owner_user_id,
            status=AgentRunStatus.QUEUED,
            capability_snapshot=capability_snapshot,
            user_message=user_message,
            events=list(events),
        )
        self._next_id += 1
        self._runs[run.id] = run
        return run

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
        return sorted(self._runs.values(), key=lambda run: run.id)

    def _run_or_404(self, run_id: int) -> AgentRun:
        run = self._runs.get(run_id)
        if run is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Agent Run not found.",
            )
        return run


agent_run_store = AgentRunStore()


def capability_snapshot_for_agent(
    *,
    agent: Agent,
    selected_model_configuration_id: int | None,
) -> RunCapabilitySnapshot:
    return RunCapabilitySnapshot(
        agent_id=agent.id,
        agent_instruction_snapshot=agent.instruction,
        process_visibility=agent.process_visibility,
        selected_model_configuration_id=selected_model_configuration_id,
        default_model_configuration_id=agent.default_model_configuration_id,
        allowed_model_configuration_ids=list(agent.allowed_model_configuration_ids),
        capability_policy=AgentCapabilityPolicyResponse(
            mcp_server_ids=list(agent.capability_policy.mcp_server_ids),
            sandbox_enabled=agent.capability_policy.sandbox_enabled,
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
            selected_model_configuration_id=run.capability_snapshot.selected_model_configuration_id,
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
