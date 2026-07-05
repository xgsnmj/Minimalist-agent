from fastapi import APIRouter, Body, Depends, status

from apps.api.app.admin_audit import admin_audit_store
from apps.api.app.auth import (
    AccountAuditEventResponse,
    AccountStatusMutationRequest,
    AdminAccountUpdateRequest,
    LocalAccount,
    LoginRequest,
    LoginResponse,
    RegisterRequest,
    UpdateCurrentUserRequest,
    UserResponse,
    current_administrator,
    current_user,
    local_account_store,
    to_account_audit_event_response,
    to_user_response,
)


router = APIRouter(tags=["auth"])


@router.post("/auth/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register_local_account(request: RegisterRequest) -> UserResponse:
    return to_user_response(local_account_store.register(request))


@router.post("/auth/login", response_model=LoginResponse)
def login_local_account(request: LoginRequest) -> LoginResponse:
    token, account = local_account_store.authenticate(request)
    return LoginResponse(access_token=token, user=to_user_response(account))


@router.get("/auth/me", response_model=UserResponse)
def get_current_user(account: LocalAccount = Depends(current_user)) -> UserResponse:
    return to_user_response(account)


@router.patch("/auth/me", response_model=UserResponse)
def update_current_user(
    request: UpdateCurrentUserRequest,
    account: LocalAccount = Depends(current_user),
) -> UserResponse:
    return to_user_response(
        local_account_store.update_current_user(account.id, request),
    )


@router.get("/admin/accounts", response_model=list[UserResponse])
def list_local_accounts(
    _administrator: LocalAccount = Depends(current_administrator),
) -> list[UserResponse]:
    return [
        to_user_response(account)
        for account in local_account_store.list_accounts()
    ]


@router.get("/admin/accounts/{account_id}", response_model=UserResponse)
def get_local_account(
    account_id: int,
    _administrator: LocalAccount = Depends(current_administrator),
) -> UserResponse:
    return to_user_response(local_account_store.get(account_id))


@router.patch("/admin/accounts/{account_id}", response_model=UserResponse)
def update_local_account(
    account_id: int,
    request: AdminAccountUpdateRequest,
    administrator: LocalAccount = Depends(current_administrator),
) -> UserResponse:
    before = to_user_response(local_account_store.get(account_id)).model_dump(mode="json")
    updated_account = local_account_store.update_account(
        account_id,
        request,
        actor_id=administrator.id,
    )
    after = to_user_response(updated_account).model_dump(mode="json")
    admin_audit_store.record(
        actor_id=administrator.id,
        target_type="local_account",
        target_id=account_id,
        action="updated",
        before=before,
        after=after,
    )
    return to_user_response(updated_account)


@router.post("/admin/accounts/{account_id}/approve", response_model=UserResponse)
def approve_local_account(
    account_id: int,
    request: AccountStatusMutationRequest = Body(default_factory=AccountStatusMutationRequest),
    administrator: LocalAccount = Depends(current_administrator),
) -> UserResponse:
    before = to_user_response(local_account_store.get(account_id)).model_dump(mode="json")
    updated_account = local_account_store.approve(
        account_id,
        actor_id=administrator.id,
        reason=request.reason,
    )
    _record_account_admin_audit(
        actor_id=administrator.id,
        account_id=account_id,
        action="approved",
        before=before,
        after=to_user_response(updated_account).model_dump(mode="json"),
        reason=request.reason,
    )
    return to_user_response(updated_account)


@router.post("/admin/accounts/{account_id}/reject", response_model=UserResponse)
def reject_local_account(
    account_id: int,
    request: AccountStatusMutationRequest,
    administrator: LocalAccount = Depends(current_administrator),
) -> UserResponse:
    before = to_user_response(local_account_store.get(account_id)).model_dump(mode="json")
    updated_account = local_account_store.reject(
        account_id,
        actor_id=administrator.id,
        reason=request.reason,
    )
    _record_account_admin_audit(
        actor_id=administrator.id,
        account_id=account_id,
        action="rejected",
        before=before,
        after=to_user_response(updated_account).model_dump(mode="json"),
        reason=request.reason,
    )
    return to_user_response(updated_account)


@router.post("/admin/accounts/{account_id}/disable", response_model=UserResponse)
def disable_local_account(
    account_id: int,
    request: AccountStatusMutationRequest,
    administrator: LocalAccount = Depends(current_administrator),
) -> UserResponse:
    before = to_user_response(local_account_store.get(account_id)).model_dump(mode="json")
    updated_account = local_account_store.disable(
        account_id,
        actor_id=administrator.id,
        reason=request.reason,
    )
    _record_account_admin_audit(
        actor_id=administrator.id,
        account_id=account_id,
        action="disabled",
        before=before,
        after=to_user_response(updated_account).model_dump(mode="json"),
        reason=request.reason,
    )
    return to_user_response(updated_account)


@router.post("/admin/accounts/{account_id}/enable", response_model=UserResponse)
def enable_local_account(
    account_id: int,
    request: AccountStatusMutationRequest = Body(default_factory=AccountStatusMutationRequest),
    administrator: LocalAccount = Depends(current_administrator),
) -> UserResponse:
    before = to_user_response(local_account_store.get(account_id)).model_dump(mode="json")
    updated_account = local_account_store.enable(
        account_id,
        actor_id=administrator.id,
        reason=request.reason,
    )
    _record_account_admin_audit(
        actor_id=administrator.id,
        account_id=account_id,
        action="enabled",
        before=before,
        after=to_user_response(updated_account).model_dump(mode="json"),
        reason=request.reason,
    )
    return to_user_response(updated_account)


@router.get(
    "/admin/accounts/{account_id}/audit-events",
    response_model=list[AccountAuditEventResponse],
)
def list_local_account_audit_events(
    account_id: int,
    _administrator: LocalAccount = Depends(current_administrator),
) -> list[AccountAuditEventResponse]:
    return [
        to_account_audit_event_response(event)
        for event in local_account_store.list_audit_events(account_id)
    ]


def _record_account_admin_audit(
    *,
    actor_id: int,
    account_id: int,
    action: str,
    before: dict,
    after: dict,
    reason: str,
) -> None:
    admin_audit_store.record(
        actor_id=actor_id,
        target_type="local_account",
        target_id=account_id,
        action=action,
        before=before,
        after=after,
        reason=reason,
    )
