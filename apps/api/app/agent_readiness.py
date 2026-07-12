from __future__ import annotations

from fastapi import HTTPException, status
from pydantic import BaseModel

from apps.api.app.agents import (
    Agent,
    AgentCapabilityPolicy,
    AgentCapabilityPolicyResponse,
    AgentMutationRequest,
    AgentStatus,
    AgentUpdateRequest,
    capability_policy_from_response,
    sdk_settings_from_response,
)
from apps.api.app.mcp_servers import mcp_server_store
from apps.api.app.model_configurations import model_configuration_store


class AgentReadinessResponse(BaseModel):
    agent_id: int
    ready: bool
    issues: list[str]


def validate_agent_configuration(agent: Agent) -> list[str]:
    issues: list[str] = []
    allowed_model_ids = list(dict.fromkeys(agent.allowed_model_configuration_ids))

    if agent.default_model_configuration_id is None:
        issues.append("Default Model Configuration is required.")
    elif agent.default_model_configuration_id not in allowed_model_ids:
        issues.append("Default Model Configuration must be in allowed Model Configuration ids.")
        _append_model_reference_issue(
            issues,
            model_configuration_id=agent.default_model_configuration_id,
            label="Default Model Configuration",
        )
    else:
        _append_model_reference_issue(
            issues,
            model_configuration_id=agent.default_model_configuration_id,
            label="Default Model Configuration",
        )

    if not allowed_model_ids:
        issues.append("At least one allowed Model Configuration is required.")

    for model_configuration_id in allowed_model_ids:
        _append_model_reference_issue(
            issues,
            model_configuration_id=model_configuration_id,
            label=f"Allowed Model Configuration #{model_configuration_id}",
        )

    for server_id in agent.capability_policy.mcp_server_ids:
        try:
            server = mcp_server_store.get(server_id)
        except HTTPException:
            issues.append(f"MCP Server #{server_id} does not exist.")
            continue
        if not server.enabled:
            issues.append(f"MCP Server #{server_id} is disabled.")

    return list(dict.fromkeys(issues))


def raise_if_agent_not_ready(agent: Agent) -> None:
    issues = validate_agent_configuration(agent)
    if issues:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"message": "Agent is not ready to be enabled.", "issues": issues},
        )


def validate_agent_mutation_request(request: AgentMutationRequest) -> None:
    candidate = Agent(
        id=0,
        name=request.name,
        description=request.description,
        icon=request.icon,
        status=AgentStatus.ENABLED,
        is_default=False,
        instruction=request.instruction,
        process_visibility=request.process_visibility,
        sdk_settings=sdk_settings_from_response(request.sdk_settings),
        default_model_configuration_id=request.default_model_configuration_id,
        allowed_model_configuration_ids=list(request.allowed_model_configuration_ids),
        capability_policy=capability_policy_from_response(request.capability_policy),
    )
    raise_if_agent_not_ready(candidate)


def candidate_agent_for_update(agent: Agent, request: AgentUpdateRequest) -> Agent:
    candidate = Agent(
        id=agent.id,
        name=agent.name,
        description=agent.description,
        icon=agent.icon,
        status=agent.status,
        is_default=agent.is_default,
        instruction=agent.instruction,
        process_visibility=agent.process_visibility,
        sdk_settings=agent.sdk_settings,
        default_model_configuration_id=agent.default_model_configuration_id,
        allowed_model_configuration_ids=list(agent.allowed_model_configuration_ids),
        capability_policy=AgentCapabilityPolicy(
            mcp_server_ids=list(agent.capability_policy.mcp_server_ids),
            search_enabled=agent.capability_policy.search_enabled,
            page_read_enabled=agent.capability_policy.page_read_enabled,
        ),
    )
    if request.name is not None:
        candidate.name = request.name
    if request.description is not None:
        candidate.description = request.description
    if request.icon is not None:
        candidate.icon = request.icon
    if request.instruction is not None:
        candidate.instruction = request.instruction
    if request.process_visibility is not None:
        candidate.process_visibility = request.process_visibility
    if request.sdk_settings is not None:
        candidate.sdk_settings = sdk_settings_from_response(request.sdk_settings)
    if "default_model_configuration_id" in request.model_fields_set:
        candidate.default_model_configuration_id = request.default_model_configuration_id
    if request.allowed_model_configuration_ids is not None:
        candidate.allowed_model_configuration_ids = list(request.allowed_model_configuration_ids)
    if request.capability_policy is not None:
        candidate.capability_policy = capability_policy_from_response(request.capability_policy)
    return candidate


def _append_model_reference_issue(
    issues: list[str],
    *,
    model_configuration_id: int,
    label: str,
) -> None:
    try:
        configuration = model_configuration_store.get(model_configuration_id)
    except HTTPException:
        issues.append(f"{label} does not exist.")
        return
    if not configuration.enabled:
        issues.append(f"{label} is disabled.")
