from fastapi import Depends, FastAPI, status

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
