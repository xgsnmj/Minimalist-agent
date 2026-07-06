from __future__ import annotations

from fastapi import HTTPException, status
from pydantic import BaseModel

from apps.api.app.agent_run_execution import agent_run_execution
from apps.api.app.agent_runs import (
    AgentRunCreateRequest,
    AgentRunResponse,
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
from apps.api.app.card_schema_registry import CardResponse, card_schema_registry_store
from apps.api.app.conversation_file_library import (
    ConversationFileDownload,
    conversation_file_library,
)
from apps.api.app.conversations import (
    ConversationCreateRequest,
    ConversationRenameRequest,
    ConversationResponse,
    conversation_store,
    to_conversation_response,
    to_conversation_responses,
)
from apps.api.app.model_configurations import (
    ModelConfigurationResponse,
    to_model_configuration_response,
)
from apps.api.app.model_selection import (
    enabled_model_configurations_for_agent,
    resolve_agent_model_configuration_id,
)
from apps.api.app.run_attachments import (
    RunAttachmentPreviewResponse,
    RunAttachmentResponse,
    run_attachment_store,
)


class WorkspaceAgentResponse(BaseModel):
    agent: AgentResponse
    allowed_model_configurations: list[ModelConfigurationResponse]


class ConversationDraftCreateRequest(BaseModel):
    title: str
    agent_id: int
    selected_model_configuration_id: int | None = None


class WorkspaceConversationFlow:
    def list_workspace_agents(self) -> list[WorkspaceAgentResponse]:
        return [
            self.workspace_agent_response(agent.id)
            for agent in agent_store.list_agents()
            if agent.status == AgentStatus.ENABLED
        ]

    def workspace_agent_response(self, agent_id: int) -> WorkspaceAgentResponse:
        agent = agent_store.get(agent_id)
        configurations = enabled_model_configurations_for_agent(agent)
        return WorkspaceAgentResponse(
            agent=to_agent_response(agent),
            allowed_model_configurations=[
                to_model_configuration_response(configuration)
                for configuration in configurations
            ],
        )

    def create_conversation_draft(
        self,
        *,
        owner_user_id: int,
        request: ConversationDraftCreateRequest,
    ) -> ConversationResponse:
        agent = agent_store.get(request.agent_id)
        selected_model_configuration_id = resolve_agent_model_configuration_id(
            agent=agent,
            selected_model_configuration_id=request.selected_model_configuration_id,
        )
        conversation = conversation_store.create_empty(
            owner_user_id=owner_user_id,
            title=request.title,
            agent=agent,
            selected_model_configuration_id=selected_model_configuration_id,
        )
        return to_conversation_response(conversation)

    def create_conversation(
        self,
        *,
        owner_user_id: int,
        request: ConversationCreateRequest,
    ) -> ConversationResponse:
        agent = agent_store.get(request.agent_id)
        selected_model_configuration_id = resolve_agent_model_configuration_id(
            agent=agent,
            selected_model_configuration_id=request.selected_model_configuration_id,
        )
        conversation = conversation_store.create(
            owner_user_id=owner_user_id,
            request=request.model_copy(
                update={"selected_model_configuration_id": selected_model_configuration_id}
            ),
            agent=agent,
        )
        return to_conversation_response(conversation)

    def list_conversations(self, *, owner_user_id: int) -> list[ConversationResponse]:
        return to_conversation_responses(conversation_store.list_for_user(owner_user_id))

    def get_conversation(
        self,
        *,
        owner_user_id: int,
        conversation_id: int,
    ) -> ConversationResponse:
        return to_conversation_response(
            conversation_store.get_for_user(
                owner_user_id=owner_user_id,
                conversation_id=conversation_id,
            )
        )

    def rename_conversation(
        self,
        *,
        owner_user_id: int,
        conversation_id: int,
        request: ConversationRenameRequest,
    ) -> ConversationResponse:
        return to_conversation_response(
            conversation_store.rename_for_user(
                owner_user_id=owner_user_id,
                conversation_id=conversation_id,
                request=request,
            )
        )

    def delete_conversation(
        self,
        *,
        owner_user_id: int,
        conversation_id: int,
    ) -> ConversationResponse:
        return to_conversation_response(
            conversation_store.soft_delete_for_user(
                owner_user_id=owner_user_id,
                conversation_id=conversation_id,
            )
        )

    def create_run_attachment(
        self,
        *,
        owner_user_id: int,
        conversation_id: int,
        filename: str,
        content_type: str,
        body: bytes,
    ) -> RunAttachmentResponse:
        conversation_store.get_for_user(
            owner_user_id=owner_user_id,
            conversation_id=conversation_id,
        )
        attachment = run_attachment_store.create(
            conversation_id=conversation_id,
            run_id=None,
            filename=filename,
            content_type=content_type,
            body=body,
        )
        return self._run_attachment_response(attachment)

    def list_run_attachments(
        self,
        *,
        owner_user_id: int,
        conversation_id: int,
    ) -> list[RunAttachmentResponse]:
        conversation_store.get_for_user(
            owner_user_id=owner_user_id,
            conversation_id=conversation_id,
        )
        return [
            self._run_attachment_response(attachment)
            for attachment in run_attachment_store.list_for_conversation(conversation_id)
        ]

    def preview_run_attachment(
        self,
        *,
        owner_user_id: int,
        conversation_id: int,
        attachment_id: int,
    ) -> RunAttachmentPreviewResponse:
        self._raise_if_run_attachment_is_not_owned(
            owner_user_id=owner_user_id,
            conversation_id=conversation_id,
            attachment_id=attachment_id,
        )
        return conversation_file_library.run_attachment_preview(attachment_id)

    def download_run_attachment(
        self,
        *,
        owner_user_id: int,
        conversation_id: int,
        attachment_id: int,
    ) -> ConversationFileDownload:
        self._raise_if_run_attachment_is_not_owned(
            owner_user_id=owner_user_id,
            conversation_id=conversation_id,
            attachment_id=attachment_id,
        )
        return conversation_file_library.run_attachment_download(attachment_id)

    def create_artifact(
        self,
        *,
        owner_user_id: int,
        conversation_id: int,
        request: ArtifactCreateRequest,
    ) -> ArtifactResponse:
        conversation_store.get_for_user(
            owner_user_id=owner_user_id,
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
        return self._artifact_response(artifact)

    def preview_artifact(
        self,
        *,
        owner_user_id: int,
        artifact_id: int,
    ) -> ArtifactPreviewResponse:
        artifact = artifact_store.get(artifact_id)
        conversation_store.get_for_user(
            owner_user_id=owner_user_id,
            conversation_id=artifact.conversation_id,
        )
        return conversation_file_library.artifact_preview(artifact_id)

    def download_artifact(
        self,
        *,
        owner_user_id: int,
        artifact_id: int,
    ) -> ConversationFileDownload:
        artifact = artifact_store.get(artifact_id)
        conversation_store.get_for_user(
            owner_user_id=owner_user_id,
            conversation_id=artifact.conversation_id,
        )
        return conversation_file_library.artifact_download(artifact_id)

    def create_card(
        self,
        *,
        owner_user_id: int,
        conversation_id: int,
        payload: dict[str, object],
    ) -> CardResponse:
        conversation = conversation_store.get_for_user(
            owner_user_id=owner_user_id,
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
            agent_run_execution.append_card_event_for_user(
                owner_user_id=owner_user_id,
                run_id=run_id,
                conversation_id=conversation.id,
                card=card.model_dump(mode="json", by_alias=True),
            )
        return card

    def start_agent_run(
        self,
        *,
        owner_user_id: int,
        conversation_id: int,
        request: AgentRunCreateRequest,
    ) -> AgentRunResponse:
        conversation = conversation_store.get_for_user(
            owner_user_id=owner_user_id,
            conversation_id=conversation_id,
        )
        resolve_agent_model_configuration_id(
            agent=conversation.agent,
            selected_model_configuration_id=conversation.selected_model_configuration_id,
        )
        return to_agent_run_response(
            agent_run_execution.queue_and_dispatch_for_conversation(
                conversation=conversation,
                request=request,
            )
        )

    def get_agent_run(self, *, owner_user_id: int, run_id: int) -> AgentRunResponse:
        return to_agent_run_response(
            agent_run_store.get_for_user(
                owner_user_id=owner_user_id,
                run_id=run_id,
            )
        )

    def list_agent_runs(self, *, owner_user_id: int) -> list[AgentRunResponse]:
        return [
            to_agent_run_response(run)
            for run in agent_run_store.list_for_user(owner_user_id)
        ]

    def format_sse_events(
        self,
        *,
        owner_user_id: int,
        run_id: int,
        after_sequence: int,
    ) -> str:
        return agent_run_execution.format_sse_events(
            owner_user_id=owner_user_id,
            run_id=run_id,
            after_sequence=after_sequence,
        )

    def cancel_agent_run(self, *, owner_user_id: int, run_id: int) -> AgentRunResponse:
        return to_agent_run_response(
            agent_run_execution.cancel_for_user(
                owner_user_id=owner_user_id,
                run_id=run_id,
            )
        )

    def _raise_if_run_attachment_is_not_owned(
        self,
        *,
        owner_user_id: int,
        conversation_id: int,
        attachment_id: int,
    ) -> None:
        conversation_store.get_for_user(
            owner_user_id=owner_user_id,
            conversation_id=conversation_id,
        )
        attachment = run_attachment_store.get(attachment_id)
        if attachment.conversation_id != conversation_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Run Attachment not found.",
            )

    def _run_attachment_response(self, attachment) -> RunAttachmentResponse:
        return RunAttachmentResponse(
            id=attachment.id,
            conversation_id=attachment.conversation_id,
            filename=attachment.filename,
            content_type=attachment.content_type,
            size=attachment.size,
            preview_type=attachment.preview_type,
        )

    def _artifact_response(self, artifact) -> ArtifactResponse:
        return ArtifactResponse(
            id=artifact.id,
            conversation_id=artifact.conversation_id,
            filename=artifact.filename,
            content_type=artifact.content_type,
            size=artifact.size,
            preview_type=artifact.preview_type,
        )


workspace_conversation_flow = WorkspaceConversationFlow()
