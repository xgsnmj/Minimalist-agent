from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from typing import Any

from fastapi import HTTPException, status
from pydantic import BaseModel, Field

from apps.api.app.agent_runs import AgentRun, agent_run_store
from apps.api.app.mcp_servers import mcp_server_store
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


@dataclass(frozen=True)
class ToolDefinition:
    name: str
    capability: ToolCapability
    provider: str = "mock"


REGISTERED_TOOLS = {
    "search.web": ToolDefinition(
        name="search.web",
        capability=ToolCapability.SEARCH,
    ),
    "page.read": ToolDefinition(
        name="page.read",
        capability=ToolCapability.PAGE_READ,
    ),
    "sandbox.exec": ToolDefinition(
        name="sandbox.exec",
        capability=ToolCapability.SANDBOX,
    ),
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

    def invoke_for_user(
        self,
        *,
        owner_user_id: int,
        run_id: int,
        request: ToolCallRequest,
    ) -> ToolCall:
        run = agent_run_store.get_for_user(owner_user_id=owner_user_id, run_id=run_id)
        definition = self._tool_definition(run, request.tool_name)
        safe_input = project_safe_payload(request.input)
        started_at = "just now"
        ended_at = "just now"
        if not self._is_authorized(run, definition.capability, definition.name):
            tool_call = self._record(
                run=run,
                definition=definition,
                status=ToolCallStatus.REJECTED,
                started_at=started_at,
                ended_at=ended_at,
                safe_input=safe_input,
                safe_output=None,
                provenance=self._provenance_for_definition(run, definition),
                error_summary="Tool is not authorized for this Agent Run.",
            )
            self._emit_tool_event(owner_user_id=owner_user_id, tool_call=tool_call)
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=tool_call.error_summary,
            )

        try:
            execution = self._execute_provider(run, definition, request.tool_name, safe_input)
            safe_output = execution or {"summary": f"{definition.name} completed."}
            status_value = ToolCallStatus.COMPLETED
            error_summary = None
        except HTTPException as exc:
            safe_output = None
            status_value = ToolCallStatus.FAILED
            error_summary = str(exc.detail)
        tool_call = self._record(
            run=run,
            definition=definition,
            status=status_value,
            started_at=started_at,
            ended_at=ended_at,
            safe_input=safe_input,
            safe_output=safe_output,
            provenance=self._provenance_for_definition(run, definition),
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
        return [
            tool_call
            for tool_call in sorted(self._tool_calls.values(), key=lambda item: item.id)
            if tool_call.run_id == run_id
        ]

    def _record(
        self,
        *,
        run: AgentRun,
        definition: ToolDefinition,
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
            tool_name=definition.name,
            capability=definition.capability,
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
        agent_run_store.append_tool_call_event_for_user(
            owner_user_id=owner_user_id,
            run_id=tool_call.run_id,
            tool_call=to_tool_call_response(tool_call).model_dump(mode="json"),
        )

    def _tool_definition(self, run: AgentRun, tool_name: str) -> ToolDefinition:
        if tool_name.startswith(MCP_TOOL_PREFIX):
            if not mcp_server_store.is_tool_discovered(
                server_ids=run.capability_snapshot.capability_policy.mcp_server_ids,
                tool_name=tool_name,
            ):
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Tool not found.",
                )
            return ToolDefinition(
                name=tool_name,
                capability=ToolCapability.MCP,
                provider="mcp",
            )
        definition = REGISTERED_TOOLS.get(tool_name)
        if definition is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Tool not found.",
            )
        return definition

    def _is_authorized(self, run: AgentRun, capability: ToolCapability, tool_name: str) -> bool:
        policy = run.capability_snapshot.capability_policy
        if capability == ToolCapability.SEARCH:
            return policy.search_enabled
        if capability == ToolCapability.PAGE_READ:
            return policy.page_read_enabled
        if capability == ToolCapability.SANDBOX:
            return policy.sandbox_enabled
        if capability == ToolCapability.MCP:
            return mcp_server_store.is_tool_authorized(
                agent_id=run.capability_snapshot.agent_id,
                server_ids=policy.mcp_server_ids,
                tool_name=tool_name,
            )
        return False

    def _mcp_server_id_for_tool(self, run: AgentRun, tool_name: str) -> int | None:
        return mcp_server_store.server_id_for_authorized_tool(
            agent_id=run.capability_snapshot.agent_id,
            server_ids=run.capability_snapshot.capability_policy.mcp_server_ids,
            tool_name=tool_name,
        )

    def _provenance_for_definition(
        self,
        run: AgentRun,
        definition: ToolDefinition,
    ) -> dict[str, str]:
        provenance = {
            "gateway": "agent_tool_gateway",
            "provider": definition.provider,
        }
        if definition.capability == ToolCapability.SEARCH:
            configuration = search_provider_store.get_provenance_configuration()
            provenance["provider"] = configuration.provider_id.value
            provenance["provider_configuration_id"] = str(configuration.id)
        if definition.capability == ToolCapability.MCP:
            server_id = self._mcp_server_id_for_tool(run, definition.name)
            if server_id is not None:
                provenance["server_id"] = str(server_id)
        return provenance

    def _execute_provider(
        self,
        run: AgentRun,
        definition: ToolDefinition,
        tool_name: str,
        safe_input: dict[str, Any],
    ) -> dict[str, Any] | None:
        if definition.capability == ToolCapability.SEARCH and tool_name == "search.web":
            query = str(safe_input.get("query", ""))
            execution = search_provider_store.search(query)
            return to_search_execution_response(execution).model_dump(mode="json")
        if definition.capability == ToolCapability.MCP:
            server_id = self._mcp_server_id_for_tool(run, tool_name)
            return {
                "summary": f"{tool_name} completed.",
                "server_id": server_id,
            }
        return None


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
