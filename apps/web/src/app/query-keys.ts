export const queryKeys = {
  admin: {
    all: ["admin"] as const,
    accounts: ["admin", "accounts"] as const,
    accountAuditEvents: (accountId: number) => ["admin", "account-audit-events", accountId] as const,
    agents: ["admin", "agents"] as const,
    fullTrace: (runId: number) => ["admin", "full-trace", runId] as const,
    mcpServerTools: (serverId: number) => ["admin", "mcp-server-tools", serverId] as const,
    mcpServers: ["admin", "mcp-servers"] as const,
    modelConfigurations: ["admin", "model-configurations"] as const,
    modelProviders: ["admin", "model-providers"] as const,
    pageReadProviders: ["admin", "page-read-providers"] as const,
    runAudit: (status: string | null = null) => ["admin", "run-audit", status] as const,
    runAuditDetail: (runId: number) => ["admin", "run-audit-detail", runId] as const,
    searchProviders: ["admin", "search-providers"] as const,
  },
  auth: {
    me: ["auth", "me"] as const,
  },
  workspace: {
    all: ["workspace"] as const,
    agents: ["workspace", "agents"] as const,
    artifactPreview: (artifactId: number) => ["workspace", "artifact-preview", artifactId] as const,
    conversations: ["workspace", "conversations"] as const,
    runs: ["workspace", "runs"] as const,
  },
};
