from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from typing import Any, Protocol

from fastapi import HTTPException, status
from pydantic import BaseModel, Field

from apps.api.app.agent_run_lifecycle import agent_run_lifecycle
from apps.api.app.agent_runs import AgentRun, agent_run_store
from apps.api.app.mcp_servers import mcp_server_store
from apps.api.app.page_read_providers import (
    page_read_provider_store,
    to_page_read_execution_response,
)
from apps.api.app.sandbox_runtime import sandbox_runtime_store
from apps.api.app.search_providers import (
    search_provider_store,
    to_search_execution_response,
)


class ToolCapability(StrEnum):
    MCP = "mcp"
    SANDBOX = "sandbox"
    SEARCH = "search"
    PAGE_READ = "page_read"
    FILE_ACCESS = "file_access"
    ARTIFACT = "artifact"


class ToolCallStatus(StrEnum):
    COMPLETED = "completed"
    FAILED = "failed"
    REJECTED = "rejected"


class ToolCallRequest(BaseModel):
    tool_name: str = Field(min_length=1, max_length=160)
    input: dict[str, Any] = Field(default_factory=dict)


class ToolCallResponse(BaseModel):
    id: int
    run_id: int
    conversation_id: int
    tool_name: str
    capability: ToolCapability
    status: ToolCallStatus
    started_at: str
    ended_at: str
    safe_input: dict[str, Any]
    safe_output: dict[str, Any] | None
    provenance: dict[str, str]
    error_summary: str | None = None


@dataclass
class ToolCall:
    id: int
    run_id: int
    conversation_id: int
    tool_name: str
    capability: ToolCapability
    status: ToolCallStatus
    started_at: str
    ended_at: str
    safe_input: dict[str, Any]
    safe_output: dict[str, Any] | None
    provenance: dict[str, str]
    error_summary: str | None = None


class ToolAdapter(Protocol):
    name: str
    capability: ToolCapability

    def is_authorized(self, *, run: AgentRun, tool_name: str) -> bool: ...

    def execute(
        self,
        *,
        run: AgentRun,
        safe_input: dict[str, Any],
    ) -> dict[str, Any] | None: ...

    def provenance(self, *, run: AgentRun) -> dict[str, str]:
        ...


class SearchToolAdapter:
    name = "search.web"
    capability = ToolCapability.SEARCH

    def is_authorized(self, *, run: AgentRun, tool_name: str) -> bool:
        return run.capability_snapshot.capability_policy.search_enabled

    def execute(
        self,
        *,
        run: AgentRun,
        safe_input: dict[str, Any],
    ) -> dict[str, Any]:
        query = str(safe_input.get("query", ""))
        execution = search_provider_store.search(query)
        return to_search_execution_response(execution).model_dump(mode="json")

    def provenance(self, *, run: AgentRun) -> dict[str, str]:
        configuration = search_provider_store.get_provenance_configuration()
        return {
            "gateway": "agent_tool_gateway",
            "provider": configuration.provider_id.value,
            "provider_configuration_id": str(configuration.id),
        }


class PageReadToolAdapter:
    name = "page.read"
    capability = ToolCapability.PAGE_READ

    def is_authorized(self, *, run: AgentRun, tool_name: str) -> bool:
        return run.capability_snapshot.capability_policy.page_read_enabled

    def execute(
        self,
        *,
        run: AgentRun,
        safe_input: dict[str, Any],
    ) -> dict[str, Any]:
        url = str(safe_input.get("url", ""))
        execution = page_read_provider_store.read(url)
        return to_page_read_execution_response(execution).model_dump(mode="json")

    def provenance(self, *, run: AgentRun) -> dict[str, str]:
        configuration = page_read_provider_store.get_provenance_configuration()
        return {
            "gateway": "agent_tool_gateway",
            "provider": configuration.provider_id.value,
            "provider_configuration_id": str(configuration.id),
        }


class SandboxToolAdapter:
    name = "sandbox.exec"
    capability = ToolCapability.SANDBOX

    def is_authorized(self, *, run: AgentRun, tool_name: str) -> bool:
        return run.capability_snapshot.capability_policy.sandbox_enabled

    def execute(
        self,
        *,
        run: AgentRun,
        safe_input: dict[str, Any],
    ) -> dict[str, Any]:
        execution = sandbox_runtime_store.execute(
            run_id=run.id,
            conversation_id=run.conversation_id,
            command=str(safe_input.get("command", "")),
            artifact_filename=(
                str(safe_input["artifact_filename"])
                if "artifact_filename" in safe_input
                else None
            ),
            artifact_body=(
                str(safe_input["artifact_body"])
                if "artifact_body" in safe_input
                else None
            ),
        )
        return {
            "summary": execution.summary,
            "stdout": execution.stdout,
            "artifact": (
                {
                    "artifact_id": execution.artifact.artifact_id,
                    "filename": execution.artifact.filename,
                    "preview_type": execution.artifact.preview_type,
                }
                if execution.artifact is not None
                else None
            ),
        }

    def provenance(self, *, run: AgentRun) -> dict[str, str]:
        return {
            "gateway": "agent_tool_gateway",
            "provider": sandbox_runtime_store.provider,
        }


@dataclass(frozen=True)
class McpToolAdapter:
    name: str
    capability: ToolCapability = ToolCapability.MCP

    def is_authorized(self, *, run: AgentRun, tool_name: str) -> bool:
        return mcp_server_store.is_tool_authorized(
            agent_id=run.capability_snapshot.agent_id,
            server_ids=run.capability_snapshot.capability_policy.mcp_server_ids,
            tool_name=tool_name,
        )

    def execute(
        self,
        *,
        run: AgentRun,
        safe_input: dict[str, Any],
    ) -> dict[str, Any]:
        server_id = mcp_server_store.server_id_for_authorized_tool(
            agent_id=run.capability_snapshot.agent_id,
            server_ids=run.capability_snapshot.capability_policy.mcp_server_ids,
            tool_name=self.name,
        )
        return {
            "summary": f"{self.name} completed.",
            "server_id": server_id,
        }

    def provenance(self, *, run: AgentRun) -> dict[str, str]:
        provenance = {
            "gateway": "agent_tool_gateway",
            "provider": "mcp",
        }
        server_id = mcp_server_store.server_id_for_authorized_tool(
            agent_id=run.capability_snapshot.agent_id,
            server_ids=run.capability_snapshot.capability_policy.mcp_server_ids,
            tool_name=self.name,
        )
        if server_id is not None:
            provenance["server_id"] = str(server_id)
        return provenance


DEFAULT_TOOL_ADAPTERS: tuple[ToolAdapter, ...] = (
    SearchToolAdapter(),
    PageReadToolAdapter(),
    SandboxToolAdapter(),
)

REGISTERED_TOOLS = {
    adapter.name: adapter
    for adapter in DEFAULT_TOOL_ADAPTERS
}

MCP_TOOL_PREFIX = "mcp."

SENSITIVE_INPUT_KEYS = {
    "api_key",
    "authorization",
    "cookie",
    "password",
    "secret",
    "token",
}


class AgentToolGatewayStore:
    def __init__(self) -> None:
        self.reset()

    def reset(self) -> None:
        self._next_id = 1
        self._tool_calls: dict[int, ToolCall] = {}
        self._adapters: dict[str, ToolAdapter] = dict(REGISTERED_TOOLS)

    def register_adapter(self, adapter: ToolAdapter) -> None:
        self._adapters[adapter.name] = adapter

    def invoke_for_user(
        self,
        *,
        owner_user_id: int,
        run_id: int,
        request: ToolCallRequest,
    ) -> ToolCall:
        run = agent_run_store.get_for_user(owner_user_id=owner_user_id, run_id=run_id)
        adapter = self._tool_adapter(run, request.tool_name)
        safe_input = project_safe_payload(request.input)
        started_at = "just now"
        ended_at = "just now"
        if not adapter.is_authorized(run=run, tool_name=adapter.name):
            tool_call = self._record(
                run=run,
                adapter=adapter,
                status=ToolCallStatus.REJECTED,
                started_at=started_at,
                ended_at=ended_at,
                safe_input=safe_input,
                safe_output=None,
                provenance=adapter.provenance(run=run),
                error_summary="Tool is not authorized for this Agent Run.",
            )
            self._emit_tool_event(owner_user_id=owner_user_id, tool_call=tool_call)
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=tool_call.error_summary,
            )

        try:
            execution = adapter.execute(run=run, safe_input=safe_input)
            safe_output = execution or {"summary": f"{adapter.name} completed."}
            status_value = ToolCallStatus.COMPLETED
            error_summary = None
        except HTTPException as exc:
            safe_output = None
            status_value = ToolCallStatus.FAILED
            error_summary = str(exc.detail)
        except Exception:
            safe_output = None
            status_value = ToolCallStatus.FAILED
            error_summary = "Tool execution failed."
        tool_call = self._record(
            run=run,
            adapter=adapter,
            status=status_value,
            started_at=started_at,
            ended_at=ended_at,
            safe_input=safe_input,
            safe_output=safe_output,
            provenance=adapter.provenance(run=run),
            error_summary=error_summary,
        )
        self._emit_tool_event(owner_user_id=owner_user_id, tool_call=tool_call)
        if tool_call.status == ToolCallStatus.FAILED:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=tool_call.error_summary,
            )
        return tool_call

    def list_for_user(self, *, owner_user_id: int, run_id: int) -> list[ToolCall]:
        agent_run_store.get_for_user(owner_user_id=owner_user_id, run_id=run_id)
        return self.list_for_run(run_id=run_id)

    def list_for_run(self, *, run_id: int) -> list[ToolCall]:
        return [
            tool_call
            for tool_call in sorted(self._tool_calls.values(), key=lambda item: item.id)
            if tool_call.run_id == run_id
        ]

    def _record(
        self,
        *,
        run: AgentRun,
        adapter: ToolAdapter,
        status: ToolCallStatus,
        started_at: str,
        ended_at: str,
        safe_input: dict[str, Any],
        safe_output: dict[str, Any] | None,
        provenance: dict[str, str],
        error_summary: str | None,
    ) -> ToolCall:
        tool_call = ToolCall(
            id=self._next_id,
            run_id=run.id,
            conversation_id=run.conversation_id,
            tool_name=adapter.name,
            capability=adapter.capability,
            status=status,
            started_at=started_at,
            ended_at=ended_at,
            safe_input=safe_input,
            safe_output=safe_output,
            provenance=provenance,
            error_summary=error_summary,
        )
        self._next_id += 1
        self._tool_calls[tool_call.id] = tool_call
        return tool_call

    def _emit_tool_event(self, *, owner_user_id: int, tool_call: ToolCall) -> None:
        agent_run_lifecycle.append_tool_call_event_for_user(
            owner_user_id=owner_user_id,
            run_id=tool_call.run_id,
            tool_call=to_tool_call_response(tool_call).model_dump(mode="json"),
        )

    def _tool_adapter(self, run: AgentRun, tool_name: str) -> ToolAdapter:
        if tool_name.startswith(MCP_TOOL_PREFIX):
            if not mcp_server_store.is_tool_discovered(
                server_ids=run.capability_snapshot.capability_policy.mcp_server_ids,
                tool_name=tool_name,
            ):
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Tool not found.",
                )
            return McpToolAdapter(name=tool_name)
        adapter = self._adapters.get(tool_name)
        if adapter is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Tool not found.",
            )
        return adapter


def project_safe_payload(payload: dict[str, Any]) -> dict[str, Any]:
    safe_payload: dict[str, Any] = {}
    for key, value in payload.items():
        if key.lower() in SENSITIVE_INPUT_KEYS:
            continue
        if isinstance(value, dict):
            safe_payload[key] = project_safe_payload(value)
        elif isinstance(value, list):
            safe_payload[key] = [
                project_safe_payload(item) if isinstance(item, dict) else item
                for item in value
            ]
        else:
            safe_payload[key] = value
    return safe_payload


def to_tool_call_response(tool_call: ToolCall) -> ToolCallResponse:
    return ToolCallResponse(
        id=tool_call.id,
        run_id=tool_call.run_id,
        conversation_id=tool_call.conversation_id,
        tool_name=tool_call.tool_name,
        capability=tool_call.capability,
        status=tool_call.status,
        started_at=tool_call.started_at,
        ended_at=tool_call.ended_at,
        safe_input=tool_call.safe_input,
        safe_output=tool_call.safe_output,
        provenance=tool_call.provenance,
        error_summary=tool_call.error_summary,
    )


agent_tool_gateway_store = AgentToolGatewayStore()
