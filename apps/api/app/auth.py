from dataclasses import dataclass
from enum import StrEnum

from fastapi import Depends, Header, HTTPException, status
from pydantic import BaseModel, EmailStr, Field


class UserRole(StrEnum):
    USER = "user"
    ADMIN = "admin"


class UserStatus(StrEnum):
    PENDING = "pending"
    ENABLED = "enabled"
    REJECTED = "rejected"
    DISABLED = "disabled"


class RegisterRequest(BaseModel):
    username: str = Field(min_length=1, max_length=80)
    email: EmailStr | None = None
    password: str = Field(min_length=8)


class LoginRequest(BaseModel):
    login: str = Field(min_length=1)
    password: str = Field(min_length=8)


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserResponse"


class UserResponse(BaseModel):
    id: int
    username: str
    email: EmailStr | None
    role: UserRole
    status: UserStatus


@dataclass
class LocalAccount:
    id: int
    username: str
    email: str | None
    password: str
    role: UserRole
    status: UserStatus


class LocalAccountStore:
    def __init__(self) -> None:
        self.reset()

    def reset(self) -> None:
        self._next_id = 1
        self._accounts: dict[int, LocalAccount] = {}
        self._tokens: dict[str, int] = {}

    def register(self, request: RegisterRequest) -> LocalAccount:
        if self._find_by_login(request.username) is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Local Account already exists.",
            )
        if request.email and self._find_by_login(request.email) is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Local Account already exists.",
            )
        account = LocalAccount(
            id=self._next_id,
            username=request.username,
            email=str(request.email) if request.email else None,
            password=request.password,
            role=UserRole.USER,
            status=UserStatus.PENDING,
        )
        self._next_id += 1
        self._accounts[account.id] = account
        return account

    def bootstrap_administrator(self, *, username: str, password: str) -> LocalAccount:
        existing = self._find_by_login(username)
        if existing is not None:
            return existing
        account = LocalAccount(
            id=self._next_id,
            username=username,
            email=None,
            password=password,
            role=UserRole.ADMIN,
            status=UserStatus.ENABLED,
        )
        self._next_id += 1
        self._accounts[account.id] = account
        return account

    def approve(self, account_id: int) -> LocalAccount:
        account = self._account_or_404(account_id)
        account.status = UserStatus.ENABLED
        return account

    def reject(self, account_id: int) -> LocalAccount:
        account = self._account_or_404(account_id)
        account.status = UserStatus.REJECTED
        return account

    def disable(self, account_id: int) -> LocalAccount:
        account = self._account_or_404(account_id)
        account.status = UserStatus.DISABLED
        return account

    def authenticate(self, request: LoginRequest) -> tuple[str, LocalAccount]:
        account = self._find_by_login(request.login)
        if account is None or account.password != request.password:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid login credentials.",
            )
        if account.status == UserStatus.PENDING:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Account is pending approval.",
            )
        if account.status == UserStatus.REJECTED:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Account has been rejected.",
            )
        if account.status == UserStatus.DISABLED:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Account is disabled.",
            )
        token = f"local-{account.id}"
        self._tokens[token] = account.id
        return token, account

    def account_for_token(self, token: str) -> LocalAccount | None:
        account_id = self._tokens.get(token)
        if account_id is None:
            return None
        return self._accounts.get(account_id)

    def _account_or_404(self, account_id: int) -> LocalAccount:
        account = self._accounts.get(account_id)
        if account is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Local Account not found.",
            )
        return account

    def _find_by_login(self, login: str) -> LocalAccount | None:
        normalized_login = login.lower()
        for account in self._accounts.values():
            if account.username.lower() == normalized_login:
                return account
            if account.email and account.email.lower() == normalized_login:
                return account
        return None


local_account_store = LocalAccountStore()


def to_user_response(account: LocalAccount) -> UserResponse:
    return UserResponse(
        id=account.id,
        username=account.username,
        email=account.email,
        role=account.role,
        status=account.status,
    )


def current_user(authorization: str | None = Header(default=None)) -> LocalAccount:
    if authorization is None or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required.",
        )
    token = authorization.removeprefix("Bearer ").strip()
    account = local_account_store.account_for_token(token)
    if account is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required.",
        )
    return account


def current_administrator(account: LocalAccount = Depends(current_user)) -> LocalAccount:
    if account.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrator access required.",
        )
    return account
