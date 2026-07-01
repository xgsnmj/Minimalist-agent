from dataclasses import dataclass, field
from enum import StrEnum

from fastapi import HTTPException, status
from pydantic import BaseModel, Field

from apps.api.app.agents import Agent, AgentResponse, to_agent_response
from apps.api.app.artifacts import ArtifactMessageReference


class ConversationStatus(StrEnum):
    IDLE = "idle"
    RUNNING = "running"


class ConversationMessageResponse(BaseModel):
    role: str
    content: str
    artifact_reference: ArtifactMessageReference | None = None


class ConversationCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    agent_id: int
    selected_model_configuration_id: int | None = None
    initial_message: str = Field(min_length=1)


class ConversationRenameRequest(BaseModel):
    title: str = Field(min_length=1, max_length=160)


class ConversationResponse(BaseModel):
    id: int
    title: str
    agent: AgentResponse
    selected_model_configuration_id: int | None
    status: ConversationStatus
    updated_at: str
    deleted: bool
    messages: list[ConversationMessageResponse]


@dataclass
class ConversationMessage:
    role: str
    content: str
    artifact_reference: ArtifactMessageReference | None = None


@dataclass
class AgentConversation:
    id: int
    owner_user_id: int
    title: str
    agent: Agent
    selected_model_configuration_id: int | None
    updated_at: str
    status: ConversationStatus = ConversationStatus.IDLE
    deleted: bool = False
    messages: list[ConversationMessage] = field(default_factory=list)


class ConversationStore:
    def __init__(self) -> None:
        self.reset()

    def reset(self) -> None:
        self._next_id = 1
        self._conversations: dict[int, AgentConversation] = {}

    def create(
        self,
        *,
        owner_user_id: int,
        request: ConversationCreateRequest,
        agent: Agent,
    ) -> AgentConversation:
        conversation = AgentConversation(
            id=self._next_id,
            owner_user_id=owner_user_id,
            title=request.title,
            agent=agent,
            selected_model_configuration_id=request.selected_model_configuration_id,
            updated_at="just now",
            messages=[ConversationMessage(role="user", content=request.initial_message)],
        )
        self._next_id += 1
        self._conversations[conversation.id] = conversation
        return conversation

    def list_for_user(self, owner_user_id: int) -> list[AgentConversation]:
        conversations = [
            conversation
            for conversation in self._conversations.values()
            if conversation.owner_user_id == owner_user_id and not conversation.deleted
        ]
        return sorted(conversations, key=lambda conversation: conversation.id, reverse=True)

    def get_for_user(self, *, owner_user_id: int, conversation_id: int) -> AgentConversation:
        conversation = self._conversations.get(conversation_id)
        if (
            conversation is None
            or conversation.owner_user_id != owner_user_id
            or conversation.deleted
        ):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Agent Conversation not found.",
            )
        return conversation

    def rename_for_user(
        self,
        *,
        owner_user_id: int,
        conversation_id: int,
        request: ConversationRenameRequest,
    ) -> AgentConversation:
        conversation = self.get_for_user(
            owner_user_id=owner_user_id,
            conversation_id=conversation_id,
        )
        conversation.title = request.title
        conversation.updated_at = "just now"
        return conversation

    def soft_delete_for_user(
        self,
        *,
        owner_user_id: int,
        conversation_id: int,
    ) -> AgentConversation:
        conversation = self.get_for_user(
            owner_user_id=owner_user_id,
            conversation_id=conversation_id,
        )
        conversation.deleted = True
        conversation.updated_at = "just now"
        return conversation

    def append_message(
        self,
        *,
        conversation_id: int,
        role: str,
        content: str,
        artifact_reference: ArtifactMessageReference | None = None,
    ) -> AgentConversation:
        conversation = self._conversation_or_404(conversation_id)
        conversation.messages.append(
            ConversationMessage(
                role=role,
                content=content,
                artifact_reference=artifact_reference,
            )
        )
        conversation.updated_at = "just now"
        return conversation

    def set_status(
        self,
        *,
        conversation_id: int,
        conversation_status: ConversationStatus,
    ) -> AgentConversation:
        conversation = self._conversation_or_404(conversation_id)
        conversation.status = conversation_status
        conversation.updated_at = "just now"
        return conversation

    def _conversation_or_404(self, conversation_id: int) -> AgentConversation:
        conversation = self._conversations.get(conversation_id)
        if conversation is None or conversation.deleted:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Agent Conversation not found.",
            )
        return conversation


conversation_store = ConversationStore()


def to_conversation_response(conversation: AgentConversation) -> ConversationResponse:
    return ConversationResponse(
        id=conversation.id,
        title=conversation.title,
        agent=to_agent_response(conversation.agent),
        selected_model_configuration_id=conversation.selected_model_configuration_id,
        status=conversation.status,
        updated_at=conversation.updated_at,
        deleted=conversation.deleted,
        messages=[
            ConversationMessageResponse(
                role=message.role,
                content=message.content,
                artifact_reference=message.artifact_reference,
            )
            for message in conversation.messages
        ],
    )
