from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import StrEnum

from fastapi import HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import Boolean, DateTime, Integer, String, Text, select
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.app.database import Base, JsonPayload, SessionLocal, engine


class AgentStatus(StrEnum):
    ENABLED = "enabled"
    DISABLED = "disabled"
    RETIRED = "retired"


class ProcessVisibility(StrEnum):
    MINIMAL = "minimal"
    STANDARD = "standard"
    VERBOSE = "verbose"


class AgentCapabilityPolicyResponse(BaseModel):
    mcp_server_ids: list[int]
    sandbox_enabled: bool
    search_enabled: bool
    page_read_enabled: bool


class AgentResponse(BaseModel):
    id: int
    name: str
    description: str
    icon: str
    status: AgentStatus
    is_default: bool
    instruction: str
    process_visibility: ProcessVisibility
    default_model_configuration_id: int | None
    allowed_model_configuration_ids: list[int]
    capability_policy: AgentCapabilityPolicyResponse


class AgentMutationRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = ""
    icon: str = "agent"
    instruction: str = Field(min_length=1)
    process_visibility: ProcessVisibility = ProcessVisibility.STANDARD
    default_model_configuration_id: int | None = None
    allowed_model_configuration_ids: list[int] = []
    capability_policy: AgentCapabilityPolicyResponse = AgentCapabilityPolicyResponse(
        mcp_server_ids=[],
        sandbox_enabled=False,
        search_enabled=False,
        page_read_enabled=False,
    )


class AgentUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = None
    icon: str | None = None
    instruction: str | None = Field(default=None, min_length=1)
    process_visibility: ProcessVisibility | None = None
    default_model_configuration_id: int | None = None
    allowed_model_configuration_ids: list[int] | None = None
    capability_policy: AgentCapabilityPolicyResponse | None = None


class AgentRunPreparationResponse(BaseModel):
    agent_id: int
    agent_instruction_snapshot: str
    process_visibility: ProcessVisibility
    default_model_configuration_id: int | None
    allowed_model_configuration_ids: list[int]
    capability_policy: AgentCapabilityPolicyResponse


@dataclass
class AgentCapabilityPolicy:
    mcp_server_ids: list[int] = field(default_factory=list)
    sandbox_enabled: bool = False
    search_enabled: bool = False
    page_read_enabled: bool = False


@dataclass
class Agent:
    id: int
    name: str
    description: str
    icon: str
    status: AgentStatus
    is_default: bool
    instruction: str
    process_visibility: ProcessVisibility
    default_model_configuration_id: int | None = None
    allowed_model_configuration_ids: list[int] = field(default_factory=list)
    capability_policy: AgentCapabilityPolicy = field(default_factory=AgentCapabilityPolicy)


class AgentRecord(Base):
    __tablename__ = "agents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    icon: Mapped[str] = mapped_column(String(80), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    instruction: Mapped[str] = mapped_column(Text, nullable=False)
    process_visibility: Mapped[str] = mapped_column(String(32), nullable=False)
    default_model_configuration_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    allowed_model_configuration_ids: Mapped[list[int]] = mapped_column(
        JsonPayload,
        nullable=False,
        default=list,
    )
    capability_policy: Mapped[dict] = mapped_column(JsonPayload, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class AgentStore:
    def reset(self) -> None:
        AgentRecord.__table__.create(bind=engine, checkfirst=True)
        with SessionLocal() as session:
            session.query(AgentRecord).delete()
            default_agent = self._default_agent_record()
            session.add(default_agent)
            session.commit()

    def list_agents(self) -> list[Agent]:
        self._ensure_default_agent()
        with SessionLocal() as session:
            records = session.scalars(select(AgentRecord).order_by(AgentRecord.id.asc())).all()
            return [self._agent_from_record(record) for record in records]

    def create(self, request: AgentMutationRequest) -> Agent:
        self._ensure_default_agent()
        now = _utc_now()
        with SessionLocal() as session:
            record = AgentRecord(
                name=request.name,
                description=request.description,
                icon=request.icon,
                status=AgentStatus.ENABLED.value,
                is_default=False,
                instruction=request.instruction,
                process_visibility=request.process_visibility.value,
                default_model_configuration_id=request.default_model_configuration_id,
                allowed_model_configuration_ids=list(request.allowed_model_configuration_ids),
                capability_policy=_capability_policy_payload(
                    capability_policy_from_response(request.capability_policy)
                ),
                created_at=now,
                updated_at=now,
            )
            session.add(record)
            session.commit()
            session.refresh(record)
            return self._agent_from_record(record)

    def update(self, agent_id: int, request: AgentUpdateRequest) -> Agent:
        self._ensure_default_agent()
        with SessionLocal() as session:
            record = self._agent_record_or_404(session, agent_id)
            if request.name is not None:
                record.name = request.name
            if request.description is not None:
                record.description = request.description
            if request.icon is not None:
                record.icon = request.icon
            if request.instruction is not None:
                record.instruction = request.instruction
            if request.process_visibility is not None:
                record.process_visibility = request.process_visibility.value
            if "default_model_configuration_id" in request.model_fields_set:
                record.default_model_configuration_id = request.default_model_configuration_id
            if request.allowed_model_configuration_ids is not None:
                record.allowed_model_configuration_ids = list(request.allowed_model_configuration_ids)
            if request.capability_policy is not None:
                record.capability_policy = _capability_policy_payload(
                    capability_policy_from_response(request.capability_policy)
                )
            record.updated_at = _utc_now()
            session.commit()
            session.refresh(record)
            return self._agent_from_record(record)

    def set_status(self, agent_id: int, agent_status: AgentStatus) -> Agent:
        self._ensure_default_agent()
        with SessionLocal() as session:
            record = self._agent_record_or_404(session, agent_id)
            record.status = agent_status.value
            record.updated_at = _utc_now()
            session.commit()
            session.refresh(record)
            return self._agent_from_record(record)

    def get(self, agent_id: int) -> Agent:
        self._ensure_default_agent()
        with SessionLocal() as session:
            return self._agent_from_record(self._agent_record_or_404(session, agent_id))

    def _agent_record_or_404(self, session, agent_id: int) -> AgentRecord:
        record = session.get(AgentRecord, agent_id)
        if record is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Agent not found.",
            )
        return record

    def _ensure_default_agent(self) -> None:
        AgentRecord.__table__.create(bind=engine, checkfirst=True)
        with SessionLocal() as session:
            if session.get(AgentRecord, 1) is not None:
                return
            session.add(self._default_agent_record())
            session.commit()

    def _default_agent_record(self) -> AgentRecord:
        now = _utc_now()
        return AgentRecord(
            id=1,
            name="Default Agent",
            description="Primary Agent Conversation entry point.",
            icon="agent",
            status=AgentStatus.ENABLED.value,
            is_default=True,
            instruction="Help the user complete work inside Minimalist Agent.",
            process_visibility=ProcessVisibility.STANDARD.value,
            default_model_configuration_id=None,
            allowed_model_configuration_ids=[],
            capability_policy=_capability_policy_payload(AgentCapabilityPolicy()),
            created_at=now,
            updated_at=now,
        )

    def _agent_from_record(self, record: AgentRecord) -> Agent:
        return Agent(
            id=record.id,
            name=record.name,
            description=record.description,
            icon=record.icon,
            status=AgentStatus(record.status),
            is_default=record.is_default,
            instruction=record.instruction,
            process_visibility=ProcessVisibility(record.process_visibility),
            default_model_configuration_id=record.default_model_configuration_id,
            allowed_model_configuration_ids=list(record.allowed_model_configuration_ids or []),
            capability_policy=_capability_policy_from_payload(record.capability_policy or {}),
        )


agent_store = AgentStore()


def capability_policy_from_response(
    policy: AgentCapabilityPolicyResponse,
) -> AgentCapabilityPolicy:
    return AgentCapabilityPolicy(
        mcp_server_ids=list(policy.mcp_server_ids),
        sandbox_enabled=policy.sandbox_enabled,
        search_enabled=policy.search_enabled,
        page_read_enabled=policy.page_read_enabled,
    )


def _capability_policy_payload(policy: AgentCapabilityPolicy) -> dict:
    return {
        "mcp_server_ids": list(policy.mcp_server_ids),
        "sandbox_enabled": policy.sandbox_enabled,
        "search_enabled": policy.search_enabled,
        "page_read_enabled": policy.page_read_enabled,
    }


def _capability_policy_from_payload(payload: dict) -> AgentCapabilityPolicy:
    return AgentCapabilityPolicy(
        mcp_server_ids=list(payload.get("mcp_server_ids", [])),
        sandbox_enabled=bool(payload.get("sandbox_enabled", False)),
        search_enabled=bool(payload.get("search_enabled", False)),
        page_read_enabled=bool(payload.get("page_read_enabled", False)),
    )


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def to_agent_response(agent: Agent) -> AgentResponse:
    return AgentResponse(
        id=agent.id,
        name=agent.name,
        description=agent.description,
        icon=agent.icon,
        status=agent.status,
        is_default=agent.is_default,
        instruction=agent.instruction,
        process_visibility=agent.process_visibility,
        default_model_configuration_id=agent.default_model_configuration_id,
        allowed_model_configuration_ids=agent.allowed_model_configuration_ids,
        capability_policy=AgentCapabilityPolicyResponse(
            mcp_server_ids=agent.capability_policy.mcp_server_ids,
            sandbox_enabled=agent.capability_policy.sandbox_enabled,
            search_enabled=agent.capability_policy.search_enabled,
            page_read_enabled=agent.capability_policy.page_read_enabled,
        ),
    )


def to_agent_run_preparation_response(agent: Agent) -> AgentRunPreparationResponse:
    return AgentRunPreparationResponse(
        agent_id=agent.id,
        agent_instruction_snapshot=agent.instruction,
        process_visibility=agent.process_visibility,
        default_model_configuration_id=agent.default_model_configuration_id,
        allowed_model_configuration_ids=list(agent.allowed_model_configuration_ids),
        capability_policy=AgentCapabilityPolicyResponse(
            mcp_server_ids=list(agent.capability_policy.mcp_server_ids),
            sandbox_enabled=agent.capability_policy.sandbox_enabled,
            search_enabled=agent.capability_policy.search_enabled,
            page_read_enabled=agent.capability_policy.page_read_enabled,
        ),
    )
