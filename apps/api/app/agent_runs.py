from dataclasses import dataclass, field
from enum import StrEnum
import json

from fastapi import HTTPException, status
from pydantic import BaseModel, Field

from apps.api.app.agents import Agent, AgentCapabilityPolicyResponse
from apps.api.app.conversations import (
    AgentConversation,
    ConversationStatus,
    conversation_store,
)
from apps.api.app.run_event_log import RunEvent, run_event_log_store


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

    def create_for_conversation(
        self,
        *,
        conversation: AgentConversation,
        request: AgentRunCreateRequest,
    ) -> AgentRun:
        self._raise_if_conversation_has_active_run(conversation.id)
        conversation_store.append_message(
            conversation_id=conversation.id,
            role="user",
            content=request.message,
        )
        conversation_store.set_status(
            conversation_id=conversation.id,
            conversation_status=ConversationStatus.RUNNING,
        )
        run = AgentRun(
            id=self._next_id,
            conversation_id=conversation.id,
            owner_user_id=conversation.owner_user_id,
            status=AgentRunStatus.QUEUED,
            capability_snapshot=capability_snapshot_for_agent(
                agent=conversation.agent,
                selected_model_configuration_id=conversation.selected_model_configuration_id,
            ),
            user_message=request.message,
            events=["queued"],
        )
        self._next_id += 1
        self._runs[run.id] = run
        self._append_event(
            run,
            event_type="run.status",
            data={"status": AgentRunStatus.QUEUED.value},
        )
        return run

    def mark_worker_enqueued(self, run_id: int) -> AgentRun:
        run = self._run_or_404(run_id)
        run.worker_enqueued = True
        if "worker_enqueued" not in run.events:
            run.events.append("worker_enqueued")
        self._append_event(
            run,
            event_type="run.status",
            data={"status": AgentRunStatus.QUEUED.value, "worker_enqueued": True},
        )
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

    def cancel_for_user(self, *, owner_user_id: int, run_id: int) -> AgentRun:
        run = self.get_for_user(owner_user_id=owner_user_id, run_id=run_id)
        if run.status in ACTIVE_RUN_STATUSES:
            run.status = AgentRunStatus.CANCELLED
            run.events.append("cancelled")
            self._append_event(
                run,
                event_type="run.status",
                data={"status": AgentRunStatus.CANCELLED.value},
            )
            conversation_store.set_status(
                conversation_id=run.conversation_id,
                conversation_status=ConversationStatus.IDLE,
            )
        return run

    def process_with_mock_runtime(self, run_id: int) -> AgentRun:
        run = self._run_or_404(run_id)
        if run.status == AgentRunStatus.CANCELLED:
            return run
        if run.status not in ACTIVE_RUN_STATUSES:
            return run

        run.status = AgentRunStatus.RUNNING
        run.events.append("running")
        self._append_event(
            run,
            event_type="run.status",
            data={"status": AgentRunStatus.RUNNING.value},
        )
        if "failure" in run.user_message.lower():
            run.status = AgentRunStatus.FAILED
            run.error = "Mock Agent Runtime failed."
            run.events.append("failed")
            self._append_event(
                run,
                event_type="run.error",
                data={
                    "status": AgentRunStatus.FAILED.value,
                    "message": run.error,
                },
            )
            conversation_store.set_status(
                conversation_id=run.conversation_id,
                conversation_status=ConversationStatus.IDLE,
            )
            return run

        run.assistant_message = f"Mock Agent Runtime response for: {run.user_message}"
        run.process_summaries = [
            f"Reviewed the Agent Instruction snapshot for conversation {run.conversation_id}.",
            "Used the selected model configuration and completed the request without tool calls.",
        ]
        conversation_store.append_message(
            conversation_id=run.conversation_id,
            role="assistant",
            content=run.assistant_message,
        )
        for summary in run.process_summaries:
            self._append_event(
                run,
                event_type="process.summary",
                data={"summary": summary},
            )
        self._append_event(
            run,
            event_type="message.completed",
            data={
                "role": "assistant",
                "content": run.assistant_message,
            },
        )
        run.status = AgentRunStatus.COMPLETED
        run.events.append("completed")
        self._append_event(
            run,
            event_type="run.status",
            data={"status": AgentRunStatus.COMPLETED.value},
        )
        conversation_store.set_status(
            conversation_id=run.conversation_id,
            conversation_status=ConversationStatus.IDLE,
        )
        return run

    def list_events_after_for_user(
        self,
        *,
        owner_user_id: int,
        run_id: int,
        after_sequence: int,
    ) -> list[RunEvent]:
        self.get_for_user(owner_user_id=owner_user_id, run_id=run_id)
        return run_event_log_store.list_after(run_id=run_id, after_sequence=after_sequence)

    def format_sse_events(
        self,
        *,
        owner_user_id: int,
        run_id: int,
        after_sequence: int,
    ) -> str:
        return "".join(
            format_sse_event(event)
            for event in self.list_events_after_for_user(
                owner_user_id=owner_user_id,
                run_id=run_id,
                after_sequence=after_sequence,
            )
        )

    def append_card_event_for_user(
        self,
        *,
        owner_user_id: int,
        run_id: int,
        conversation_id: int,
        card: dict[str, object],
    ) -> RunEvent:
        run = self.get_for_user(owner_user_id=owner_user_id, run_id=run_id)
        if run.conversation_id != conversation_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Agent Run not found.",
            )
        return self._append_event(
            run,
            event_type="card.rendered",
            data={"card": card},
        )

    def append_tool_call_event_for_user(
        self,
        *,
        owner_user_id: int,
        run_id: int,
        tool_call: dict[str, object],
    ) -> RunEvent:
        run = self.get_for_user(owner_user_id=owner_user_id, run_id=run_id)
        return self._append_event(
            run,
            event_type="tool.call",
            data={"tool_call": tool_call},
        )

    def _raise_if_conversation_has_active_run(self, conversation_id: int) -> None:
        for run in self._runs.values():
            if run.conversation_id == conversation_id and run.status in ACTIVE_RUN_STATUSES:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Agent Conversation already has an active run.",
                )

    def _run_or_404(self, run_id: int) -> AgentRun:
        run = self._runs.get(run_id)
        if run is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Agent Run not found.",
            )
        return run

    def _append_event(
        self,
        run: AgentRun,
        *,
        event_type: str,
        data: dict[str, object],
    ) -> RunEvent:
        event = run_event_log_store.append(
            run_id=run.id,
            event_type=event_type,
            data=data,
        )
        run.event_log.append(event)
        return event


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
