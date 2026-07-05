from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from openai import OpenAI

from apps.api.app.admin_audit import admin_audit_store
from apps.api.app.agent_readiness import (
    AgentReadinessResponse,
    candidate_agent_for_update,
    raise_if_agent_not_ready,
    validate_agent_configuration,
    validate_agent_mutation_request,
)
from apps.api.app.agents import (
    AgentMutationRequest,
    AgentRunPreparationResponse,
    AgentResponse,
    AgentStatus,
    AgentUpdateRequest,
    agent_store,
    to_agent_run_preparation_response,
    to_agent_response,
)
from apps.api.app.auth import LocalAccount, current_administrator
from apps.api.app.agent_runs import AgentRunStatus
from apps.api.app.mcp_servers import (
    McpDiscoveredToolResponse,
    McpServerMutationRequest,
    McpServerResponse,
    McpToolAuthorizationRequest,
    McpToolAuthorizationResponse,
    mcp_server_store,
    to_mcp_discovered_tool_response,
    to_mcp_server_response,
    to_mcp_tool_authorization_response,
)
from apps.api.app.model_configurations import (
    MODEL_PROVIDER_CATALOG,
    ModelConfiguration,
    ModelConfigurationHealthCheckResponse,
    ModelConfigurationMutationRequest,
    ModelConfigurationResponse,
    ModelConfigurationUpdateRequest,
    ModelHealthStatus,
    ModelProviderCatalogEntry,
    model_configuration_store,
    to_model_configuration_response,
)
from apps.api.app.page_read_providers import (
    PageReadProviderResponse,
    PageReadProviderUpdateRequest,
    page_read_provider_store,
    to_page_read_provider_response,
)
from apps.api.app.run_audit import (
    FullTraceResponse,
    RunAuditDetailResponse,
    RunAuditListResponse,
    run_audit_store,
)
from apps.api.app.search_providers import (
    SearchProviderResponse,
    SearchProviderUpdateRequest,
    search_provider_store,
    to_search_provider_response,
)
from apps.api.app.runtime import resolve_model_api_key, runtime_model_parameters_for_configuration


router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/agents", response_model=list[AgentResponse])
def list_agents(
    _administrator: LocalAccount = Depends(current_administrator),
) -> list[AgentResponse]:
    return [to_agent_response(agent) for agent in agent_store.list_agents()]


@router.post("/agents", response_model=AgentResponse, status_code=status.HTTP_201_CREATED)
def create_agent(
    request: AgentMutationRequest,
    administrator: LocalAccount = Depends(current_administrator),
) -> AgentResponse:
    validate_agent_mutation_request(request)
    agent = agent_store.create(request)
    admin_audit_store.record(
        actor_id=administrator.id,
        target_type="agent",
        target_id=agent.id,
        action="created",
        before=None,
        after=to_agent_response(agent).model_dump(mode="json"),
    )
    return to_agent_response(agent)


@router.patch("/agents/{agent_id}", response_model=AgentResponse)
def update_agent(
    agent_id: int,
    request: AgentUpdateRequest,
    administrator: LocalAccount = Depends(current_administrator),
) -> AgentResponse:
    existing_agent = agent_store.get(agent_id)
    before = to_agent_response(existing_agent).model_dump(mode="json")
    raise_if_agent_not_ready(candidate_agent_for_update(existing_agent, request))
    updated_agent = agent_store.update(agent_id, request)
    after = to_agent_response(updated_agent).model_dump(mode="json")
    admin_audit_store.record(
        actor_id=administrator.id,
        target_type="agent",
        target_id=agent_id,
        action="updated",
        before=before,
        after=after,
    )
    return to_agent_response(updated_agent)


@router.post("/agents/{agent_id}/disable", response_model=AgentResponse)
def disable_agent(
    agent_id: int,
    administrator: LocalAccount = Depends(current_administrator),
) -> AgentResponse:
    return _set_agent_status_with_audit(
        agent_id=agent_id,
        agent_status=AgentStatus.DISABLED,
        administrator=administrator,
        action="disabled",
    )


@router.post("/agents/{agent_id}/enable", response_model=AgentResponse)
def enable_agent(
    agent_id: int,
    administrator: LocalAccount = Depends(current_administrator),
) -> AgentResponse:
    raise_if_agent_not_ready(agent_store.get(agent_id))
    return _set_agent_status_with_audit(
        agent_id=agent_id,
        agent_status=AgentStatus.ENABLED,
        administrator=administrator,
        action="enabled",
    )


@router.post("/agents/{agent_id}/retire", response_model=AgentResponse)
def retire_agent(
    agent_id: int,
    administrator: LocalAccount = Depends(current_administrator),
) -> AgentResponse:
    return _set_agent_status_with_audit(
        agent_id=agent_id,
        agent_status=AgentStatus.RETIRED,
        administrator=administrator,
        action="retired",
    )


@router.post("/agents/{agent_id}/prepare-run", response_model=AgentRunPreparationResponse)
def prepare_agent_run(
    agent_id: int,
    _administrator: LocalAccount = Depends(current_administrator),
) -> AgentRunPreparationResponse:
    return to_agent_run_preparation_response(agent_store.get(agent_id))


@router.post("/agents/{agent_id}/readiness-check", response_model=AgentReadinessResponse)
def check_agent_readiness(
    agent_id: int,
    _administrator: LocalAccount = Depends(current_administrator),
) -> AgentReadinessResponse:
    agent = agent_store.get(agent_id)
    issues = validate_agent_configuration(agent)
    return AgentReadinessResponse(
        agent_id=agent.id,
        ready=not issues,
        issues=issues,
    )


@router.post(
    "/agents/{agent_id}/mcp-tool-authorizations",
    response_model=McpToolAuthorizationResponse,
    status_code=status.HTTP_201_CREATED,
)
def authorize_agent_mcp_tool(
    agent_id: int,
    request: McpToolAuthorizationRequest,
    _administrator: LocalAccount = Depends(current_administrator),
) -> McpToolAuthorizationResponse:
    agent_store.get(agent_id)
    return to_mcp_tool_authorization_response(
        mcp_server_store.authorize_tool(
            agent_id=agent_id,
            request=request,
        )
    )


@router.get("/model-providers", response_model=list[ModelProviderCatalogEntry])
def list_model_providers(
    _administrator: LocalAccount = Depends(current_administrator),
) -> list[ModelProviderCatalogEntry]:
    return MODEL_PROVIDER_CATALOG


@router.get("/model-configurations", response_model=list[ModelConfigurationResponse])
def list_model_configurations(
    _administrator: LocalAccount = Depends(current_administrator),
) -> list[ModelConfigurationResponse]:
    return [
        to_model_configuration_response(configuration)
        for configuration in model_configuration_store.list_configurations()
    ]


@router.post(
    "/model-configurations",
    response_model=ModelConfigurationResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_model_configuration(
    request: ModelConfigurationMutationRequest,
    administrator: LocalAccount = Depends(current_administrator),
) -> ModelConfigurationResponse:
    configuration = model_configuration_store.create(request)
    admin_audit_store.record(
        actor_id=administrator.id,
        target_type="model_configuration",
        target_id=configuration.id,
        action="created",
        before=None,
        after=to_model_configuration_response(configuration).model_dump(mode="json"),
    )
    return to_model_configuration_response(configuration)


@router.patch(
    "/model-configurations/{configuration_id}",
    response_model=ModelConfigurationResponse,
)
def update_model_configuration(
    configuration_id: int,
    request: ModelConfigurationUpdateRequest,
    administrator: LocalAccount = Depends(current_administrator),
) -> ModelConfigurationResponse:
    if request.enabled is False:
        _raise_if_model_configuration_is_required_by_enabled_agent(configuration_id)
    existing_configuration = model_configuration_store.get(configuration_id)
    before = to_model_configuration_response(existing_configuration).model_dump(mode="json")
    updated_configuration = model_configuration_store.update(configuration_id, request)
    after = to_model_configuration_response(updated_configuration).model_dump(mode="json")
    admin_audit_store.record(
        actor_id=administrator.id,
        target_type="model_configuration",
        target_id=configuration_id,
        action="updated",
        before=before,
        after=after,
    )
    return to_model_configuration_response(updated_configuration)


@router.post(
    "/model-configurations/{configuration_id}/health-check",
    response_model=ModelConfigurationHealthCheckResponse,
)
def check_model_configuration_health(
    configuration_id: int,
    _administrator: LocalAccount = Depends(current_administrator),
) -> ModelConfigurationHealthCheckResponse:
    configuration = model_configuration_store.get(configuration_id)
    checked_at = datetime.now(UTC).isoformat()
    error = _model_configuration_health_error(configuration)
    health_status = ModelHealthStatus.UNHEALTHY if error else ModelHealthStatus.HEALTHY
    updated = model_configuration_store.record_health_check(
        configuration_id=configuration.id,
        health_status=health_status,
        checked_at=checked_at,
        last_error=error,
    )
    return ModelConfigurationHealthCheckResponse(
        configuration=to_model_configuration_response(updated),
        status=health_status,
        checked_at=checked_at,
        message=error or "Model Configuration health check passed.",
    )


@router.get("/mcp-servers", response_model=list[McpServerResponse])
def list_mcp_servers(
    _administrator: LocalAccount = Depends(current_administrator),
) -> list[McpServerResponse]:
    return [
        to_mcp_server_response(server)
        for server in mcp_server_store.list_servers()
    ]


@router.post(
    "/mcp-servers",
    response_model=McpServerResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_mcp_server(
    request: McpServerMutationRequest,
    _administrator: LocalAccount = Depends(current_administrator),
) -> McpServerResponse:
    return to_mcp_server_response(mcp_server_store.create(request))


@router.post(
    "/mcp-servers/{server_id}/discover",
    response_model=McpServerResponse,
)
def discover_mcp_server_tools(
    server_id: int,
    _administrator: LocalAccount = Depends(current_administrator),
) -> McpServerResponse:
    return to_mcp_server_response(mcp_server_store.discover_tools(server_id))


@router.get(
    "/mcp-servers/{server_id}/tools",
    response_model=list[McpDiscoveredToolResponse],
)
def list_mcp_server_tools(
    server_id: int,
    _administrator: LocalAccount = Depends(current_administrator),
) -> list[McpDiscoveredToolResponse]:
    return [
        to_mcp_discovered_tool_response(tool)
        for tool in mcp_server_store.list_tools(server_id)
    ]


@router.get(
    "/search-provider-configurations",
    response_model=list[SearchProviderResponse],
)
def list_search_provider_configurations(
    _administrator: LocalAccount = Depends(current_administrator),
) -> list[SearchProviderResponse]:
    return [
        to_search_provider_response(configuration)
        for configuration in search_provider_store.list_configurations()
    ]


@router.patch(
    "/search-provider-configurations/{configuration_id}",
    response_model=SearchProviderResponse,
)
def update_search_provider_configuration(
    configuration_id: int,
    request: SearchProviderUpdateRequest,
    _administrator: LocalAccount = Depends(current_administrator),
) -> SearchProviderResponse:
    return to_search_provider_response(
        search_provider_store.update(configuration_id, request)
    )


@router.get(
    "/page-read-provider-configurations",
    response_model=list[PageReadProviderResponse],
)
def list_page_read_provider_configurations(
    _administrator: LocalAccount = Depends(current_administrator),
) -> list[PageReadProviderResponse]:
    return [
        to_page_read_provider_response(configuration)
        for configuration in page_read_provider_store.list_configurations()
    ]


@router.patch(
    "/page-read-provider-configurations/{configuration_id}",
    response_model=PageReadProviderResponse,
)
def update_page_read_provider_configuration(
    configuration_id: int,
    request: PageReadProviderUpdateRequest,
    _administrator: LocalAccount = Depends(current_administrator),
) -> PageReadProviderResponse:
    return to_page_read_provider_response(
        page_read_provider_store.update(configuration_id, request)
    )


@router.get("/run-audit", response_model=RunAuditListResponse)
def list_run_audit(
    status_filter: AgentRunStatus | None = Query(default=None, alias="status"),
    user_id: int | None = None,
    agent_id: int | None = None,
    model_configuration_id: int | None = None,
    _administrator: LocalAccount = Depends(current_administrator),
) -> RunAuditListResponse:
    return run_audit_store.list_runs(
        status_filter=status_filter,
        user_id=user_id,
        agent_id=agent_id,
        model_configuration_id=model_configuration_id,
    )


@router.get("/run-audit/{run_id}", response_model=RunAuditDetailResponse)
def get_run_audit_detail(
    run_id: int,
    _administrator: LocalAccount = Depends(current_administrator),
) -> RunAuditDetailResponse:
    return run_audit_store.detail(run_id)


@router.get("/run-audit/{run_id}/full-trace", response_model=FullTraceResponse)
def get_run_audit_full_trace(
    run_id: int,
    _administrator: LocalAccount = Depends(current_administrator),
) -> FullTraceResponse:
    return run_audit_store.full_trace(run_id)


def _raise_if_model_configuration_is_required_by_enabled_agent(configuration_id: int) -> None:
    referencing_agents = [
        agent.name
        for agent in agent_store.list_agents()
        if agent.status == AgentStatus.ENABLED
        and (
            agent.default_model_configuration_id == configuration_id
            or configuration_id in agent.allowed_model_configuration_ids
        )
    ]
    if referencing_agents:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": "Model Configuration is used by enabled Agents.",
                "agents": referencing_agents,
            },
        )


def _set_agent_status_with_audit(
    *,
    agent_id: int,
    agent_status: AgentStatus,
    administrator: LocalAccount,
    action: str,
) -> AgentResponse:
    before = to_agent_response(agent_store.get(agent_id)).model_dump(mode="json")
    updated_agent = agent_store.set_status(agent_id, agent_status)
    after = to_agent_response(updated_agent).model_dump(mode="json")
    admin_audit_store.record(
        actor_id=administrator.id,
        target_type="agent",
        target_id=agent_id,
        action=action,
        before=before,
        after=after,
    )
    return to_agent_response(updated_agent)


def _model_configuration_health_error(configuration: ModelConfiguration) -> str | None:
    if not configuration.endpoint.startswith(("https://", "http://")):
        return "Model endpoint must be an HTTP(S) URL."
    if not configuration.enabled:
        return "Model Configuration is disabled."
    try:
        api_key = resolve_model_api_key(configuration.credential_reference)
    except Exception as exc:
        return str(exc)
    try:
        _model_health_probe(configuration, api_key)
    except Exception as exc:
        return f"Model health check request failed: {exc}"
    return None


def _model_health_probe(configuration: ModelConfiguration, api_key: str) -> None:
    client = OpenAI(
        api_key=api_key,
        base_url=configuration.endpoint,
        max_retries=0,
        timeout=15,
    )
    client.chat.completions.create(**_model_health_check_request(configuration))


def _model_health_check_request(configuration: ModelConfiguration) -> dict[str, object]:
    parameters = runtime_model_parameters_for_configuration(configuration)
    request: dict[str, object] = {
        "model": configuration.model_name,
        "messages": [
            {
                "role": "user",
                "content": "Reply with ok.",
            }
        ],
        "max_tokens": 1,
    }
    for key in ("extra_headers", "extra_query", "extra_body"):
        value = parameters.get(key)
        if value is not None:
            request[key] = value
    return request
