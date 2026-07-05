from dataclasses import dataclass
from datetime import UTC, datetime
from enum import StrEnum
import secrets

from fastapi import Depends, Header, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import Integer, String, Text, delete, func, select
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.app.database import Base, SessionLocal, engine


class UserRole(StrEnum):
    USER = "user"
    ADMIN = "admin"


class UserStatus(StrEnum):
    PENDING = "pending"
    ENABLED = "enabled"
    REJECTED = "rejected"
    DISABLED = "disabled"


class AccountAuditAction(StrEnum):
    REGISTERED = "registered"
    BOOTSTRAPPED = "bootstrapped"
    APPROVED = "approved"
    REJECTED = "rejected"
    DISABLED = "disabled"
    ENABLED = "enabled"
    UPDATED = "updated"


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
    note: str = ""
    status_reason: str = ""
    created_at: str
    updated_at: str


class UpdateCurrentUserRequest(BaseModel):
    username: str | None = Field(default=None, min_length=1, max_length=80)
    email: EmailStr | None = None


class AdminAccountUpdateRequest(BaseModel):
    note: str | None = None
    role: UserRole | None = None


class AccountStatusMutationRequest(BaseModel):
    reason: str = ""


class AccountAuditEventResponse(BaseModel):
    id: int
    account_id: int
    actor_id: int | None
    action: AccountAuditAction
    reason: str
    note: str
    created_at: str


@dataclass
class LocalAccount:
    id: int
    username: str
    email: str | None
    password: str
    role: UserRole
    status: UserStatus
    note: str
    status_reason: str
    created_at: str
    updated_at: str


@dataclass
class AccountAuditEvent:
    id: int
    account_id: int
    actor_id: int | None
    action: AccountAuditAction
    reason: str
    note: str
    created_at: str


class LocalAccountRecord(Base):
    __tablename__ = "local_accounts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(80), nullable=False, unique=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True, unique=True)
    password: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    note: Mapped[str] = mapped_column(Text, nullable=False, default="")
    status_reason: Mapped[str] = mapped_column(Text, nullable=False, default="")
    created_at: Mapped[str] = mapped_column(String(64), nullable=False)
    updated_at: Mapped[str] = mapped_column(String(64), nullable=False)


class AccountAuditEventRecord(Base):
    __tablename__ = "account_audit_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    account_id: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    actor_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    action: Mapped[str] = mapped_column(String(32), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False, default="")
    note: Mapped[str] = mapped_column(Text, nullable=False, default="")
    created_at: Mapped[str] = mapped_column(String(64), nullable=False)


class LocalSessionRecord(Base):
    __tablename__ = "local_sessions"

    token: Mapped[str] = mapped_column(String(96), primary_key=True)
    account_id: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    created_at: Mapped[str] = mapped_column(String(64), nullable=False)


class LocalAccountStore:
    def reset(self) -> None:
        Base.metadata.create_all(bind=engine)
        with SessionLocal() as session:
            session.query(LocalSessionRecord).delete()
            session.query(AccountAuditEventRecord).delete()
            session.query(LocalAccountRecord).delete()
            session.commit()

    def register(self, request: RegisterRequest) -> LocalAccount:
        with SessionLocal() as session:
            if self._find_by_login(session, request.username) is not None:
                raise _account_exists_error()
            if request.email and self._find_by_login(session, str(request.email)) is not None:
                raise _account_exists_error()
            now = _now()
            record = LocalAccountRecord(
                username=request.username,
                email=str(request.email) if request.email else None,
                password=request.password,
                role=UserRole.USER.value,
                status=UserStatus.PENDING.value,
                note="",
                status_reason="",
                created_at=now,
                updated_at=now,
            )
            session.add(record)
            session.flush()
            self._record_audit_event(
                session,
                account_id=record.id,
                actor_id=None,
                action=AccountAuditAction.REGISTERED,
            )
            session.commit()
            session.refresh(record)
            return self._account_from_record(record)

    def bootstrap_administrator(self, *, username: str, password: str) -> LocalAccount:
        with SessionLocal() as session:
            existing = self._find_by_login(session, username)
            if existing is not None:
                return self._account_from_record(existing)
            now = _now()
            record = LocalAccountRecord(
                username=username,
                email=None,
                password=password,
                role=UserRole.ADMIN.value,
                status=UserStatus.ENABLED.value,
                note="",
                status_reason="",
                created_at=now,
                updated_at=now,
            )
            session.add(record)
            session.flush()
            self._record_audit_event(
                session,
                account_id=record.id,
                actor_id=None,
                action=AccountAuditAction.BOOTSTRAPPED,
            )
            session.commit()
            session.refresh(record)
            return self._account_from_record(record)

    def approve(
        self,
        account_id: int,
        *,
        actor_id: int | None = None,
        reason: str = "",
    ) -> LocalAccount:
        with SessionLocal() as session:
            record = self._account_record_or_404(session, account_id)
            record.status = UserStatus.ENABLED.value
            record.status_reason = reason
            record.updated_at = _now()
            self._record_audit_event(
                session,
                account_id=record.id,
                actor_id=actor_id,
                action=AccountAuditAction.APPROVED,
                reason=reason,
            )
            session.commit()
            session.refresh(record)
            return self._account_from_record(record)

    def reject(
        self,
        account_id: int,
        *,
        actor_id: int | None = None,
        reason: str = "",
    ) -> LocalAccount:
        if not reason.strip():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Reason is required.",
            )
        with SessionLocal() as session:
            record = self._account_record_or_404(session, account_id)
            record.status = UserStatus.REJECTED.value
            record.status_reason = reason
            record.updated_at = _now()
            session.execute(delete(LocalSessionRecord).where(LocalSessionRecord.account_id == record.id))
            self._record_audit_event(
                session,
                account_id=record.id,
                actor_id=actor_id,
                action=AccountAuditAction.REJECTED,
                reason=reason,
            )
            session.commit()
            session.refresh(record)
            return self._account_from_record(record)

    def disable(
        self,
        account_id: int,
        *,
        actor_id: int | None = None,
        reason: str = "",
    ) -> LocalAccount:
        if not reason.strip():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Reason is required.",
            )
        with SessionLocal() as session:
            record = self._account_record_or_404(session, account_id)
            if actor_id == record.id:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Administrators cannot disable their own account.",
                )
            if (
                record.role == UserRole.ADMIN.value
                and self._enabled_admin_count(session) <= 1
            ):
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Cannot disable the last enabled administrator.",
                )
            record.status = UserStatus.DISABLED.value
            record.status_reason = reason
            record.updated_at = _now()
            session.execute(delete(LocalSessionRecord).where(LocalSessionRecord.account_id == record.id))
            self._record_audit_event(
                session,
                account_id=record.id,
                actor_id=actor_id,
                action=AccountAuditAction.DISABLED,
                reason=reason,
            )
            session.commit()
            session.refresh(record)
            return self._account_from_record(record)

    def enable(
        self,
        account_id: int,
        *,
        actor_id: int | None = None,
        reason: str = "",
    ) -> LocalAccount:
        with SessionLocal() as session:
            record = self._account_record_or_404(session, account_id)
            record.status = UserStatus.ENABLED.value
            record.status_reason = reason
            record.updated_at = _now()
            self._record_audit_event(
                session,
                account_id=record.id,
                actor_id=actor_id,
                action=AccountAuditAction.ENABLED,
                reason=reason,
            )
            session.commit()
            session.refresh(record)
            return self._account_from_record(record)

    def update_account(
        self,
        account_id: int,
        request: AdminAccountUpdateRequest,
        *,
        actor_id: int | None = None,
    ) -> LocalAccount:
        with SessionLocal() as session:
            record = self._account_record_or_404(session, account_id)
            changes: list[str] = []
            if request.note is not None:
                record.note = request.note
                changes.append("note")
            if request.role is not None and request.role.value != record.role:
                if (
                    record.role == UserRole.ADMIN.value
                    and request.role != UserRole.ADMIN
                    and self._enabled_admin_count(session) <= 1
                ):
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail="Cannot remove the last enabled administrator.",
                    )
                record.role = request.role.value
                changes.append("role")
            if changes:
                record.updated_at = _now()
                self._record_audit_event(
                    session,
                    account_id=record.id,
                    actor_id=actor_id,
                    action=AccountAuditAction.UPDATED,
                    note=", ".join(changes),
                )
            session.commit()
            session.refresh(record)
            return self._account_from_record(record)

    def update_current_user(
        self,
        account_id: int,
        request: UpdateCurrentUserRequest,
    ) -> LocalAccount:
        with SessionLocal() as session:
            record = self._account_record_or_404(session, account_id)
            if "username" in request.model_fields_set and request.username is not None:
                existing = self._find_by_login(session, request.username)
                if existing is not None and existing.id != record.id:
                    raise _account_exists_error()
                record.username = request.username
            if "email" in request.model_fields_set and request.email is not None:
                existing = self._find_by_login(session, str(request.email))
                if existing is not None and existing.id != record.id:
                    raise _account_exists_error()
                record.email = str(request.email)
            elif "email" in request.model_fields_set:
                record.email = None
            record.updated_at = _now()
            session.commit()
            session.refresh(record)
            return self._account_from_record(record)

    def list_accounts(self) -> list[LocalAccount]:
        with SessionLocal() as session:
            records = session.scalars(select(LocalAccountRecord).order_by(LocalAccountRecord.id.asc())).all()
            return [self._account_from_record(record) for record in records]

    def get(self, account_id: int) -> LocalAccount:
        with SessionLocal() as session:
            return self._account_from_record(self._account_record_or_404(session, account_id))

    def list_audit_events(self, account_id: int) -> list[AccountAuditEvent]:
        with SessionLocal() as session:
            self._account_record_or_404(session, account_id)
            records = session.scalars(
                select(AccountAuditEventRecord)
                .where(AccountAuditEventRecord.account_id == account_id)
                .order_by(AccountAuditEventRecord.id.asc())
            ).all()
            return [self._audit_event_from_record(record) for record in records]

    def authenticate(self, request: LoginRequest) -> tuple[str, LocalAccount]:
        with SessionLocal() as session:
            record = self._find_by_login(session, request.login)
            if record is None or record.password != request.password:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid login credentials.",
                )
            account = self._account_from_record(record)
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
            token = f"local-{secrets.token_urlsafe(32)}"
            session.add(
                LocalSessionRecord(
                    token=token,
                    account_id=record.id,
                    created_at=_now(),
                )
            )
            session.commit()
            return token, account

    def account_for_token(self, token: str) -> LocalAccount | None:
        with SessionLocal() as session:
            session_record = session.get(LocalSessionRecord, token)
            if session_record is None:
                return None
            account_record = session.get(LocalAccountRecord, session_record.account_id)
            if account_record is None:
                return None
            account = self._account_from_record(account_record)
            if account.status != UserStatus.ENABLED:
                session.delete(session_record)
                session.commit()
                return None
            return account

    def _account_record_or_404(self, session, account_id: int) -> LocalAccountRecord:
        record = session.get(LocalAccountRecord, account_id)
        if record is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Local Account not found.",
            )
        return record

    def _find_by_login(self, session, login: str) -> LocalAccountRecord | None:
        normalized_login = login.lower()
        return session.scalar(
            select(LocalAccountRecord).where(
                (func.lower(LocalAccountRecord.username) == normalized_login)
                | (func.lower(LocalAccountRecord.email) == normalized_login)
            )
        )

    def _enabled_admin_count(self, session) -> int:
        records = session.scalars(
            select(LocalAccountRecord)
            .where(LocalAccountRecord.role == UserRole.ADMIN.value)
            .where(LocalAccountRecord.status == UserStatus.ENABLED.value)
        ).all()
        return len(records)

    def _record_audit_event(
        self,
        session,
        *,
        account_id: int,
        actor_id: int | None,
        action: AccountAuditAction,
        reason: str = "",
        note: str = "",
    ) -> AccountAuditEvent:
        record = AccountAuditEventRecord(
            account_id=account_id,
            actor_id=actor_id,
            action=action.value,
            reason=reason,
            note=note,
            created_at=_now(),
        )
        session.add(record)
        session.flush()
        return self._audit_event_from_record(record)

    def _account_from_record(self, record: LocalAccountRecord) -> LocalAccount:
        return LocalAccount(
            id=record.id,
            username=record.username,
            email=record.email,
            password=record.password,
            role=UserRole(record.role),
            status=UserStatus(record.status),
            note=record.note,
            status_reason=record.status_reason,
            created_at=record.created_at,
            updated_at=record.updated_at,
        )

    def _audit_event_from_record(self, record: AccountAuditEventRecord) -> AccountAuditEvent:
        return AccountAuditEvent(
            id=record.id,
            account_id=record.account_id,
            actor_id=record.actor_id,
            action=AccountAuditAction(record.action),
            reason=record.reason,
            note=record.note,
            created_at=record.created_at,
        )


local_account_store = LocalAccountStore()


def to_user_response(account: LocalAccount) -> UserResponse:
    return UserResponse(
        id=account.id,
        username=account.username,
        email=account.email,
        role=account.role,
        status=account.status,
        note=account.note,
        status_reason=account.status_reason,
        created_at=account.created_at,
        updated_at=account.updated_at,
    )


def to_account_audit_event_response(event: AccountAuditEvent) -> AccountAuditEventResponse:
    return AccountAuditEventResponse(
        id=event.id,
        account_id=event.account_id,
        actor_id=event.actor_id,
        action=event.action,
        reason=event.reason,
        note=event.note,
        created_at=event.created_at,
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


def _now() -> str:
    return datetime.now(UTC).isoformat()


def _account_exists_error() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail="Local Account already exists.",
    )
