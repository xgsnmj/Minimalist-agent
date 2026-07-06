from __future__ import annotations

import json
import re
from enum import StrEnum
from typing import Any

from agents import FunctionTool
from fastapi import HTTPException
from pydantic import BaseModel, Field

from apps.api.app.agent_runs import AgentRun
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


class RuntimeToolCapability(StrEnum):
    MCP = "mcp"
    SANDBOX = "sandbox"
    SEARCH = "search"
    PAGE_READ = "page_read"


class RuntimeToolStatus(StrEnum):
    COMPLETED = "completed"
    FAILED = "failed"
    REJECTED = "rejected"
    RUNNING = "running"


class ToolCallResponse(BaseModel):
    id: str | int
    run_id: int
    conversation_id: int | None = None
    tool_name: str
    capability: RuntimeToolCapability | str
    status: RuntimeToolStatus | str
    started_at: str | None = None
    ended_at: str | None = None
    safe_input: dict[str, Any] = Field(default_factory=dict)
    safe_output: dict[str, Any] | None = None
    provenance: dict[str, str] = Field(default_factory=dict)
    error_summary: str | None = None


SENSITIVE_INPUT_KEYS = {
    "api_key",
    "authorization",
    "cookie",
    "password",
    "secret",
    "token",
}

_STATIC_SDK_TOOL_NAMES = {
    "search.web": "search_web",
    "page.read": "page_read",
    "sandbox.exec": "sandbox_exec",
}
_PUBLIC_TOOL_NAMES_BY_SDK_NAME = {
    sdk_name: public_name for public_name, sdk_name in _STATIC_SDK_TOOL_NAMES.items()
}
_SDK_TOOL_NAME_PATTERN = re.compile(r"[^A-Za-z0-9_-]+")


def sdk_tools_for_run(run: AgentRun) -> list[FunctionTool]:
    policy = run.capability_snapshot.capability_policy
    tools: list[FunctionTool] = []
    if policy.search_enabled:
        tools.append(_search_tool(run))
    if policy.page_read_enabled:
        tools.append(_page_read_tool(run))
    if policy.sandbox_enabled:
        tools.append(_sandbox_tool(run))
    tools.extend(_mcp_tools(run))
    return tools


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


def public_tool_name_for_sdk_name(tool_name: str) -> str:
    return _PUBLIC_TOOL_NAMES_BY_SDK_NAME.get(tool_name, tool_name)


def capability_for_tool_name(tool_name: str) -> RuntimeToolCapability | str:
    public_name = public_tool_name_for_sdk_name(tool_name)
    if public_name == "search.web":
        return RuntimeToolCapability.SEARCH
    if public_name == "page.read":
        return RuntimeToolCapability.PAGE_READ
    if public_name == "sandbox.exec":
        return RuntimeToolCapability.SANDBOX
    if public_name.startswith("mcp."):
        return RuntimeToolCapability.MCP
    return "openai_agents_sdk"


def tool_call_responses_from_events(events) -> list[ToolCallResponse]:
    tool_calls_by_id: dict[str, dict[str, Any]] = {}
    order: list[str] = []
    for event in events:
        if event.event_type != "tool.call":
            continue
        tool_call = event.data.get("tool_call")
        if not isinstance(tool_call, dict):
            continue
        tool_call_id = str(tool_call.get("id") or f"tool-call-{event.sequence}")
        if tool_call_id not in tool_calls_by_id:
            order.append(tool_call_id)
            tool_calls_by_id[tool_call_id] = {}
        merged = {**tool_calls_by_id[tool_call_id], **tool_call}
        merged.pop("ag_ui_phase", None)
        tool_calls_by_id[tool_call_id] = merged
    return [
        ToolCallResponse.model_validate(tool_calls_by_id[tool_call_id])
        for tool_call_id in order
    ]


def _search_tool(run: AgentRun) -> FunctionTool:
    async def invoke(_ctx, input_json: str) -> str:
        safe_input = _safe_tool_input(input_json)
        if not run.capability_snapshot.capability_policy.search_enabled:
            return _tool_failure_payload(
                run=run,
                tool_name="search.web",
                capability=RuntimeToolCapability.SEARCH,
                safe_input=safe_input,
                provenance=_search_provenance(),
                error_summary="Tool is not authorized for this Agent Run.",
            )
        try:
            query = str(safe_input.get("query", ""))
            execution = search_provider_store.search(query)
            safe_output = to_search_execution_response(execution).model_dump(mode="json")
            return _tool_success_payload(
                run=run,
                tool_name="search.web",
                capability=RuntimeToolCapability.SEARCH,
                safe_input=safe_input,
                safe_output=safe_output,
                provenance=_search_provenance(),
            )
        except Exception as exc:
            return _tool_failure_payload(
                run=run,
                tool_name="search.web",
                capability=RuntimeToolCapability.SEARCH,
                safe_input=safe_input,
                provenance=_search_provenance(),
                error_summary=_error_summary(exc),
            )

    return _function_tool(
        public_name="search.web",
        sdk_name="search_web",
        description="Search the web through the configured search provider.",
        params_json_schema={
            "type": "object",
            "properties": {"query": {"type": "string"}},
            "required": ["query"],
            "additionalProperties": False,
        },
        invoke=invoke,
    )


def _page_read_tool(run: AgentRun) -> FunctionTool:
    async def invoke(_ctx, input_json: str) -> str:
        safe_input = _safe_tool_input(input_json)
        if not run.capability_snapshot.capability_policy.page_read_enabled:
            return _tool_failure_payload(
                run=run,
                tool_name="page.read",
                capability=RuntimeToolCapability.PAGE_READ,
                safe_input=safe_input,
                provenance=_page_read_provenance(),
                error_summary="Tool is not authorized for this Agent Run.",
            )
        try:
            url = str(safe_input.get("url", ""))
            execution = page_read_provider_store.read(url)
            safe_output = to_page_read_execution_response(execution).model_dump(mode="json")
            return _tool_success_payload(
                run=run,
                tool_name="page.read",
                capability=RuntimeToolCapability.PAGE_READ,
                safe_input=safe_input,
                safe_output=safe_output,
                provenance=_page_read_provenance(),
            )
        except Exception as exc:
            return _tool_failure_payload(
                run=run,
                tool_name="page.read",
                capability=RuntimeToolCapability.PAGE_READ,
                safe_input=safe_input,
                provenance=_page_read_provenance(),
                error_summary=_error_summary(exc),
            )

    return _function_tool(
        public_name="page.read",
        sdk_name="page_read",
        description="Read and summarize a known HTTP(S) page through the configured reader.",
        params_json_schema={
            "type": "object",
            "properties": {"url": {"type": "string"}},
            "required": ["url"],
            "additionalProperties": False,
        },
        invoke=invoke,
    )


def _sandbox_tool(run: AgentRun) -> FunctionTool:
    async def invoke(_ctx, input_json: str) -> str:
        safe_input = _safe_tool_input(input_json)
        if not run.capability_snapshot.capability_policy.sandbox_enabled:
            return _tool_failure_payload(
                run=run,
                tool_name="sandbox.exec",
                capability=RuntimeToolCapability.SANDBOX,
                safe_input=safe_input,
                provenance=_sandbox_provenance(),
                error_summary="Tool is not authorized for this Agent Run.",
            )
        try:
            execution = sandbox_runtime_store.execute(
                run_id=run.id,
                conversation_id=run.conversation_id,
                command=str(safe_input.get("command", "")),
                artifact_filename=(
                    str(safe_input["artifact_filename"])
                    if safe_input.get("artifact_filename") is not None
                    else None
                ),
                artifact_body=(
                    str(safe_input["artifact_body"])
                    if safe_input.get("artifact_body") is not None
                    else None
                ),
            )
            safe_output = {
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
            return _tool_success_payload(
                run=run,
                tool_name="sandbox.exec",
                capability=RuntimeToolCapability.SANDBOX,
                safe_input=safe_input,
                safe_output=safe_output,
                provenance=_sandbox_provenance(),
            )
        except Exception as exc:
            return _tool_failure_payload(
                run=run,
                tool_name="sandbox.exec",
                capability=RuntimeToolCapability.SANDBOX,
                safe_input=safe_input,
                provenance=_sandbox_provenance(),
                error_summary=_error_summary(exc),
            )

    return _function_tool(
        public_name="sandbox.exec",
        sdk_name="sandbox_exec",
        description="Run a command in the configured Agents SDK sandbox.",
        params_json_schema={
            "type": "object",
            "properties": {
                "command": {"type": "string"},
                "artifact_filename": {"anyOf": [{"type": "string"}, {"type": "null"}]},
                "artifact_body": {"anyOf": [{"type": "string"}, {"type": "null"}]},
            },
            "required": ["command"],
            "additionalProperties": False,
        },
        invoke=invoke,
        strict_json_schema=False,
    )


def _mcp_tools(run: AgentRun) -> list[FunctionTool]:
    policy = run.capability_snapshot.capability_policy
    tools: list[FunctionTool] = []
    for server_id in policy.mcp_server_ids:
        try:
            discovered_tools = mcp_server_store.list_tools(server_id)
        except HTTPException:
            continue
        for discovered_tool in discovered_tools:
            if not mcp_server_store.is_tool_authorized(
                agent_id=run.capability_snapshot.agent_id,
                server_ids=policy.mcp_server_ids,
                tool_name=discovered_tool.tool_name,
            ):
                continue
            tools.append(_mcp_tool(run, discovered_tool.tool_name, discovered_tool.description))
    return tools


def _mcp_tool(run: AgentRun, tool_name: str, description: str) -> FunctionTool:
    async def invoke(_ctx, input_json: str) -> str:
        safe_input = _safe_tool_input(input_json)
        server_id = mcp_server_store.server_id_for_authorized_tool(
            agent_id=run.capability_snapshot.agent_id,
            server_ids=run.capability_snapshot.capability_policy.mcp_server_ids,
            tool_name=tool_name,
        )
        provenance = _mcp_provenance(server_id)
        if server_id is None:
            return _tool_failure_payload(
                run=run,
                tool_name=tool_name,
                capability=RuntimeToolCapability.MCP,
                safe_input=safe_input,
                provenance=provenance,
                error_summary="Tool is not authorized for this Agent Run.",
            )
        return _tool_success_payload(
            run=run,
            tool_name=tool_name,
            capability=RuntimeToolCapability.MCP,
            safe_input=safe_input,
            safe_output={"summary": f"{tool_name} completed.", "server_id": server_id},
            provenance=provenance,
        )

    return _function_tool(
        public_name=tool_name,
        sdk_name=_sdk_function_name(tool_name),
        description=description or f"Run authorized MCP tool {tool_name}.",
        params_json_schema={"type": "object", "additionalProperties": True},
        invoke=invoke,
        strict_json_schema=False,
    )


def _function_tool(
    *,
    public_name: str,
    sdk_name: str,
    description: str,
    params_json_schema: dict[str, Any],
    invoke,
    strict_json_schema: bool = True,
) -> FunctionTool:
    _PUBLIC_TOOL_NAMES_BY_SDK_NAME[sdk_name] = public_name
    return FunctionTool(
        name=sdk_name,
        description=description,
        params_json_schema=params_json_schema,
        on_invoke_tool=invoke,
        strict_json_schema=strict_json_schema,
        _mcp_title=public_name,
    )


def _safe_tool_input(input_json: str) -> dict[str, Any]:
    try:
        parsed = json.loads(input_json or "{}")
    except json.JSONDecodeError:
        parsed = {}
    if not isinstance(parsed, dict):
        parsed = {}
    return project_safe_payload(parsed)


def _tool_success_payload(
    *,
    run: AgentRun,
    tool_name: str,
    capability: RuntimeToolCapability,
    safe_input: dict[str, Any],
    safe_output: dict[str, Any],
    provenance: dict[str, str],
) -> str:
    return _json_string(
        {
            "id": None,
            "run_id": run.id,
            "conversation_id": run.conversation_id,
            "tool_name": tool_name,
            "capability": capability.value,
            "status": RuntimeToolStatus.COMPLETED.value,
            "started_at": "just now",
            "ended_at": "just now",
            "safe_input": safe_input,
            "safe_output": safe_output,
            "provenance": provenance,
        }
    )


def _tool_failure_payload(
    *,
    run: AgentRun,
    tool_name: str,
    capability: RuntimeToolCapability,
    safe_input: dict[str, Any],
    provenance: dict[str, str],
    error_summary: str,
) -> str:
    return _json_string(
        {
            "id": None,
            "run_id": run.id,
            "conversation_id": run.conversation_id,
            "tool_name": tool_name,
            "capability": capability.value,
            "status": RuntimeToolStatus.FAILED.value,
            "started_at": "just now",
            "ended_at": "just now",
            "safe_input": safe_input,
            "safe_output": None,
            "provenance": provenance,
            "error_summary": error_summary,
        }
    )


def _search_provenance() -> dict[str, str]:
    configuration = search_provider_store.get_provenance_configuration()
    return {
        "gateway": "openai_agents_sdk",
        "provider": configuration.provider_id.value,
        "provider_configuration_id": str(configuration.id),
    }


def _page_read_provenance() -> dict[str, str]:
    configuration = page_read_provider_store.get_provenance_configuration()
    return {
        "gateway": "openai_agents_sdk",
        "provider": configuration.provider_id.value,
        "provider_configuration_id": str(configuration.id),
    }


def _sandbox_provenance() -> dict[str, str]:
    return {
        "gateway": "openai_agents_sdk",
        "provider": sandbox_runtime_store.provider,
    }


def _mcp_provenance(server_id: int | None) -> dict[str, str]:
    provenance = {"gateway": "openai_agents_sdk", "provider": "mcp"}
    if server_id is not None:
        provenance["server_id"] = str(server_id)
    return provenance


def _sdk_function_name(tool_name: str) -> str:
    if tool_name in _STATIC_SDK_TOOL_NAMES:
        return _STATIC_SDK_TOOL_NAMES[tool_name]
    normalized = _SDK_TOOL_NAME_PATTERN.sub("_", tool_name).strip("_")
    return (normalized or "runtime_tool")[:64]


def _json_string(value: dict[str, Any]) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), default=str)


def _error_summary(exc: Exception) -> str:
    detail = getattr(exc, "detail", None)
    return str(detail or exc or "Tool execution failed.")
