from fastapi import APIRouter, Depends, Query, status

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
    ModelConfigurationMutationRequest,
    ModelConfigurationResponse,
    ModelConfigurationUpdateRequest,
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


router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/agents", response_model=list[AgentResponse])
def list_agents(
    _administrator: LocalAccount = Depends(current_administrator),
) -> list[AgentResponse]:
    return [to_agent_response(agent) for agent in agent_store.list_agents()]


@router.post("/agents", response_model=AgentResponse, status_code=status.HTTP_201_CREATED)
def create_agent(
    request: AgentMutationRequest,
    _administrator: LocalAccount = Depends(current_administrator),
) -> AgentResponse:
    return to_agent_response(agent_store.create(request))


@router.patch("/agents/{agent_id}", response_model=AgentResponse)
def update_agent(
    agent_id: int,
    request: AgentUpdateRequest,
    _administrator: LocalAccount = Depends(current_administrator),
) -> AgentResponse:
    return to_agent_response(agent_store.update(agent_id, request))


@router.post("/agents/{agent_id}/disable", response_model=AgentResponse)
def disable_agent(
    agent_id: int,
    _administrator: LocalAccount = Depends(current_administrator),
) -> AgentResponse:
    return to_agent_response(agent_store.set_status(agent_id, AgentStatus.DISABLED))


@router.post("/agents/{agent_id}/enable", response_model=AgentResponse)
def enable_agent(
    agent_id: int,
    _administrator: LocalAccount = Depends(current_administrator),
) -> AgentResponse:
    return to_agent_response(agent_store.set_status(agent_id, AgentStatus.ENABLED))


@router.post("/agents/{agent_id}/retire", response_model=AgentResponse)
def retire_agent(
    agent_id: int,
    _administrator: LocalAccount = Depends(current_administrator),
) -> AgentResponse:
    return to_agent_response(agent_store.set_status(agent_id, AgentStatus.RETIRED))


@router.post("/agents/{agent_id}/prepare-run", response_model=AgentRunPreparationResponse)
def prepare_agent_run(
    agent_id: int,
    _administrator: LocalAccount = Depends(current_administrator),
) -> AgentRunPreparationResponse:
    return to_agent_run_preparation_response(agent_store.get(agent_id))


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
    _administrator: LocalAccount = Depends(current_administrator),
) -> ModelConfigurationResponse:
    return to_model_configuration_response(model_configuration_store.create(request))


@router.patch(
    "/model-configurations/{configuration_id}",
    response_model=ModelConfigurationResponse,
)
def update_model_configuration(
    configuration_id: int,
    request: ModelConfigurationUpdateRequest,
    _administrator: LocalAccount = Depends(current_administrator),
) -> ModelConfigurationResponse:
    return to_model_configuration_response(
        model_configuration_store.update(configuration_id, request)
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
