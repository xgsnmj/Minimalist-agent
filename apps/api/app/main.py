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
from apps.api.app.conversations import (
    ConversationCreateRequest,
    ConversationRenameRequest,
    ConversationResponse,
    conversation_store,
    to_conversation_response,
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


@app.post("/conversations", response_model=ConversationResponse, status_code=status.HTTP_201_CREATED)
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


@app.get("/conversations", response_model=list[ConversationResponse])
def list_conversations(
    account: LocalAccount = Depends(current_user),
) -> list[ConversationResponse]:
    return [
        to_conversation_response(conversation)
        for conversation in conversation_store.list_for_user(account.id)
    ]


@app.get("/conversations/{conversation_id}", response_model=ConversationResponse)
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


@app.patch("/conversations/{conversation_id}", response_model=ConversationResponse)
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


@app.delete("/conversations/{conversation_id}", response_model=ConversationResponse)
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
