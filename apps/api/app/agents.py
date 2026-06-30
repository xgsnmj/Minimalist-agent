from dataclasses import dataclass, field
from enum import StrEnum

from fastapi import HTTPException, status
from pydantic import BaseModel, Field


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


class AgentStore:
    def __init__(self) -> None:
        self.reset()

    def reset(self) -> None:
        self._next_id = 2
        self._agents: dict[int, Agent] = {
            1: Agent(
                id=1,
                name="Default Agent",
                description="Primary Agent Conversation entry point.",
                icon="agent",
                status=AgentStatus.ENABLED,
                is_default=True,
                instruction="Help the user complete work inside Minimalist Agent.",
                process_visibility=ProcessVisibility.STANDARD,
            )
        }

    def list_agents(self) -> list[Agent]:
        return sorted(self._agents.values(), key=lambda agent: agent.id)

    def create(self, request: AgentMutationRequest) -> Agent:
        agent = Agent(
            id=self._next_id,
            name=request.name,
            description=request.description,
            icon=request.icon,
            status=AgentStatus.ENABLED,
            is_default=False,
            instruction=request.instruction,
            process_visibility=request.process_visibility,
            default_model_configuration_id=request.default_model_configuration_id,
            allowed_model_configuration_ids=list(request.allowed_model_configuration_ids),
            capability_policy=capability_policy_from_response(request.capability_policy),
        )
        self._next_id += 1
        self._agents[agent.id] = agent
        return agent

    def update(self, agent_id: int, request: AgentUpdateRequest) -> Agent:
        agent = self._agent_or_404(agent_id)
        if request.name is not None:
            agent.name = request.name
        if request.description is not None:
            agent.description = request.description
        if request.icon is not None:
            agent.icon = request.icon
        if request.instruction is not None:
            agent.instruction = request.instruction
        if request.process_visibility is not None:
            agent.process_visibility = request.process_visibility
        if "default_model_configuration_id" in request.model_fields_set:
            agent.default_model_configuration_id = request.default_model_configuration_id
        if request.allowed_model_configuration_ids is not None:
            agent.allowed_model_configuration_ids = list(request.allowed_model_configuration_ids)
        if request.capability_policy is not None:
            agent.capability_policy = capability_policy_from_response(request.capability_policy)
        return agent

    def set_status(self, agent_id: int, agent_status: AgentStatus) -> Agent:
        agent = self._agent_or_404(agent_id)
        agent.status = agent_status
        return agent

    def get(self, agent_id: int) -> Agent:
        return self._agent_or_404(agent_id)

    def _agent_or_404(self, agent_id: int) -> Agent:
        agent = self._agents.get(agent_id)
        if agent is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Agent not found.",
            )
        return agent


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
