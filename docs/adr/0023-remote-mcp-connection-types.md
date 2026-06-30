# Remote MCP connection types first

Minimalist Agent will support SSE and streamable HTTP MCP connection types in the MVP and will not support stdio MCP servers initially. Remote MCP transports fit the platform governance model better because Administrators can manage URLs, header secret references, timeouts, discovery checks, and per-Agent tool authorization without allowing arbitrary local command execution. Stdio support can be reconsidered later if the platform needs tightly controlled self-hosted MCP servers with a stronger command allowlist and execution boundary.
