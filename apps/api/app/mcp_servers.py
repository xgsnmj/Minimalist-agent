from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum

from fastapi import HTTPException, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import Boolean, Integer, String, Text, UniqueConstraint, select
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.app.database import Base, JsonPayload, SessionLocal, engine


class McpConnectionType(StrEnum):
    SSE = "sse"
    STREAMABLE_HTTP = "streamable_http"


class McpServerDiscoveryStatus(StrEnum):
    NOT_RUN = "not_run"
    SUCCEEDED = "succeeded"
    FAILED = "failed"


class McpServerMutationRequest(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    connection_type: McpConnectionType
    url: str = Field(min_length=1, max_length=2048)
    header_secret_refs: dict[str, str] = Field(default_factory=dict)
    timeout_seconds: int = Field(default=30, ge=1, le=120)
    enabled: bool = True

    @field_validator("url")
    @classmethod
    def validate_remote_url(cls, value: str) -> str:
        if not value.startswith(("https://", "http://")):
            raise ValueError("MCP Server URL must be remote HTTP(S).")
        return value


class McpServerUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    connection_type: McpConnectionType | None = None
    url: str | None = Field(default=None, min_length=1, max_length=2048)
    header_secret_refs: dict[str, str] | None = None
    timeout_seconds: int | None = Field(default=None, ge=1, le=120)
    enabled: bool | None = None

    @field_validator("url")
    @classmethod
    def validate_remote_url(cls, value: str | None) -> str | None:
        if value is not None and not value.startswith(("https://", "http://")):
            raise ValueError("MCP Server URL must be remote HTTP(S).")
        return value


class McpServerResponse(BaseModel):
    id: int
    name: str
    connection_type: McpConnectionType
    url: str
    header_secret_refs: dict[str, str]
    timeout_seconds: int
    enabled: bool
    last_discovery_status: McpServerDiscoveryStatus


class McpDiscoveredToolResponse(BaseModel):
    id: int
    server_id: int
    tool_name: str
    description: str
    input_schema: dict[str, object]


class McpToolAuthorizationRequest(BaseModel):
    server_id: int = Field(gt=0)
    tool_name: str = Field(min_length=1, max_length=240)
    enabled: bool = True


class McpToolAuthorizationResponse(BaseModel):
    id: int
    agent_id: int
    server_id: int
    tool_name: str
    enabled: bool


@dataclass
class McpServer:
    id: int
    name: str
    connection_type: McpConnectionType
    url: str
    header_secret_refs: dict[str, str]
    timeout_seconds: int
    enabled: bool
    last_discovery_status: McpServerDiscoveryStatus = McpServerDiscoveryStatus.NOT_RUN


@dataclass
class McpDiscoveredTool:
    id: int
    server_id: int
    tool_name: str
    description: str
    input_schema: dict[str, object] = field(default_factory=dict)


@dataclass
class McpToolAuthorization:
    id: int
    agent_id: int
    server_id: int
    tool_name: str
    enabled: bool


class McpServerRecord(Base):
    __tablename__ = "mcp_servers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    connection_type: Mapped[str] = mapped_column(String(32), nullable=False)
    url: Mapped[str] = mapped_column(String(2048), nullable=False)
    header_secret_refs: Mapped[dict[str, str]] = mapped_column(
        JsonPayload,
        nullable=False,
        default=dict,
    )
    timeout_seconds: Mapped[int] = mapped_column(Integer, nullable=False, default=30)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    last_discovery_status: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default=McpServerDiscoveryStatus.NOT_RUN.value,
    )


class McpDiscoveredToolRecord(Base):
    __tablename__ = "mcp_discovered_tools"
    __table_args__ = (
        UniqueConstraint("server_id", "tool_name", name="uq_mcp_discovered_tool_name"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    server_id: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    tool_name: Mapped[str] = mapped_column(String(240), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    input_schema: Mapped[dict[str, object]] = mapped_column(
        JsonPayload,
        nullable=False,
        default=dict,
    )


class McpToolAuthorizationRecord(Base):
    __tablename__ = "mcp_tool_authorizations"
    __table_args__ = (
        UniqueConstraint(
            "agent_id",
            "server_id",
            "tool_name",
            name="uq_mcp_tool_authorization",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    agent_id: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    server_id: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    tool_name: Mapped[str] = mapped_column(String(240), nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class McpServerStore:
    def reset(self) -> None:
        McpServerRecord.__table__.create(bind=engine, checkfirst=True)
        McpDiscoveredToolRecord.__table__.create(bind=engine, checkfirst=True)
        McpToolAuthorizationRecord.__table__.create(bind=engine, checkfirst=True)
        with SessionLocal() as session:
            session.query(McpToolAuthorizationRecord).delete()
            session.query(McpDiscoveredToolRecord).delete()
            session.query(McpServerRecord).delete()
            session.commit()

    def create(self, request: McpServerMutationRequest) -> McpServer:
        with SessionLocal() as session:
            record = McpServerRecord(
                name=request.name,
                connection_type=request.connection_type.value,
                url=request.url,
                header_secret_refs=dict(request.header_secret_refs),
                timeout_seconds=request.timeout_seconds,
                enabled=request.enabled,
                last_discovery_status=McpServerDiscoveryStatus.NOT_RUN.value,
            )
            session.add(record)
            session.commit()
            session.refresh(record)
            return _server_from_record(record)

    def update(self, server_id: int, request: McpServerUpdateRequest) -> McpServer:
        with SessionLocal() as session:
            record = self._record_or_404(session, server_id)
            if request.name is not None:
                record.name = request.name
            if request.connection_type is not None:
                record.connection_type = request.connection_type.value
            if request.url is not None:
                record.url = request.url
            if request.header_secret_refs is not None:
                record.header_secret_refs = dict(request.header_secret_refs)
            if request.timeout_seconds is not None:
                record.timeout_seconds = request.timeout_seconds
            if request.enabled is not None:
                record.enabled = request.enabled
            session.commit()
            session.refresh(record)
            return _server_from_record(record)

    def delete(self, server_id: int) -> McpServer:
        with SessionLocal() as session:
            record = self._record_or_404(session, server_id)
            server = _server_from_record(record)
            session.query(McpToolAuthorizationRecord).filter(
                McpToolAuthorizationRecord.server_id == server_id
            ).delete()
            session.query(McpDiscoveredToolRecord).filter(
                McpDiscoveredToolRecord.server_id == server_id
            ).delete()
            session.delete(record)
            session.commit()
            return server

    def list_servers(self) -> list[McpServer]:
        with SessionLocal() as session:
            records = session.scalars(
                select(McpServerRecord).order_by(McpServerRecord.id.asc())
            ).all()
            return [_server_from_record(record) for record in records]

    def get(self, server_id: int) -> McpServer:
        with SessionLocal() as session:
            return _server_from_record(self._record_or_404(session, server_id))

    def discover_tools(self, server_id: int) -> McpServer:
        with SessionLocal() as session:
            record = self._record_or_404(session, server_id)
            record.last_discovery_status = McpServerDiscoveryStatus.SUCCEEDED.value
            existing_names = {
                tool.tool_name
                for tool in session.scalars(
                    select(McpDiscoveredToolRecord).where(
                        McpDiscoveredToolRecord.server_id == server_id
                    )
                ).all()
            }
            for tool_name, description in [
                ("mcp.research.search", "Search research material through the MCP Server."),
                ("mcp.research.fetch", "Fetch a known research document through the MCP Server."),
            ]:
                if tool_name in existing_names:
                    continue
                session.add(
                    McpDiscoveredToolRecord(
                        server_id=server_id,
                        tool_name=tool_name,
                        description=description,
                        input_schema={"type": "object"},
                    )
                )
            session.commit()
            session.refresh(record)
            return _server_from_record(record)

    def list_tools(self, server_id: int) -> list[McpDiscoveredTool]:
        with SessionLocal() as session:
            self._record_or_404(session, server_id)
            records = session.scalars(
                select(McpDiscoveredToolRecord)
                .where(McpDiscoveredToolRecord.server_id == server_id)
                .order_by(McpDiscoveredToolRecord.id.asc())
            ).all()
            return [_tool_from_record(record) for record in records]

    def is_tool_discovered(self, *, server_ids: list[int], tool_name: str) -> bool:
        if not server_ids:
            return False
        with SessionLocal() as session:
            return session.scalar(
                select(McpDiscoveredToolRecord.id)
                .where(McpDiscoveredToolRecord.server_id.in_(server_ids))
                .where(McpDiscoveredToolRecord.tool_name == tool_name)
                .limit(1)
            ) is not None

    def authorize_tool(
        self,
        *,
        agent_id: int,
        request: McpToolAuthorizationRequest,
    ) -> McpToolAuthorization:
        with SessionLocal() as session:
            self._record_or_404(session, request.server_id)
            discovered_tool_id = session.scalar(
                select(McpDiscoveredToolRecord.id)
                .where(McpDiscoveredToolRecord.server_id == request.server_id)
                .where(McpDiscoveredToolRecord.tool_name == request.tool_name)
                .limit(1)
            )
            if discovered_tool_id is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="MCP tool not discovered.",
                )
            existing = self._find_authorization_record(
                session,
                agent_id=agent_id,
                server_id=request.server_id,
                tool_name=request.tool_name,
            )
            if existing is not None:
                existing.enabled = request.enabled
                session.commit()
                session.refresh(existing)
                return _authorization_from_record(existing)
            record = McpToolAuthorizationRecord(
                agent_id=agent_id,
                server_id=request.server_id,
                tool_name=request.tool_name,
                enabled=request.enabled,
            )
            session.add(record)
            session.commit()
            session.refresh(record)
            return _authorization_from_record(record)

    def list_authorizations(
        self,
        *,
        agent_id: int | None = None,
        server_id: int | None = None,
    ) -> list[McpToolAuthorization]:
        with SessionLocal() as session:
            statement = select(McpToolAuthorizationRecord).order_by(
                McpToolAuthorizationRecord.id.asc()
            )
            if agent_id is not None:
                statement = statement.where(McpToolAuthorizationRecord.agent_id == agent_id)
            if server_id is not None:
                statement = statement.where(McpToolAuthorizationRecord.server_id == server_id)
            records = session.scalars(statement).all()
            return [_authorization_from_record(record) for record in records]

    def is_tool_authorized(
        self,
        *,
        agent_id: int,
        server_ids: list[int],
        tool_name: str,
    ) -> bool:
        return self.server_id_for_authorized_tool(
            agent_id=agent_id,
            server_ids=server_ids,
            tool_name=tool_name,
        ) is not None

    def server_id_for_authorized_tool(
        self,
        *,
        agent_id: int,
        server_ids: list[int],
        tool_name: str,
    ) -> int | None:
        if not server_ids:
            return None
        with SessionLocal() as session:
            authorizations = session.scalars(
                select(McpToolAuthorizationRecord)
                .where(McpToolAuthorizationRecord.enabled.is_(True))
                .where(McpToolAuthorizationRecord.agent_id == agent_id)
                .where(McpToolAuthorizationRecord.server_id.in_(server_ids))
                .where(McpToolAuthorizationRecord.tool_name == tool_name)
                .order_by(McpToolAuthorizationRecord.id.asc())
            ).all()
            for authorization in authorizations:
                server = session.get(McpServerRecord, authorization.server_id)
                if server is not None and server.enabled:
                    return authorization.server_id
        return None

    def _record_or_404(self, session, server_id: int) -> McpServerRecord:
        record = session.get(McpServerRecord, server_id)
        if record is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="MCP Server not found.",
            )
        return record

    def _find_authorization_record(
        self,
        session,
        *,
        agent_id: int,
        server_id: int,
        tool_name: str,
    ) -> McpToolAuthorizationRecord | None:
        return session.scalar(
            select(McpToolAuthorizationRecord)
            .where(McpToolAuthorizationRecord.agent_id == agent_id)
            .where(McpToolAuthorizationRecord.server_id == server_id)
            .where(McpToolAuthorizationRecord.tool_name == tool_name)
            .limit(1)
        )


def _server_from_record(record: McpServerRecord) -> McpServer:
    return McpServer(
        id=record.id,
        name=record.name,
        connection_type=McpConnectionType(record.connection_type),
        url=record.url,
        header_secret_refs=dict(record.header_secret_refs or {}),
        timeout_seconds=record.timeout_seconds,
        enabled=record.enabled,
        last_discovery_status=McpServerDiscoveryStatus(record.last_discovery_status),
    )


def _tool_from_record(record: McpDiscoveredToolRecord) -> McpDiscoveredTool:
    return McpDiscoveredTool(
        id=record.id,
        server_id=record.server_id,
        tool_name=record.tool_name,
        description=record.description,
        input_schema=dict(record.input_schema or {}),
    )


def _authorization_from_record(record: McpToolAuthorizationRecord) -> McpToolAuthorization:
    return McpToolAuthorization(
        id=record.id,
        agent_id=record.agent_id,
        server_id=record.server_id,
        tool_name=record.tool_name,
        enabled=record.enabled,
    )


def to_mcp_server_response(server: McpServer) -> McpServerResponse:
    return McpServerResponse(
        id=server.id,
        name=server.name,
        connection_type=server.connection_type,
        url=server.url,
        header_secret_refs=server.header_secret_refs,
        timeout_seconds=server.timeout_seconds,
        enabled=server.enabled,
        last_discovery_status=server.last_discovery_status,
    )


def to_mcp_discovered_tool_response(tool: McpDiscoveredTool) -> McpDiscoveredToolResponse:
    return McpDiscoveredToolResponse(
        id=tool.id,
        server_id=tool.server_id,
        tool_name=tool.tool_name,
        description=tool.description,
        input_schema=tool.input_schema,
    )


def to_mcp_tool_authorization_response(
    authorization: McpToolAuthorization,
) -> McpToolAuthorizationResponse:
    return McpToolAuthorizationResponse(
        id=authorization.id,
        agent_id=authorization.agent_id,
        server_id=authorization.server_id,
        tool_name=authorization.tool_name,
        enabled=authorization.enabled,
    )


mcp_server_store = McpServerStore()
