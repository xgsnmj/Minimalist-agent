from __future__ import annotations

import json
import os
import re
from enum import StrEnum
from typing import Any
from urllib.parse import urlparse

from agents import (
    CodeInterpreterTool,
    FileSearchTool,
    FunctionTool,
    HostedMCPTool,
    ImageGenerationTool,
    ShellTool,
    Tool,
    ToolSearchTool,
    WebSearchTool,
)
from fastapi import HTTPException
from openai.types.responses.web_search_tool import Filters as WebSearchFilters
from pydantic import BaseModel, Field

from apps.api.app.agent_runs import AgentRun
from apps.api.app.mcp_servers import McpServer, mcp_server_store
from apps.api.app.page_read_providers import (
    page_read_provider_store,
    to_page_read_execution_response,
)
from apps.api.app.sandbox_runtime import sandbox_runtime_store
from apps.api.app.search_providers import (
    search_provider_store,
    to_search_execution_response,
)
from apps.api.app.secret_vault import secret_vault_store


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
_PUBLIC_TOOL_NAMES_BY_SDK_NAME.update(
    {
        "web_search": "search.web",
        "web_search_call": "search.web",
        "hosted_mcp": "mcp",
        "mcp_call": "mcp",
        "mcp_list_tools": "mcp.list_tools",
        "computer": "computer.use",
        "computer_use_preview": "computer.use",
        "computer_call": "computer.use",
        "custom_tool_call": "custom.tool",
        "local_shell": "shell.local",
        "local_shell_call": "shell.local",
        "apply_patch": "apply_patch",
        "apply_patch_call": "apply_patch",
        "sandbox_exec": "sandbox.exec",
        "shell": "sandbox.exec",
        "shell_call": "sandbox.exec",
        "file_search": "file.search",
        "file_search_call": "file.search",
        "code_interpreter": "code.interpreter",
        "code_interpreter_call": "code.interpreter",
        "image_generation": "image.generate",
        "image_generation_call": "image.generate",
        "tool_search": "tool.search",
        "tool_search_call": "tool.search",
    }
)
_SDK_TOOL_NAME_PATTERN = re.compile(r"[^A-Za-z0-9_-]+")
def sdk_tools_for_run(run: AgentRun, *, prefer_native: bool | None = None) -> list[Tool]:
    policy = run.capability_snapshot.capability_policy
    use_native = run_prefers_native_sdk_tools(run) if prefer_native is None else prefer_native
    tools: list[Tool] = []
    if policy.search_enabled:
        tools.append(_native_search_tool(run) if use_native else _search_tool(run))
    if policy.page_read_enabled:
        tools.append(_page_read_tool(run))
    if policy.sandbox_enabled:
        tools.append(_native_sandbox_tool(run) if use_native else _sandbox_tool(run))
    tools.extend(_mcp_tools(run, prefer_native=use_native))
    if use_native:
        tools.extend(_configured_openai_native_tools(run))
    return tools


def run_prefers_native_sdk_tools(run: AgentRun) -> bool:
    snapshot = run.capability_snapshot.selected_model_configuration_snapshot or {}
    provider_id = str(snapshot.get("provider_id") or "").strip().lower()
    endpoint = str(snapshot.get("endpoint") or "").strip()
    return provider_id == "openai" and _is_official_openai_endpoint(endpoint)


def tools_require_openai_responses(tools: list[Tool]) -> bool:
    return any(not isinstance(tool, FunctionTool) for tool in tools)


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
    if public_name == "mcp" or public_name.startswith("mcp."):
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


def _native_search_tool(run: AgentRun) -> WebSearchTool:
    native_config = _openai_native_tool_configuration(run)
    config = _tool_config_record(native_config.get("web_search")) or _tool_config_record(
        native_config.get("search")
    ) or {}
    return WebSearchTool(
        user_location=config.get("user_location"),
        filters=_web_search_filters(config.get("filters")),
        search_context_size=_search_context_size(
            config.get("search_context_size")
        ),
        external_web_access=_optional_bool(config.get("external_web_access")),
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


def _native_sandbox_tool(run: AgentRun) -> ShellTool:
    config = _tool_config_record(_openai_native_tool_configuration(run).get("shell")) or {}
    return ShellTool(
        name="sandbox_exec",
        environment=_native_shell_environment(config.get("environment")),
    )


def _configured_openai_native_tools(run: AgentRun) -> list[Tool]:
    configuration = _openai_native_tool_configuration(run)
    tools: list[Tool] = []
    file_search_config = _tool_config_record(configuration.get("file_search"))
    if file_search_config is not None:
        vector_store_ids = _string_list(file_search_config.get("vector_store_ids"))
        if vector_store_ids:
            tools.append(
                FileSearchTool(
                    vector_store_ids=vector_store_ids,
                    max_num_results=_optional_int(file_search_config.get("max_num_results")),
                    include_search_results=bool(
                        file_search_config.get("include_search_results", False)
                    ),
                    ranking_options=file_search_config.get("ranking_options"),
                    filters=file_search_config.get("filters"),
                )
            )

    code_interpreter_config = _tool_config_record(configuration.get("code_interpreter"))
    if code_interpreter_config is not None:
        container = code_interpreter_config.get("container")
        if container:
            tool_config = {
                **code_interpreter_config,
                "type": "code_interpreter",
                "container": container,
            }
            tools.append(CodeInterpreterTool(tool_config=tool_config))

    image_generation_config = _tool_config_record(configuration.get("image_generation"))
    if image_generation_config is not None:
        tools.append(
            ImageGenerationTool(
                tool_config={
                    **image_generation_config,
                    "type": "image_generation",
                }
            )
        )

    return tools


def _mcp_tools(run: AgentRun, *, prefer_native: bool) -> list[Tool]:
    if prefer_native:
        return _native_mcp_tools(run)
    return _mcp_function_tools(run)


def _mcp_function_tools(run: AgentRun) -> list[FunctionTool]:
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


def _native_mcp_tools(run: AgentRun) -> list[Tool]:
    policy = run.capability_snapshot.capability_policy
    native_configuration = _openai_native_tool_configuration(run)
    mcp_configuration = _tool_config_record(native_configuration.get("mcp")) or {}
    defer_loading = bool(mcp_configuration.get("defer_loading", False))
    tools: list[Tool] = []
    for server_id in policy.mcp_server_ids:
        try:
            server = mcp_server_store.get(server_id)
        except HTTPException:
            continue
        allowed_tools = _authorized_mcp_tool_names(run, server_id=server_id)
        if not allowed_tools:
            continue
        tool_config: dict[str, Any] = {
            "type": "mcp",
            "server_label": _mcp_server_label(server),
            "server_description": server.name,
            "server_url": server.url,
            "allowed_tools": allowed_tools,
            "require_approval": "never",
        }
        if defer_loading:
            tool_config["defer_loading"] = True
        headers = _resolved_mcp_headers(server)
        if headers:
            tool_config["headers"] = headers
        tools.append(HostedMCPTool(tool_config=tool_config))
    if tools and defer_loading:
        tool_search_config = _tool_config_record(native_configuration.get("tool_search")) or {}
        tools.append(_native_tool_search_tool(tool_search_config))
    return tools


def _authorized_mcp_tool_names(run: AgentRun, *, server_id: int) -> list[str]:
    policy = run.capability_snapshot.capability_policy
    try:
        discovered_tools = mcp_server_store.list_tools(server_id)
    except HTTPException:
        return []
    return [
        discovered_tool.tool_name
        for discovered_tool in discovered_tools
        if mcp_server_store.is_tool_authorized(
            agent_id=run.capability_snapshot.agent_id,
            server_ids=policy.mcp_server_ids,
            tool_name=discovered_tool.tool_name,
        )
    ]


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


def _openai_native_tool_configuration(run: AgentRun) -> dict[str, Any]:
    snapshot = run.capability_snapshot.selected_model_configuration_snapshot or {}
    native_tool_settings = snapshot.get("native_tool_settings")
    if not isinstance(native_tool_settings, dict):
        return {}
    return native_tool_settings


def _is_official_openai_endpoint(endpoint: str) -> bool:
    parsed = urlparse(endpoint)
    return parsed.hostname == "api.openai.com"


def _tool_config_record(value: Any) -> dict[str, Any] | None:
    if not isinstance(value, dict):
        return None
    enabled = value.get("enabled")
    if enabled is False:
        return None
    return {key: item for key, item in value.items() if key != "enabled"}


def _string_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item) for item in value if isinstance(item, str) and item.strip()]


def _optional_int(value: Any) -> int | None:
    return value if isinstance(value, int) else None


def _optional_bool(value: Any) -> bool | None:
    return value if isinstance(value, bool) else None


def _optional_string(value: Any) -> str | None:
    return value if isinstance(value, str) else None


def _search_context_size(value: Any) -> str:
    return value if value in {"low", "medium", "high"} else "medium"


def _native_shell_environment(value: Any) -> dict[str, Any]:
    if isinstance(value, dict) and value.get("type") in {
        "container_auto",
        "container_reference",
    }:
        return value
    return {
        "type": "container_auto",
        "network_policy": {"type": "disabled"},
    }


def _web_search_filters(value: Any) -> WebSearchFilters | None:
    if isinstance(value, WebSearchFilters):
        return value
    if isinstance(value, dict):
        return WebSearchFilters.model_validate(value)
    return None


def _native_tool_search_tool(configuration: dict[str, Any]) -> ToolSearchTool:
    return ToolSearchTool(
        description=_optional_string(configuration.get("description")),
        execution=_tool_search_execution(configuration.get("execution")),
        parameters=configuration.get("parameters"),
    )


def _tool_search_execution(value: Any) -> str | None:
    return value if value in {"server", "client"} else None


def _mcp_server_label(server: McpServer) -> str:
    normalized_name = _SDK_TOOL_NAME_PATTERN.sub("_", server.name.lower()).strip("_")
    return f"mcp_{server.id}_{normalized_name or 'server'}"[:64]


def _resolved_mcp_headers(server: McpServer) -> dict[str, str]:
    headers: dict[str, str] = {}
    for header_name, secret_reference in server.header_secret_refs.items():
        secret_value = _resolve_secret_reference(secret_reference)
        if secret_value:
            headers[header_name] = secret_value
    return headers


def _resolve_secret_reference(reference: str) -> str | None:
    direct_secret = secret_vault_store.get(reference)
    if direct_secret:
        return direct_secret
    if not reference.startswith(("env:", "secret:", "secret://")):
        return reference
    for candidate in _secret_environment_candidates(reference):
        value = os.environ.get(candidate)
        if value:
            return value
    return None


def _secret_environment_candidates(reference: str) -> list[str]:
    if reference.startswith("env:"):
        return [reference.removeprefix("env:").strip()]
    normalized = re.sub(r"[^A-Za-z0-9]+", "_", reference).strip("_").upper()
    candidates = []
    if normalized:
        candidates.append(normalized)
        candidates.append(f"MODEL_SECRET_{normalized}")
        candidates.append(f"MCP_SECRET_{normalized}")
    return candidates


def _json_string(value: dict[str, Any]) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), default=str)


def _error_summary(exc: Exception) -> str:
    detail = getattr(exc, "detail", None)
    return str(detail or exc or "Tool execution failed.")
