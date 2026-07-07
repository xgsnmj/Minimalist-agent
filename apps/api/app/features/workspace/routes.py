from fastapi import APIRouter, Depends, File, Header, HTTPException, Query, Response, status, UploadFile
from fastapi.responses import StreamingResponse

from apps.api.app.agent_runs import (
    AgentRunCreateRequest,
    AgentRunResponse,
)
from apps.api.app.artifacts import (
    ArtifactCreateRequest,
    ArtifactPreviewResponse,
    ArtifactResponse,
)
from apps.api.app.auth import LocalAccount, current_user, local_account_store
from apps.api.app.card_schema_registry import CardResponse
from apps.api.app.conversations import (
    ConversationCreateRequest,
    ConversationRenameRequest,
    ConversationResponse,
)
from apps.api.app.run_attachments import (
    RunAttachmentPreviewResponse,
    RunAttachmentResponse,
)
from apps.api.app.workspace_conversation_flow import (
    ConversationDraftCreateRequest,
    WorkspaceAgentResponse,
    workspace_conversation_flow,
)


router = APIRouter(tags=["workspace"])
MAX_RUN_ATTACHMENT_BYTES = 20 * 1024 * 1024


@router.get(
    "/workspace/agents",
    response_model=list[WorkspaceAgentResponse],
    response_model_exclude_none=True,
)
def list_workspace_agents(
    _account: LocalAccount = Depends(current_user),
) -> list[WorkspaceAgentResponse]:
    return workspace_conversation_flow.list_workspace_agents()


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
    return workspace_conversation_flow.create_conversation_draft(
        owner_user_id=account.id,
        request=request,
    )


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
    return workspace_conversation_flow.create_conversation(
        owner_user_id=account.id,
        request=request,
    )


@router.get(
    "/conversations",
    response_model=list[ConversationResponse],
    response_model_exclude_none=True,
)
def list_conversations(
    limit: int | None = Query(default=None, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    message_limit: int | None = Query(default=None, ge=0, le=200),
    account: LocalAccount = Depends(current_user),
) -> list[ConversationResponse]:
    return workspace_conversation_flow.list_conversations(
        owner_user_id=account.id,
        limit=limit,
        offset=offset,
        message_limit=message_limit,
    )


@router.get(
    "/conversations/{conversation_id}",
    response_model=ConversationResponse,
    response_model_exclude_none=True,
)
def get_conversation(
    conversation_id: int,
    account: LocalAccount = Depends(current_user),
) -> ConversationResponse:
    return workspace_conversation_flow.get_conversation(
        owner_user_id=account.id,
        conversation_id=conversation_id,
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
    return workspace_conversation_flow.rename_conversation(
        owner_user_id=account.id,
        conversation_id=conversation_id,
        request=request,
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
    return workspace_conversation_flow.delete_conversation(
        owner_user_id=account.id,
        conversation_id=conversation_id,
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
    body = await file.read(MAX_RUN_ATTACHMENT_BYTES + 1)
    if len(body) > MAX_RUN_ATTACHMENT_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Run Attachment is too large.",
        )
    return workspace_conversation_flow.create_run_attachment(
        owner_user_id=account.id,
        conversation_id=conversation_id,
        filename=file.filename or "attachment",
        content_type=file.content_type or "application/octet-stream",
        body=body,
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
    return workspace_conversation_flow.list_run_attachments(
        owner_user_id=account.id,
        conversation_id=conversation_id,
    )


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
    return workspace_conversation_flow.preview_run_attachment(
        owner_user_id=account.id,
        conversation_id=conversation_id,
        attachment_id=attachment_id,
    )


@router.get("/conversations/{conversation_id}/run-attachments/{attachment_id}/download")
def download_run_attachment(
    conversation_id: int,
    attachment_id: int,
    account: LocalAccount = Depends(current_user),
) -> Response:
    download = workspace_conversation_flow.download_run_attachment(
        owner_user_id=account.id,
        conversation_id=conversation_id,
        attachment_id=attachment_id,
    )
    return StreamingResponse(
        content=download.body,
        media_type=download.content_type,
        headers={
            "Content-Disposition": f'attachment; filename="{download.filename}"',
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
    return workspace_conversation_flow.create_artifact(
        owner_user_id=account.id,
        conversation_id=conversation_id,
        request=request,
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
    return workspace_conversation_flow.preview_artifact(
        owner_user_id=account.id,
        artifact_id=artifact_id,
    )


@router.get("/artifacts/{artifact_id}/download")
def download_artifact(
    artifact_id: int,
    account: LocalAccount = Depends(current_user),
):
    download = workspace_conversation_flow.download_artifact(
        owner_user_id=account.id,
        artifact_id=artifact_id,
    )
    return StreamingResponse(
        content=download.body,
        media_type=download.content_type,
        headers={
            "Content-Disposition": f'attachment; filename="{download.filename}"',
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
    return workspace_conversation_flow.create_card(
        owner_user_id=account.id,
        conversation_id=conversation_id,
        payload=payload,
    )


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
    return workspace_conversation_flow.start_agent_run(
        owner_user_id=account.id,
        conversation_id=conversation_id,
        request=request,
    )


@router.get("/runs/{run_id}", response_model=AgentRunResponse)
def get_agent_run(
    run_id: int,
    account: LocalAccount = Depends(current_user),
) -> AgentRunResponse:
    return workspace_conversation_flow.get_agent_run(
        owner_user_id=account.id,
        run_id=run_id,
    )


@router.get("/runs", response_model=list[AgentRunResponse])
def list_agent_runs(
    limit: int | None = Query(default=None, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    account: LocalAccount = Depends(current_user),
) -> list[AgentRunResponse]:
    return workspace_conversation_flow.list_agent_runs(
        owner_user_id=account.id,
        limit=limit,
        offset=offset,
    )


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
                workspace_conversation_flow.format_sse_events(
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
    return workspace_conversation_flow.cancel_agent_run(
        owner_user_id=account.id,
        run_id=run_id,
    )
