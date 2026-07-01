from __future__ import annotations

from typing import Any

from fastapi import HTTPException, status
from pydantic import BaseModel

from apps.api.app.agent_runs import (
    AgentRun,
    AgentRunStatus,
    RunCapabilitySnapshotResponse,
    agent_run_store,
)
from apps.api.app.artifacts import ArtifactResponse, artifact_store
from apps.api.app.run_event_log import RunEvent, run_event_log_store
from apps.api.app.tool_gateway import (
    ToolCallResponse,
    agent_tool_gateway_store,
    to_tool_call_response,
)


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
    ) -> RunAuditListResponse:
        runs = [
            run
            for run in agent_run_store.list_all()
            if self._matches_filters(
                run,
                status_filter=status_filter,
                user_id=user_id,
                agent_id=agent_id,
                model_configuration_id=model_configuration_id,
            )
        ]
        runs = sorted(runs, key=lambda run: run.id, reverse=True)
        return RunAuditListResponse(
            runs=[self._summary_response(run) for run in runs],
            retention=RunAuditRetentionResponse(
                full_trace_retention_days=FULL_TRACE_RETENTION_DAYS,
                policy="Full Trace records are retained for 90 days by default.",
            ),
            storage=self._storage_response(agent_run_store.list_all()),
        )

    def detail(self, run_id: int) -> RunAuditDetailResponse:
        run = agent_run_store.get(run_id)
        artifacts = artifact_store.list_for_conversation(run.conversation_id)
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
            tool_calls=[
                to_tool_call_response(tool_call)
                for tool_call in agent_tool_gateway_store.list_for_run(run_id=run.id)
            ],
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
                for event in run_event_log_store.list_after(run_id=run.id, after_sequence=0)
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
        run: AgentRun,
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

    def _summary_response(self, run: AgentRun) -> RunAuditSummaryResponse:
        return RunAuditSummaryResponse(
            id=run.id,
            conversation_id=run.conversation_id,
            owner_user_id=run.owner_user_id,
            agent_id=run.capability_snapshot.agent_id,
            status=run.status,
            selected_model_configuration_id=run.capability_snapshot.selected_model_configuration_id,
            updated_at="just now",
            full_trace_available=bool(run.full_trace),
            tool_call_count=len(agent_tool_gateway_store.list_for_run(run_id=run.id)),
            artifact_count=len(artifact_store.list_for_conversation(run.conversation_id)),
        )

    def _storage_response(self, runs: list[AgentRun]) -> RunAuditStorageResponse:
        artifact_ids: set[int] = set()
        artifact_bytes = 0
        for run in runs:
            for artifact in artifact_store.list_for_conversation(run.conversation_id):
                if artifact.id in artifact_ids:
                    continue
                artifact_ids.add(artifact.id)
                artifact_bytes += artifact.size
        return RunAuditStorageResponse(
            artifact_count=len(artifact_ids),
            artifact_bytes=artifact_bytes,
            retained_full_trace_count=sum(1 for run in runs if run.full_trace),
        )

    def _capability_snapshot_response(self, run: AgentRun) -> RunCapabilitySnapshotResponse:
        return RunCapabilitySnapshotResponse(
            agent_id=run.capability_snapshot.agent_id,
            agent_instruction_snapshot=run.capability_snapshot.agent_instruction_snapshot,
            process_visibility=run.capability_snapshot.process_visibility,
            selected_model_configuration_id=run.capability_snapshot.selected_model_configuration_id,
            default_model_configuration_id=run.capability_snapshot.default_model_configuration_id,
            allowed_model_configuration_ids=run.capability_snapshot.allowed_model_configuration_ids,
            capability_policy=run.capability_snapshot.capability_policy,
        )


run_audit_store = RunAuditStore()
