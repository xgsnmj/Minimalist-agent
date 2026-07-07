from __future__ import annotations

from typing import Any

from fastapi import HTTPException, status
from pydantic import BaseModel

from apps.api.app.agent_runs import (
    AgentRun,
    AgentRunAuditProjection,
    AgentRunStatus,
    RunCapabilitySnapshotResponse,
    agent_run_store,
)
from apps.api.app.artifacts import ArtifactResponse, artifact_store
from apps.api.app.run_event_log import RunEvent, run_event_log_store
from apps.api.app.runtime_tools import ToolCallResponse, tool_call_responses_from_events


FULL_TRACE_RETENTION_DAYS = 90


class RunAuditSummaryResponse(BaseModel):
    id: int
    conversation_id: int
    owner_user_id: int
    agent_id: int
    status: AgentRunStatus
    selected_model_configuration_id: int | None
    updated_at: str
    full_trace_available: bool
    tool_call_count: int
    artifact_count: int


class RunAuditRetentionResponse(BaseModel):
    full_trace_retention_days: int
    policy: str


class RunAuditStorageResponse(BaseModel):
    artifact_count: int
    artifact_bytes: int
    retained_full_trace_count: int


class RunAuditListResponse(BaseModel):
    runs: list[RunAuditSummaryResponse]
    retention: RunAuditRetentionResponse
    storage: RunAuditStorageResponse


class RunAuditEventResponse(BaseModel):
    sequence: int
    event_type: str
    data: dict[str, Any]


class RunAuditDetailResponse(BaseModel):
    id: int
    conversation_id: int
    owner_user_id: int
    status: AgentRunStatus
    error: str | None
    user_message: str
    assistant_message: str | None
    process_summaries: list[str]
    capability_snapshot: RunCapabilitySnapshotResponse
    tool_calls: list[ToolCallResponse]
    artifacts: list[ArtifactResponse]
    events: list[RunAuditEventResponse]
    full_trace_available: bool
    full_trace_retention_days: int


class FullTraceResponse(BaseModel):
    run_id: int
    retention_days: int
    trace: dict[str, Any]


class RunAuditStore:
    def list_runs(
        self,
        *,
        status_filter: AgentRunStatus | None,
        user_id: int | None,
        agent_id: int | None,
        model_configuration_id: int | None,
        limit: int | None = None,
        offset: int = 0,
    ) -> RunAuditListResponse:
        all_runs = agent_run_store.list_all_for_audit()
        runs = [
            run
            for run in all_runs
            if self._matches_filters(
                run,
                status_filter=status_filter,
                user_id=user_id,
                agent_id=agent_id,
                model_configuration_id=model_configuration_id,
            )
        ]
        runs = sorted(runs, key=lambda run: run.id, reverse=True)
        if offset:
            runs = runs[offset:]
        if limit is not None:
            runs = runs[:limit]
        tool_call_counts = self._tool_call_counts_by_run(runs)
        artifacts_by_conversation = artifact_store.list_for_conversations(
            sorted({run.conversation_id for run in all_runs})
        )
        return RunAuditListResponse(
            runs=[
                self._summary_response(
                    run,
                    tool_call_count=tool_call_counts.get(run.id, 0),
                    artifact_count=len(artifacts_by_conversation.get(run.conversation_id, [])),
                )
                for run in runs
            ],
            retention=RunAuditRetentionResponse(
                full_trace_retention_days=FULL_TRACE_RETENTION_DAYS,
                policy="Full Trace records are retained for 90 days by default.",
            ),
            storage=self._storage_response(
                runs=all_runs,
                artifacts_by_conversation=artifacts_by_conversation,
            ),
        )

    def detail(self, run_id: int) -> RunAuditDetailResponse:
        run = agent_run_store.get(run_id)
        artifacts = artifact_store.list_for_conversation(run.conversation_id)
        events = run_event_log_store.list_after(run_id=run.id, after_sequence=0)
        return RunAuditDetailResponse(
            id=run.id,
            conversation_id=run.conversation_id,
            owner_user_id=run.owner_user_id,
            status=run.status,
            error=run.error,
            user_message=run.user_message,
            assistant_message=run.assistant_message,
            process_summaries=list(run.process_summaries),
            capability_snapshot=self._capability_snapshot_response(run),
            tool_calls=tool_call_responses_from_events(events),
            artifacts=[
                ArtifactResponse(
                    id=artifact.id,
                    conversation_id=artifact.conversation_id,
                    filename=artifact.filename,
                    content_type=artifact.content_type,
                    size=artifact.size,
                    preview_type=artifact.preview_type,
                )
                for artifact in artifacts
            ],
            events=[
                RunAuditEventResponse(
                    sequence=event.sequence,
                    event_type=event.event_type,
                    data=event.data,
                )
                for event in events
            ],
            full_trace_available=bool(run.full_trace),
            full_trace_retention_days=FULL_TRACE_RETENTION_DAYS,
        )

    def full_trace(self, run_id: int) -> FullTraceResponse:
        run = agent_run_store.get(run_id)
        if not run.full_trace:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Full Trace not found.",
            )
        return FullTraceResponse(
            run_id=run.id,
            retention_days=FULL_TRACE_RETENTION_DAYS,
            trace=run.full_trace,
        )

    def _matches_filters(
        self,
        run: AgentRun | AgentRunAuditProjection,
        *,
        status_filter: AgentRunStatus | None,
        user_id: int | None,
        agent_id: int | None,
        model_configuration_id: int | None,
    ) -> bool:
        if status_filter is not None and run.status != status_filter:
            return False
        if user_id is not None and run.owner_user_id != user_id:
            return False
        if agent_id is not None and run.capability_snapshot.agent_id != agent_id:
            return False
        if (
            model_configuration_id is not None
            and run.capability_snapshot.selected_model_configuration_id != model_configuration_id
        ):
            return False
        return True

    def _summary_response(
        self,
        run: AgentRun | AgentRunAuditProjection,
        *,
        tool_call_count: int,
        artifact_count: int,
    ) -> RunAuditSummaryResponse:
        return RunAuditSummaryResponse(
            id=run.id,
            conversation_id=run.conversation_id,
            owner_user_id=run.owner_user_id,
            agent_id=run.capability_snapshot.agent_id,
            status=run.status,
            selected_model_configuration_id=run.capability_snapshot.selected_model_configuration_id,
            updated_at="just now",
            full_trace_available=run.full_trace_available,
            tool_call_count=tool_call_count,
            artifact_count=artifact_count,
        )

    def _storage_response(
        self,
        *,
        runs: list[AgentRun | AgentRunAuditProjection],
        artifacts_by_conversation: dict[int, list],
    ) -> RunAuditStorageResponse:
        artifact_ids: set[int] = set()
        artifact_bytes = 0
        for run in runs:
            for artifact in artifacts_by_conversation.get(run.conversation_id, []):
                if artifact.id in artifact_ids:
                    continue
                artifact_ids.add(artifact.id)
                artifact_bytes += artifact.size
        return RunAuditStorageResponse(
            artifact_count=len(artifact_ids),
            artifact_bytes=artifact_bytes,
            retained_full_trace_count=sum(1 for run in runs if run.full_trace_available),
        )

    def _tool_call_counts_by_run(
        self,
        runs: list[AgentRun | AgentRunAuditProjection],
    ) -> dict[int, int]:
        run_ids = [run.id for run in runs]
        events_by_run: dict[int, list[RunEvent]] = {run_id: [] for run_id in run_ids}
        for event in run_event_log_store.list_for_runs_by_type(
            run_ids=run_ids,
            event_types={"tool.call"},
        ):
            events_by_run.setdefault(event.run_id, []).append(event)
        return {
            run_id: len(tool_call_responses_from_events(events))
            for run_id, events in events_by_run.items()
        }

    def _capability_snapshot_response(self, run: AgentRun) -> RunCapabilitySnapshotResponse:
        return RunCapabilitySnapshotResponse(
            agent_id=run.capability_snapshot.agent_id,
            agent_instruction_snapshot=run.capability_snapshot.agent_instruction_snapshot,
            process_visibility=run.capability_snapshot.process_visibility,
            selected_model_configuration_id=run.capability_snapshot.selected_model_configuration_id,
            selected_model_configuration_snapshot=(
                run.capability_snapshot.selected_model_configuration_snapshot
            ),
            default_model_configuration_id=run.capability_snapshot.default_model_configuration_id,
            allowed_model_configuration_ids=run.capability_snapshot.allowed_model_configuration_ids,
            capability_policy=run.capability_snapshot.capability_policy,
        )


run_audit_store = RunAuditStore()
