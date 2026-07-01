from fastapi import Depends, FastAPI, Header, HTTPException, Query, status
from fastapi.responses import Response, StreamingResponse
from fastapi import File, UploadFile

from apps.api.app.agent_runs import (
    AgentRunCreateRequest,
    AgentRunResponse,
    agent_run_store,
    to_agent_run_response,
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
from apps.api.app.auth import (
    LocalAccount,
    LoginRequest,
    LoginResponse,
    RegisterRequest,
    UserResponse,
    current_administrator,
    current_user,
    local_account_store,
    to_user_response,
)
from apps.api.app.conversations import (
    ConversationCreateRequest,
    ConversationRenameRequest,
    ConversationResponse,
    conversation_store,
    to_conversation_response,
)
from apps.api.app.card_schema_registry import card_schema_registry_store, CardResponse
from apps.api.app.artifacts import ArtifactCreateRequest, ArtifactPreviewResponse, ArtifactResponse, artifact_store, to_artifact_reference
from apps.api.app.run_attachments import (
    RunAttachmentPreviewResponse,
    RunAttachmentResponse,
    run_attachment_store,
)
from apps.api.app.tool_gateway import (
    ToolCallRequest,
    ToolCallResponse,
    agent_tool_gateway_store,
    to_tool_call_response,
)
from apps.api.app.object_storage import object_storage
from apps.api.app.model_configurations import (
    MODEL_PROVIDER_CATALOG,
    ModelConfigurationMutationRequest,
    ModelConfigurationResponse,
    ModelConfigurationUpdateRequest,
    ModelProviderCatalogEntry,
    model_configuration_store,
    to_model_configuration_response,
)
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
from apps.api.app.page_read_providers import (
    PageReadProviderResponse,
    PageReadProviderUpdateRequest,
    page_read_provider_store,
    to_page_read_provider_response,
)
from apps.api.app.search_providers import (
    SearchProviderResponse,
    SearchProviderUpdateRequest,
    search_provider_store,
    to_search_provider_response,
)


app = FastAPI(title="Minimalist Agent API")


@app.get("/health")
def health() -> dict[str, str]:
    return {"service": "minimalist-agent-api", "status": "ok"}


@app.post("/auth/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register_local_account(request: RegisterRequest) -> UserResponse:
    return to_user_response(local_account_store.register(request))


@app.post("/auth/login", response_model=LoginResponse)
def login_local_account(request: LoginRequest) -> LoginResponse:
    token, account = local_account_store.authenticate(request)
    return LoginResponse(access_token=token, user=to_user_response(account))


@app.get("/auth/me", response_model=UserResponse)
def get_current_user(account: LocalAccount = Depends(current_user)) -> UserResponse:
    return to_user_response(account)


@app.post("/admin/accounts/{account_id}/approve", response_model=UserResponse)
def approve_local_account(
    account_id: int,
    _administrator: LocalAccount = Depends(current_administrator),
) -> UserResponse:
    return to_user_response(local_account_store.approve(account_id))


@app.post("/admin/accounts/{account_id}/reject", response_model=UserResponse)
def reject_local_account(
    account_id: int,
    _administrator: LocalAccount = Depends(current_administrator),
) -> UserResponse:
    return to_user_response(local_account_store.reject(account_id))


@app.post("/admin/accounts/{account_id}/disable", response_model=UserResponse)
def disable_local_account(
    account_id: int,
    _administrator: LocalAccount = Depends(current_administrator),
) -> UserResponse:
    return to_user_response(local_account_store.disable(account_id))


@app.get("/admin/agents", response_model=list[AgentResponse])
def list_agents(
    _administrator: LocalAccount = Depends(current_administrator),
) -> list[AgentResponse]:
    return [to_agent_response(agent) for agent in agent_store.list_agents()]


@app.post("/admin/agents", response_model=AgentResponse, status_code=status.HTTP_201_CREATED)
def create_agent(
    request: AgentMutationRequest,
    _administrator: LocalAccount = Depends(current_administrator),
) -> AgentResponse:
    return to_agent_response(agent_store.create(request))


@app.patch("/admin/agents/{agent_id}", response_model=AgentResponse)
def update_agent(
    agent_id: int,
    request: AgentUpdateRequest,
    _administrator: LocalAccount = Depends(current_administrator),
) -> AgentResponse:
    return to_agent_response(agent_store.update(agent_id, request))


@app.post("/admin/agents/{agent_id}/disable", response_model=AgentResponse)
def disable_agent(
    agent_id: int,
    _administrator: LocalAccount = Depends(current_administrator),
) -> AgentResponse:
    return to_agent_response(agent_store.set_status(agent_id, AgentStatus.DISABLED))


@app.post("/admin/agents/{agent_id}/enable", response_model=AgentResponse)
def enable_agent(
    agent_id: int,
    _administrator: LocalAccount = Depends(current_administrator),
) -> AgentResponse:
    return to_agent_response(agent_store.set_status(agent_id, AgentStatus.ENABLED))


@app.post("/admin/agents/{agent_id}/retire", response_model=AgentResponse)
def retire_agent(
    agent_id: int,
    _administrator: LocalAccount = Depends(current_administrator),
) -> AgentResponse:
    return to_agent_response(agent_store.set_status(agent_id, AgentStatus.RETIRED))


@app.post("/admin/agents/{agent_id}/prepare-run", response_model=AgentRunPreparationResponse)
def prepare_agent_run(
    agent_id: int,
    _administrator: LocalAccount = Depends(current_administrator),
) -> AgentRunPreparationResponse:
    return to_agent_run_preparation_response(agent_store.get(agent_id))


@app.post(
    "/admin/agents/{agent_id}/mcp-tool-authorizations",
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


@app.get("/admin/model-providers", response_model=list[ModelProviderCatalogEntry])
def list_model_providers(
    _administrator: LocalAccount = Depends(current_administrator),
) -> list[ModelProviderCatalogEntry]:
    return MODEL_PROVIDER_CATALOG


@app.get("/admin/model-configurations", response_model=list[ModelConfigurationResponse])
def list_model_configurations(
    _administrator: LocalAccount = Depends(current_administrator),
) -> list[ModelConfigurationResponse]:
    return [
        to_model_configuration_response(configuration)
        for configuration in model_configuration_store.list_configurations()
    ]


@app.post(
    "/admin/model-configurations",
    response_model=ModelConfigurationResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_model_configuration(
    request: ModelConfigurationMutationRequest,
    _administrator: LocalAccount = Depends(current_administrator),
) -> ModelConfigurationResponse:
    return to_model_configuration_response(model_configuration_store.create(request))


@app.patch(
    "/admin/model-configurations/{configuration_id}",
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


@app.get("/admin/mcp-servers", response_model=list[McpServerResponse])
def list_mcp_servers(
    _administrator: LocalAccount = Depends(current_administrator),
) -> list[McpServerResponse]:
    return [
        to_mcp_server_response(server)
        for server in mcp_server_store.list_servers()
    ]


@app.post(
    "/admin/mcp-servers",
    response_model=McpServerResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_mcp_server(
    request: McpServerMutationRequest,
    _administrator: LocalAccount = Depends(current_administrator),
) -> McpServerResponse:
    return to_mcp_server_response(mcp_server_store.create(request))


@app.post(
    "/admin/mcp-servers/{server_id}/discover",
    response_model=McpServerResponse,
)
def discover_mcp_server_tools(
    server_id: int,
    _administrator: LocalAccount = Depends(current_administrator),
) -> McpServerResponse:
    return to_mcp_server_response(mcp_server_store.discover_tools(server_id))


@app.get(
    "/admin/mcp-servers/{server_id}/tools",
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


@app.get(
    "/admin/search-provider-configurations",
    response_model=list[SearchProviderResponse],
)
def list_search_provider_configurations(
    _administrator: LocalAccount = Depends(current_administrator),
) -> list[SearchProviderResponse]:
    return [
        to_search_provider_response(configuration)
        for configuration in search_provider_store.list_configurations()
    ]


@app.patch(
    "/admin/search-provider-configurations/{configuration_id}",
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


@app.get(
    "/admin/page-read-provider-configurations",
    response_model=list[PageReadProviderResponse],
)
def list_page_read_provider_configurations(
    _administrator: LocalAccount = Depends(current_administrator),
) -> list[PageReadProviderResponse]:
    return [
        to_page_read_provider_response(configuration)
        for configuration in page_read_provider_store.list_configurations()
    ]


@app.patch(
    "/admin/page-read-provider-configurations/{configuration_id}",
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


@app.post(
    "/conversations",
    response_model=ConversationResponse,
    response_model_exclude_none=True,
    status_code=status.HTTP_201_CREATED,
)
def create_conversation(
    request: ConversationCreateRequest,
    account: LocalAccount = Depends(current_user),
) -> ConversationResponse:
    conversation = conversation_store.create(
        owner_user_id=account.id,
        request=request,
        agent=agent_store.get(request.agent_id),
    )
    return to_conversation_response(conversation)


@app.get("/conversations", response_model=list[ConversationResponse], response_model_exclude_none=True)
def list_conversations(
    account: LocalAccount = Depends(current_user),
) -> list[ConversationResponse]:
    return [
        to_conversation_response(conversation)
        for conversation in conversation_store.list_for_user(account.id)
    ]


@app.get(
    "/conversations/{conversation_id}",
    response_model=ConversationResponse,
    response_model_exclude_none=True,
)
def get_conversation(
    conversation_id: int,
    account: LocalAccount = Depends(current_user),
) -> ConversationResponse:
    return to_conversation_response(
        conversation_store.get_for_user(
            owner_user_id=account.id,
            conversation_id=conversation_id,
        )
    )


@app.patch(
    "/conversations/{conversation_id}",
    response_model=ConversationResponse,
    response_model_exclude_none=True,
)
def rename_conversation(
    conversation_id: int,
    request: ConversationRenameRequest,
    account: LocalAccount = Depends(current_user),
) -> ConversationResponse:
    return to_conversation_response(
        conversation_store.rename_for_user(
            owner_user_id=account.id,
            conversation_id=conversation_id,
            request=request,
        )
    )


@app.delete(
    "/conversations/{conversation_id}",
    response_model=ConversationResponse,
    response_model_exclude_none=True,
)
def delete_conversation(
    conversation_id: int,
    account: LocalAccount = Depends(current_user),
) -> ConversationResponse:
    return to_conversation_response(
        conversation_store.soft_delete_for_user(
            owner_user_id=account.id,
            conversation_id=conversation_id,
        )
    )


@app.post(
    "/conversations/{conversation_id}/run-attachments",
    response_model=RunAttachmentResponse,
    response_model_exclude_none=True,
    status_code=status.HTTP_201_CREATED,
)
async def upload_run_attachment(
    conversation_id: int,
    file: UploadFile = File(...),
    account: LocalAccount = Depends(current_user),
) -> RunAttachmentResponse:
    conversation_store.get_for_user(
        owner_user_id=account.id,
        conversation_id=conversation_id,
    )
    body = await file.read()
    attachment = run_attachment_store.create(
        conversation_id=conversation_id,
        run_id=None,
        filename=file.filename or "attachment",
        content_type=file.content_type or "application/octet-stream",
        body=body,
    )
    return RunAttachmentResponse(
        id=attachment.id,
        conversation_id=attachment.conversation_id,
        filename=attachment.filename,
        content_type=attachment.content_type,
        size=attachment.size,
        preview_type=attachment.preview_type,
    )


@app.get(
    "/conversations/{conversation_id}/run-attachments",
    response_model=list[RunAttachmentResponse],
    response_model_exclude_none=True,
)
def list_run_attachments(
    conversation_id: int,
    account: LocalAccount = Depends(current_user),
) -> list[RunAttachmentResponse]:
    conversation_store.get_for_user(
        owner_user_id=account.id,
        conversation_id=conversation_id,
    )
    return [
        RunAttachmentResponse(
            id=attachment.id,
            conversation_id=attachment.conversation_id,
            filename=attachment.filename,
            content_type=attachment.content_type,
            size=attachment.size,
            preview_type=attachment.preview_type,
        )
        for attachment in run_attachment_store.list_for_conversation(conversation_id)
    ]


@app.get(
    "/conversations/{conversation_id}/run-attachments/{attachment_id}/preview",
    response_model=RunAttachmentPreviewResponse,
    response_model_exclude_none=True,
)
def get_run_attachment_preview(
    conversation_id: int,
    attachment_id: int,
    account: LocalAccount = Depends(current_user),
) -> RunAttachmentPreviewResponse:
    conversation_store.get_for_user(
        owner_user_id=account.id,
        conversation_id=conversation_id,
    )
    attachment = run_attachment_store.get(attachment_id)
    if attachment.conversation_id != conversation_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Run Attachment not found.",
        )
    return run_attachment_store.preview(attachment_id)


@app.get("/conversations/{conversation_id}/run-attachments/{attachment_id}/download")
def download_run_attachment(
    conversation_id: int,
    attachment_id: int,
    account: LocalAccount = Depends(current_user),
) -> Response:
    conversation_store.get_for_user(
        owner_user_id=account.id,
        conversation_id=conversation_id,
    )
    attachment = run_attachment_store.get(attachment_id)
    if attachment.conversation_id != conversation_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Run Attachment not found.",
        )
    body = object_storage.get_bytes(bucket=attachment.bucket, object_key=attachment.object_key)
    return Response(
        content=body,
        media_type=attachment.content_type,
        headers={
            "Content-Disposition": f'attachment; filename="{attachment.filename}"',
        },
    )


@app.post(
    "/conversations/{conversation_id}/artifacts",
    response_model=ArtifactResponse,
    response_model_exclude_none=True,
    status_code=status.HTTP_201_CREATED,
)
def create_artifact(
    conversation_id: int,
    request: ArtifactCreateRequest,
    account: LocalAccount = Depends(current_user),
) -> ArtifactResponse:
    conversation_store.get_for_user(
        owner_user_id=account.id,
        conversation_id=conversation_id,
    )
    artifact = artifact_store.create(
        conversation_id=conversation_id,
        run_id=None,
        filename=request.filename,
        content_type=request.content_type,
        content=request.content_bytes(),
    )
    conversation_store.append_message(
        conversation_id=conversation_id,
        role="assistant",
        content=f"Artifact ready: {artifact.filename}",
        artifact_reference=to_artifact_reference(artifact),
    )
    return ArtifactResponse(
        id=artifact.id,
        conversation_id=artifact.conversation_id,
        filename=artifact.filename,
        content_type=artifact.content_type,
        size=artifact.size,
        preview_type=artifact.preview_type,
    )


@app.get(
    "/artifacts/{artifact_id}/preview",
    response_model=ArtifactPreviewResponse,
    response_model_exclude_none=True,
)
def get_artifact_preview(
    artifact_id: int,
    account: LocalAccount = Depends(current_user),
) -> ArtifactPreviewResponse:
    artifact = artifact_store.get(artifact_id)
    conversation_store.get_for_user(
        owner_user_id=account.id,
        conversation_id=artifact.conversation_id,
    )
    return artifact_store.preview(artifact_id)


@app.get("/artifacts/{artifact_id}/download")
def download_artifact(
    artifact_id: int,
    account: LocalAccount = Depends(current_user),
):
    artifact = artifact_store.get(artifact_id)
    conversation_store.get_for_user(
        owner_user_id=account.id,
        conversation_id=artifact.conversation_id,
    )
    _artifact, content = artifact_store.download_bytes(artifact_id)
    return Response(
        content=content,
        media_type=artifact.content_type,
        headers={
            "Content-Disposition": f'attachment; filename="{artifact.filename}"',
        },
    )


@app.post(
    "/conversations/{conversation_id}/cards",
    response_model=CardResponse,
    response_model_exclude_none=True,
    status_code=status.HTTP_201_CREATED,
)
def create_card(
    conversation_id: int,
    payload: dict[str, object],
    account: LocalAccount = Depends(current_user),
) -> CardResponse:
    conversation = conversation_store.get_for_user(
        owner_user_id=account.id,
        conversation_id=conversation_id,
    )
    run_id = payload.get("run_id")
    card_payload = payload.get("card") if isinstance(payload.get("card"), dict) else payload
    card = card_schema_registry_store.accept_card(card_payload)
    conversation_store.append_message(
        conversation_id=conversation.id,
        role="assistant",
        content=f"Card ready: {card.card_schema}",
        card=card,
    )
    if isinstance(run_id, int):
        agent_run_store.append_card_event_for_user(
            owner_user_id=account.id,
            run_id=run_id,
            conversation_id=conversation.id,
            card=card.model_dump(mode="json", by_alias=True),
        )
    return card


@app.post(
    "/conversations/{conversation_id}/runs",
    response_model=AgentRunResponse,
    status_code=status.HTTP_201_CREATED,
)
def start_agent_run(
    conversation_id: int,
    request: AgentRunCreateRequest,
    account: LocalAccount = Depends(current_user),
) -> AgentRunResponse:
    conversation = conversation_store.get_for_user(
        owner_user_id=account.id,
        conversation_id=conversation_id,
    )
    run = agent_run_store.create_for_conversation(
        conversation=conversation,
        request=request,
    )
    agent_run_store.mark_worker_enqueued(run.id)
    return to_agent_run_response(run)


@app.get("/runs/{run_id}", response_model=AgentRunResponse)
def get_agent_run(
    run_id: int,
    account: LocalAccount = Depends(current_user),
) -> AgentRunResponse:
    return to_agent_run_response(
        agent_run_store.get_for_user(
            owner_user_id=account.id,
            run_id=run_id,
        )
    )


@app.post(
    "/runs/{run_id}/tool-calls",
    response_model=ToolCallResponse,
    response_model_exclude_none=True,
    status_code=status.HTTP_201_CREATED,
)
def invoke_tool_call(
    run_id: int,
    request: ToolCallRequest,
    account: LocalAccount = Depends(current_user),
) -> ToolCallResponse:
    return to_tool_call_response(
        agent_tool_gateway_store.invoke_for_user(
            owner_user_id=account.id,
            run_id=run_id,
            request=request,
        )
    )


@app.get(
    "/runs/{run_id}/tool-calls",
    response_model=list[ToolCallResponse],
    response_model_exclude_none=True,
)
def list_tool_calls(
    run_id: int,
    account: LocalAccount = Depends(current_user),
) -> list[ToolCallResponse]:
    return [
        to_tool_call_response(tool_call)
        for tool_call in agent_tool_gateway_store.list_for_user(
            owner_user_id=account.id,
            run_id=run_id,
        )
    ]


@app.get("/runs/{run_id}/events")
def stream_agent_run_events(
    run_id: int,
    after: int | None = Query(default=None),
    last_event_id: str | None = Header(default=None, alias="Last-Event-ID"),
    account: LocalAccount = Depends(current_user),
) -> StreamingResponse:
    after_sequence = after if after is not None else int(last_event_id or "0")
    return StreamingResponse(
        content=iter(
            [
                agent_run_store.format_sse_events(
                    owner_user_id=account.id,
                    run_id=run_id,
                    after_sequence=after_sequence,
                )
            ]
        ),
        media_type="text/event-stream",
    )


@app.post("/runs/{run_id}/cancel", response_model=AgentRunResponse)
def cancel_agent_run(
    run_id: int,
    account: LocalAccount = Depends(current_user),
) -> AgentRunResponse:
    return to_agent_run_response(
        agent_run_store.cancel_for_user(
            owner_user_id=account.id,
            run_id=run_id,
        )
    )
