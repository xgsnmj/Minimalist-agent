from fastapi import APIRouter, Depends, File, Header, HTTPException, Query, Response, status, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from apps.api.app.agent_run_dispatcher import agent_run_dispatcher
from apps.api.app.agent_run_lifecycle import agent_run_lifecycle
from apps.api.app.agent_runs import (
    ACTIVE_RUN_STATUSES,
    AgentRunCreateRequest,
    AgentRunResponse,
    AgentRunStatus,
    agent_run_store,
    to_agent_run_response,
)
from apps.api.app.agents import AgentResponse, AgentStatus, agent_store, to_agent_response
from apps.api.app.artifacts import (
    ArtifactCreateRequest,
    ArtifactPreviewResponse,
    ArtifactResponse,
    artifact_store,
    to_artifact_reference,
)
from apps.api.app.auth import LocalAccount, current_user, local_account_store
from apps.api.app.card_schema_registry import CardResponse, card_schema_registry_store
from apps.api.app.conversations import (
    ConversationCreateRequest,
    ConversationRenameRequest,
    ConversationResponse,
    conversation_store,
    to_conversation_response,
)
from apps.api.app.model_configurations import (
    ModelConfigurationResponse,
    to_model_configuration_response,
)
from apps.api.app.model_selection import (
    enabled_model_configurations_for_agent,
    resolve_agent_model_configuration_id,
)
from apps.api.app.object_storage import object_storage
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


router = APIRouter(tags=["workspace"])


class WorkspaceAgentResponse(BaseModel):
    agent: AgentResponse
    allowed_model_configurations: list[ModelConfigurationResponse]


class ConversationDraftCreateRequest(BaseModel):
    title: str
    agent_id: int
    selected_model_configuration_id: int | None = None


def _workspace_agent_response(agent_id: int) -> WorkspaceAgentResponse:
    agent = agent_store.get(agent_id)
    configurations = enabled_model_configurations_for_agent(agent)
    return WorkspaceAgentResponse(
        agent=to_agent_response(agent),
        allowed_model_configurations=[
            to_model_configuration_response(configuration)
            for configuration in configurations
        ],
    )


@router.get(
    "/workspace/agents",
    response_model=list[WorkspaceAgentResponse],
    response_model_exclude_none=True,
)
def list_workspace_agents(
    _account: LocalAccount = Depends(current_user),
) -> list[WorkspaceAgentResponse]:
    return [
        _workspace_agent_response(agent.id)
        for agent in agent_store.list_agents()
        if agent.status == AgentStatus.ENABLED
    ]


@router.post(
    "/conversations/drafts",
    response_model=ConversationResponse,
    response_model_exclude_none=True,
    status_code=status.HTTP_201_CREATED,
)
def create_conversation_draft(
    request: ConversationDraftCreateRequest,
    account: LocalAccount = Depends(current_user),
) -> ConversationResponse:
    agent = agent_store.get(request.agent_id)
    selected_model_configuration_id = resolve_agent_model_configuration_id(
        agent=agent,
        selected_model_configuration_id=request.selected_model_configuration_id,
    )
    conversation = conversation_store.create_empty(
        owner_user_id=account.id,
        title=request.title,
        agent=agent,
        selected_model_configuration_id=selected_model_configuration_id,
    )
    return to_conversation_response(conversation)


@router.post(
    "/conversations",
    response_model=ConversationResponse,
    response_model_exclude_none=True,
    status_code=status.HTTP_201_CREATED,
)
def create_conversation(
    request: ConversationCreateRequest,
    account: LocalAccount = Depends(current_user),
) -> ConversationResponse:
    agent = agent_store.get(request.agent_id)
    selected_model_configuration_id = resolve_agent_model_configuration_id(
        agent=agent,
        selected_model_configuration_id=request.selected_model_configuration_id,
    )
    conversation = conversation_store.create(
        owner_user_id=account.id,
        request=request.model_copy(
            update={"selected_model_configuration_id": selected_model_configuration_id}
        ),
        agent=agent,
    )
    return to_conversation_response(conversation)


@router.get(
    "/conversations",
    response_model=list[ConversationResponse],
    response_model_exclude_none=True,
)
def list_conversations(
    account: LocalAccount = Depends(current_user),
) -> list[ConversationResponse]:
    return [
        to_conversation_response(conversation)
        for conversation in conversation_store.list_for_user(account.id)
    ]


@router.get(
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


@router.patch(
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


@router.delete(
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


@router.post(
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


@router.get(
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


@router.get(
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


@router.get("/conversations/{conversation_id}/run-attachments/{attachment_id}/download")
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


@router.post(
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


@router.get(
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


@router.get("/artifacts/{artifact_id}/download")
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


@router.post(
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
        agent_run_lifecycle.append_card_event_for_user(
            owner_user_id=account.id,
            run_id=run_id,
            conversation_id=conversation.id,
            card=card.model_dump(mode="json", by_alias=True),
        )
    return card


@router.post(
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
    resolve_agent_model_configuration_id(
        agent=conversation.agent,
        selected_model_configuration_id=conversation.selected_model_configuration_id,
    )
    run = agent_run_lifecycle.queue_for_conversation(
        conversation=conversation,
        request=request,
    )
    return to_agent_run_response(agent_run_dispatcher.dispatch(run))


@router.get("/runs/{run_id}", response_model=AgentRunResponse)
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


@router.get("/runs", response_model=list[AgentRunResponse])
def list_agent_runs(
    account: LocalAccount = Depends(current_user),
) -> list[AgentRunResponse]:
    return [
        to_agent_run_response(run)
        for run in agent_run_store.list_for_user(account.id)
    ]


@router.post(
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


@router.get(
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


@router.get("/runs/{run_id}/events")
def stream_agent_run_events(
    run_id: int,
    after: int | None = Query(default=None),
    access_token: str | None = Query(default=None),
    last_event_id: str | None = Header(default=None, alias="Last-Event-ID"),
    authorization: str | None = Header(default=None),
) -> StreamingResponse:
    account = _current_user_for_event_stream(
        authorization=authorization,
        access_token=access_token,
    )
    after_sequence = after if after is not None else int(last_event_id or "0")
    return StreamingResponse(
        content=iter(
            [
                agent_run_lifecycle.format_sse_events(
                    owner_user_id=account.id,
                    run_id=run_id,
                    after_sequence=after_sequence,
                )
            ]
        ),
        media_type="text/event-stream",
    )


def _current_user_for_event_stream(
    *,
    authorization: str | None,
    access_token: str | None,
) -> LocalAccount:
    if authorization is not None and authorization.startswith("Bearer "):
        token = authorization.removeprefix("Bearer ").strip()
        account = local_account_store.account_for_token(token)
        if account is not None:
            return account
    if access_token:
        account = local_account_store.account_for_token(access_token)
        if account is not None:
            return account
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication required.",
    )


@router.post("/runs/{run_id}/cancel", response_model=AgentRunResponse)
def cancel_agent_run(
    run_id: int,
    account: LocalAccount = Depends(current_user),
) -> AgentRunResponse:
    return to_agent_run_response(
        agent_run_lifecycle.cancel_for_user(
            owner_user_id=account.id,
            run_id=run_id,
        )
    )
