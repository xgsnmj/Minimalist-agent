from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum

from fastapi import HTTPException, status
from pydantic import BaseModel, Field, field_validator


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


class McpServerStore:
    def __init__(self) -> None:
        self.reset()

    def reset(self) -> None:
        self._next_server_id = 1
        self._next_tool_id = 1
        self._next_authorization_id = 1
        self._servers: dict[int, McpServer] = {}
        self._tools: dict[int, McpDiscoveredTool] = {}
        self._authorizations: dict[int, McpToolAuthorization] = {}

    def create(self, request: McpServerMutationRequest) -> McpServer:
        server = McpServer(
            id=self._next_server_id,
            name=request.name,
            connection_type=request.connection_type,
            url=request.url,
            header_secret_refs=dict(request.header_secret_refs),
            timeout_seconds=request.timeout_seconds,
            enabled=request.enabled,
        )
        self._next_server_id += 1
        self._servers[server.id] = server
        return server

    def list_servers(self) -> list[McpServer]:
        return sorted(self._servers.values(), key=lambda server: server.id)

    def get(self, server_id: int) -> McpServer:
        server = self._servers.get(server_id)
        if server is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="MCP Server not found.",
            )
        return server

    def discover_tools(self, server_id: int) -> McpServer:
        server = self.get(server_id)
        server.last_discovery_status = McpServerDiscoveryStatus.SUCCEEDED
        existing_names = {tool.tool_name for tool in self.list_tools(server_id)}
        for tool_name, description in [
            ("mcp.research.search", "Search research material through the MCP Server."),
            ("mcp.research.fetch", "Fetch a known research document through the MCP Server."),
        ]:
            if tool_name in existing_names:
                continue
            tool = McpDiscoveredTool(
                id=self._next_tool_id,
                server_id=server.id,
                tool_name=tool_name,
                description=description,
                input_schema={"type": "object"},
            )
            self._next_tool_id += 1
            self._tools[tool.id] = tool
        return server

    def list_tools(self, server_id: int) -> list[McpDiscoveredTool]:
        self.get(server_id)
        return [
            tool
            for tool in sorted(self._tools.values(), key=lambda item: item.id)
            if tool.server_id == server_id
        ]

    def is_tool_discovered(self, *, server_ids: list[int], tool_name: str) -> bool:
        return any(
            tool.server_id in server_ids and tool.tool_name == tool_name
            for tool in self._tools.values()
        )

    def authorize_tool(
        self,
        *,
        agent_id: int,
        request: McpToolAuthorizationRequest,
    ) -> McpToolAuthorization:
        self.get(request.server_id)
        if not any(
            tool.tool_name == request.tool_name
            for tool in self.list_tools(request.server_id)
        ):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="MCP tool not discovered.",
            )
        existing = self._find_authorization(
            agent_id=agent_id,
            server_id=request.server_id,
            tool_name=request.tool_name,
        )
        if existing is not None:
            existing.enabled = request.enabled
            return existing
        authorization = McpToolAuthorization(
            id=self._next_authorization_id,
            agent_id=agent_id,
            server_id=request.server_id,
            tool_name=request.tool_name,
            enabled=request.enabled,
        )
        self._next_authorization_id += 1
        self._authorizations[authorization.id] = authorization
        return authorization

    def is_tool_authorized(
        self,
        *,
        agent_id: int,
        server_ids: list[int],
        tool_name: str,
    ) -> bool:
        for authorization in self._authorizations.values():
            if (
                authorization.enabled
                and authorization.agent_id == agent_id
                and authorization.server_id in server_ids
                and authorization.tool_name == tool_name
            ):
                server = self.get(authorization.server_id)
                return server.enabled
        return False

    def server_id_for_authorized_tool(
        self,
        *,
        agent_id: int,
        server_ids: list[int],
        tool_name: str,
    ) -> int | None:
        for authorization in self._authorizations.values():
            if (
                authorization.enabled
                and authorization.agent_id == agent_id
                and authorization.server_id in server_ids
                and authorization.tool_name == tool_name
            ):
                return authorization.server_id
        return None

    def _find_authorization(
        self,
        *,
        agent_id: int,
        server_id: int,
        tool_name: str,
    ) -> McpToolAuthorization | None:
        for authorization in self._authorizations.values():
            if (
                authorization.agent_id == agent_id
                and authorization.server_id == server_id
                and authorization.tool_name == tool_name
            ):
                return authorization
        return None


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
