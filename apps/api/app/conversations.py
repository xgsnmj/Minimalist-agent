from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any

from fastapi import HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import Boolean, Integer, String, Text, select
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.app.agents import Agent, AgentResponse, to_agent_response
from apps.api.app.artifacts import ArtifactMessageReference
from apps.api.app.card_schema_registry import CardResponse
from apps.api.app.database import Base, JsonPayload, SessionLocal, engine


class ConversationStatus(StrEnum):
    IDLE = "idle"
    RUNNING = "running"


class ConversationMessageResponse(BaseModel):
    role: str
    content: str
    artifact_reference: ArtifactMessageReference | None = None
    card: CardResponse | None = None
    run_id: int | None = None
    event_sequence: int | None = None
    event_type: str | None = None
    process_summary: str | None = None
    tool_call: dict[str, Any] | None = None


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
    card: CardResponse | None = None
    run_id: int | None = None
    event_sequence: int | None = None
    event_type: str | None = None
    process_summary: str | None = None
    tool_call: dict[str, Any] | None = None


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


class ConversationRecord(Base):
    __tablename__ = "agent_conversations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    owner_user_id: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    agent_id: Mapped[int] = mapped_column(Integer, nullable=False)
    selected_model_configuration_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    updated_at: Mapped[str] = mapped_column(String(64), nullable=False)
    deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class ConversationMessageRecord(Base):
    __tablename__ = "agent_conversation_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    conversation_id: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    role: Mapped[str] = mapped_column(String(32), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    artifact_reference: Mapped[dict | None] = mapped_column(JsonPayload, nullable=True)
    card: Mapped[dict | None] = mapped_column(JsonPayload, nullable=True)


class ConversationStore:
    def reset(self) -> None:
        ConversationRecord.__table__.create(bind=engine, checkfirst=True)
        ConversationMessageRecord.__table__.create(bind=engine, checkfirst=True)
        with SessionLocal() as session:
            session.query(ConversationMessageRecord).delete()
            session.query(ConversationRecord).delete()
            session.commit()

    def create(
        self,
        *,
        owner_user_id: int,
        request: ConversationCreateRequest,
        agent: Agent,
    ) -> AgentConversation:
        with SessionLocal() as session:
            record = ConversationRecord(
                owner_user_id=owner_user_id,
                title=request.title,
                agent_id=agent.id,
                selected_model_configuration_id=request.selected_model_configuration_id,
                status=ConversationStatus.IDLE.value,
                updated_at="just now",
                deleted=False,
            )
            session.add(record)
            session.flush()
            self._append_message_record(
                session,
                conversation_id=record.id,
                role="user",
                content=request.initial_message,
            )
            session.commit()
            session.refresh(record)
            return self._conversation_from_record(session, record)

    def create_empty(
        self,
        *,
        owner_user_id: int,
        title: str,
        agent: Agent,
        selected_model_configuration_id: int | None = None,
    ) -> AgentConversation:
        with SessionLocal() as session:
            record = ConversationRecord(
                owner_user_id=owner_user_id,
                title=title,
                agent_id=agent.id,
                selected_model_configuration_id=selected_model_configuration_id,
                status=ConversationStatus.IDLE.value,
                updated_at="just now",
                deleted=False,
            )
            session.add(record)
            session.commit()
            session.refresh(record)
            return self._conversation_from_record(session, record)

    def list_for_user(self, owner_user_id: int) -> list[AgentConversation]:
        with SessionLocal() as session:
            records = session.scalars(
                select(ConversationRecord)
                .where(ConversationRecord.owner_user_id == owner_user_id)
                .where(ConversationRecord.deleted.is_(False))
                .order_by(ConversationRecord.id.desc())
            ).all()
            return [self._conversation_from_record(session, record) for record in records]

    def get_for_user(self, *, owner_user_id: int, conversation_id: int) -> AgentConversation:
        with SessionLocal() as session:
            record = self._conversation_record_or_404(session, conversation_id)
            if record.owner_user_id != owner_user_id:
                raise _conversation_not_found()
            return self._conversation_from_record(session, record)

    def rename_for_user(
        self,
        *,
        owner_user_id: int,
        conversation_id: int,
        request: ConversationRenameRequest,
    ) -> AgentConversation:
        with SessionLocal() as session:
            record = self._conversation_record_or_404(session, conversation_id)
            if record.owner_user_id != owner_user_id:
                raise _conversation_not_found()
            record.title = request.title
            record.updated_at = "just now"
            session.commit()
            session.refresh(record)
            return self._conversation_from_record(session, record)

    def soft_delete_for_user(
        self,
        *,
        owner_user_id: int,
        conversation_id: int,
    ) -> AgentConversation:
        with SessionLocal() as session:
            record = self._conversation_record_or_404(session, conversation_id)
            if record.owner_user_id != owner_user_id:
                raise _conversation_not_found()
            record.deleted = True
            record.updated_at = "just now"
            session.commit()
            session.refresh(record)
            return self._conversation_from_record(session, record, include_deleted=True)

    def append_message(
        self,
        *,
        conversation_id: int,
        role: str,
        content: str,
        artifact_reference: ArtifactMessageReference | None = None,
        card: CardResponse | None = None,
    ) -> AgentConversation:
        with SessionLocal() as session:
            record = self._conversation_record_or_404(session, conversation_id)
            self._append_message_record(
                session,
                conversation_id=conversation_id,
                role=role,
                content=content,
                artifact_reference=artifact_reference,
                card=card,
            )
            record.updated_at = "just now"
            session.commit()
            session.refresh(record)
            return self._conversation_from_record(session, record)

    def set_status(
        self,
        *,
        conversation_id: int,
        conversation_status: ConversationStatus,
    ) -> AgentConversation:
        with SessionLocal() as session:
            record = self._conversation_record_or_404(session, conversation_id)
            record.status = conversation_status.value
            record.updated_at = "just now"
            session.commit()
            session.refresh(record)
            return self._conversation_from_record(session, record)

    def _conversation_record_or_404(
        self,
        session,
        conversation_id: int,
        *,
        include_deleted: bool = False,
    ) -> ConversationRecord:
        record = session.get(ConversationRecord, conversation_id)
        if record is None or (record.deleted and not include_deleted):
            raise _conversation_not_found()
        return record

    def _append_message_record(
        self,
        session,
        *,
        conversation_id: int,
        role: str,
        content: str,
        artifact_reference: ArtifactMessageReference | None = None,
        card: CardResponse | None = None,
    ) -> ConversationMessageRecord:
        sequence = self._next_message_sequence(session, conversation_id)
        record = ConversationMessageRecord(
            conversation_id=conversation_id,
            sequence=sequence,
            role=role,
            content=content,
            artifact_reference=(
                artifact_reference.model_dump(mode="json")
                if artifact_reference is not None
                else None
            ),
            card=(card.model_dump(mode="json", by_alias=True) if card is not None else None),
        )
        session.add(record)
        return record

    def _next_message_sequence(self, session, conversation_id: int) -> int:
        result = session.scalar(
            select(ConversationMessageRecord.sequence)
            .where(ConversationMessageRecord.conversation_id == conversation_id)
            .order_by(ConversationMessageRecord.sequence.desc())
            .limit(1)
        )
        return int(result or 0) + 1

    def _conversation_from_record(
        self,
        session,
        record: ConversationRecord,
        *,
        include_deleted: bool = False,
    ) -> AgentConversation:
        if record.deleted and not include_deleted:
            raise _conversation_not_found()
        messages = session.scalars(
            select(ConversationMessageRecord)
            .where(ConversationMessageRecord.conversation_id == record.id)
            .order_by(ConversationMessageRecord.sequence.asc())
        ).all()
        return AgentConversation(
            id=record.id,
            owner_user_id=record.owner_user_id,
            title=record.title,
            agent=agent_store.get(record.agent_id),
            selected_model_configuration_id=record.selected_model_configuration_id,
            updated_at=record.updated_at,
            status=ConversationStatus(record.status),
            deleted=record.deleted,
            messages=[_message_from_record(message) for message in messages],
        )


conversation_store = ConversationStore()


from apps.api.app.agents import agent_store  # noqa: E402


def _conversation_not_found() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Agent Conversation not found.",
    )


def _message_from_record(record: ConversationMessageRecord) -> ConversationMessage:
    return ConversationMessage(
        role=record.role,
        content=record.content,
        artifact_reference=(
            ArtifactMessageReference.model_validate(record.artifact_reference)
            if record.artifact_reference is not None
            else None
        ),
        card=(CardResponse.model_validate(record.card) if record.card is not None else None),
    )


def to_conversation_response(conversation: AgentConversation) -> ConversationResponse:
    messages = [
        ConversationMessageResponse(
            role=message.role,
            content=message.content,
            artifact_reference=message.artifact_reference,
            card=message.card,
            run_id=message.run_id,
            event_sequence=message.event_sequence,
            event_type=message.event_type,
            process_summary=message.process_summary,
            tool_call=message.tool_call,
        )
        for message in conversation.messages
    ]

    return ConversationResponse(
        id=conversation.id,
        title=conversation.title,
        agent=to_agent_response(conversation.agent),
        selected_model_configuration_id=conversation.selected_model_configuration_id,
        status=conversation.status,
        updated_at=conversation.updated_at,
        deleted=conversation.deleted,
        messages=_merge_run_event_messages(conversation=conversation, messages=messages),
    )


def _merge_run_event_messages(
    *,
    conversation: AgentConversation,
    messages: list[ConversationMessageResponse],
) -> list[ConversationMessageResponse]:
    from apps.api.app.agent_runs import agent_run_store
    from apps.api.app.run_event_log import run_event_log_store

    runs = [
        run
        for run in sorted(agent_run_store.list_all(), key=lambda item: item.id)
        if run.conversation_id == conversation.id
    ]
    if not runs:
        return messages

    remaining_runs = list(runs)
    merged_messages: list[ConversationMessageResponse] = []
    for message in messages:
        merged_messages.append(message)
        if message.role != "user":
            continue
        matched_run = next(
            (run for run in remaining_runs if run.user_message == message.content),
            None,
        )
        if matched_run is None:
            continue
        remaining_runs.remove(matched_run)
        merged_messages.extend(
            _visible_event_messages(
                run_id=matched_run.id,
                events=run_event_log_store.list_after(
                    run_id=matched_run.id,
                    after_sequence=0,
                ),
            )
        )

    for run in remaining_runs:
        merged_messages.extend(
            _visible_event_messages(
                run_id=run.id,
                events=run_event_log_store.list_after(
                    run_id=run.id,
                    after_sequence=0,
                ),
            )
        )

    return merged_messages


def _visible_event_messages(*, run_id: int, events) -> list[ConversationMessageResponse]:
    messages: list[ConversationMessageResponse] = []
    for event in events:
        if event.event_type == "process.summary":
            summary = str(event.data.get("summary", "")).strip()
            if not summary:
                continue
            messages.append(
                ConversationMessageResponse(
                    role="assistant",
                    content=f"运行过程：{summary}",
                    run_id=run_id,
                    event_sequence=event.sequence,
                    event_type=event.event_type,
                    process_summary=summary,
                )
            )
        if event.event_type == "tool.call":
            tool_call = event.data.get("tool_call")
            if not isinstance(tool_call, dict):
                continue
            tool_name = str(tool_call.get("tool_name", "工具"))
            status = str(tool_call.get("status", "completed"))
            messages.append(
                ConversationMessageResponse(
                    role="assistant",
                    content=f"工具调用：{tool_name}（{status}）",
                    run_id=run_id,
                    event_sequence=event.sequence,
                    event_type=event.event_type,
                    tool_call=tool_call,
                )
            )
    return messages
