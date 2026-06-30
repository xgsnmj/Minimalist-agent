from fastapi import Depends, FastAPI, status

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
