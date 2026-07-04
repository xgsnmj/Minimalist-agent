import { type Dispatch, type ReactNode, type SetStateAction, useMemo } from "react";
import { CopilotKit, useAgentContext, useFrontendTool } from "@copilotkit/react-core/v2";
import { z } from "zod";

type ModelOption = {
  id: string;
  label: string;
};

type WorkspaceAgent = {
  id: string;
  name: string;
  status: "enabled";
  allowedModels: ModelOption[];
};

type ConversationMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  artifactReference?: {
    artifactId: number;
    filename: string;
    previewType: string;
  };
};

type Conversation = {
  id: string;
  title: string;
  agentId: string;
  status: "idle" | "running" | "completed" | "failed" | "cancelled";
  updatedAt: string;
  selectedModelId: string;
  messages: ConversationMessage[];
};

type AdminModule = {
  href: string;
  title: string;
  meta: string;
};

type LocalAccountStatus = "pending" | "enabled" | "rejected" | "disabled";

type LocalAccountSummary = {
  username: string;
  email: string;
  status: LocalAccountStatus;
  createdAt: string;
  lastAction: string;
};

type McpServerSummary = {
  name: string;
  connectionType: "SSE" | "Streamable HTTP";
  discoveryStatus: string;
  authorization: string;
  toolCount: number;
};

type SearchProviderScenario = "success" | "empty" | "error";
type PageReadScenario = "success" | "policy-violation";
type SandboxScenario = "completed" | "rejected";
type RunAuditStatus = "running" | "completed" | "failed" | "cancelled";
type RunAuditStatusFilter = "all" | RunAuditStatus;

type AgentRunAuditSummary = {
  id: string;
  conversation: string;
  user: string;
  agent: string;
  model: string;
  status: RunAuditStatus;
  toolCount: number;
  artifactCount: number;
};

type AgentLifecycleStatus = "enabled" | "disabled" | "retired";

type AgentLifecycleSummary = {
  id: string;
  name: string;
  status: AgentLifecycleStatus;
  defaultModel: string;
  allowedModels: string[];
  capabilitySummary: string;
  processVisibility: string;
};

type ModelConfigurationStatus = "enabled" | "disabled" | "draft";

type ModelConfigurationSummary = {
  id: string;
  provider: string;
  model: string;
  credentialReference: string;
  status: ModelConfigurationStatus;
  defaultParameters: string;
  lastUpdated: string;
  risk: string;
};

type CopilotAdminBridgeProps = {
  activeModule: AdminModule;
  modules: AdminModule[];
};

type CopilotAgentLifecycleBridgeProps = {
  agents: AgentLifecycleSummary[];
  isCreateDraftOpen: boolean;
  selectedAgentId: string | null;
  setIsCreateDraftOpen: Dispatch<SetStateAction<boolean>>;
  setSelectedAgentId: Dispatch<SetStateAction<string>>;
};

type CopilotAccountApprovalBridgeProps = {
  accounts: LocalAccountSummary[];
  selectedUsername: string | null;
  setSelectedUsername: Dispatch<SetStateAction<string | null>>;
  setStatusFilter: Dispatch<SetStateAction<LocalAccountStatus>>;
  statusFilter: LocalAccountStatus;
};

type CopilotModelConfigurationsBridgeProps = {
  configurations: ModelConfigurationSummary[];
  isCreateDraftOpen: boolean;
  providerCatalog: string[];
  selectedConfigurationId: string | null;
  setIsCreateDraftOpen: Dispatch<SetStateAction<boolean>>;
  setSelectedConfigurationId: Dispatch<SetStateAction<string>>;
};

type CopilotMcpServersBridgeProps = {
  authorizationAgent: string;
  isConfigurationDraftOpen: boolean;
  selectedServerName: string | null;
  servers: McpServerSummary[];
  setAuthorizationAgent: Dispatch<SetStateAction<string>>;
  setIsConfigurationDraftOpen: Dispatch<SetStateAction<boolean>>;
  setSelectedServerName: Dispatch<SetStateAction<string | null>>;
};

type CopilotSearchProviderBridgeProps = {
  scenario: SearchProviderScenario;
  setScenario: Dispatch<SetStateAction<SearchProviderScenario>>;
};

type CopilotPageReadProviderBridgeProps = {
  scenario: PageReadScenario;
  setScenario: Dispatch<SetStateAction<PageReadScenario>>;
};

type CopilotSandboxStatusBridgeProps = {
  scenario: SandboxScenario;
  setScenario: Dispatch<SetStateAction<SandboxScenario>>;
};

type CopilotRunAuditBridgeProps = {
  runs: AgentRunAuditSummary[];
  selectedRunId: string | null;
  setSelectedRunId: Dispatch<SetStateAction<string | null>>;
  setStatusFilter: Dispatch<SetStateAction<RunAuditStatusFilter>>;
  statusFilter: RunAuditStatusFilter;
};

type CopilotFullTraceBridgeProps = {
  isRawPayloadOpen: boolean;
  runId: string;
  setIsRawPayloadOpen: Dispatch<SetStateAction<boolean>>;
  status: RunAuditStatus;
  traceId: string;
};

type CopilotWorkspaceBridgeProps = {
  activeRunId: number | null;
  agents: WorkspaceAgent[];
  attachmentPreviewName: string | null;
  conversations: Conversation[];
  draftAgentId: string;
  draftModelId: string;
  lastSeenSequence: number;
  previewArtifactId: number | null;
  selectedArtifactId: number | null;
  selectedConversationId: string | null;
  setIsRenaming: Dispatch<SetStateAction<boolean>>;
  setPreviewArtifactId: Dispatch<SetStateAction<number | null>>;
  setRenameValue: Dispatch<SetStateAction<string>>;
  setSelectedConversationId: Dispatch<SetStateAction<string | null>>;
  streamStatus: "idle" | "connected" | "unavailable";
};

const copilotRuntimeUrl = "/api/copilotkit";

const conversationIdSchema = z.object({
  conversationId: z.string().min(1),
});

const artifactIdSchema = z.object({
  artifactId: z.number().int().positive(),
});

const adminModuleSchema = z.object({
  href: z.string().min(1),
});

const agentLifecycleAgentIdSchema = z.object({
  agentId: z.string().min(1),
});

const modelConfigurationIdSchema = z.object({
  configurationId: z.string().min(1),
});

const accountApprovalStatusSchema = z.object({
  status: z.enum(["pending", "enabled", "rejected", "disabled"]),
});

const localAccountUsernameSchema = z.object({
  username: z.string().min(1),
});

const mcpServerNameSchema = z.object({
  serverName: z.string().min(1),
});

const optionalMcpServerNameSchema = z.object({
  serverName: z.string().min(1).optional(),
});

const mcpAuthorizationAgentSchema = z.object({
  agentName: z.string().min(1),
});

const searchProviderScenarioSchema = z.object({
  scenario: z.enum(["success", "empty", "error"]),
});

const pageReadScenarioSchema = z.object({
  scenario: z.enum(["success", "policy-violation"]),
});

const sandboxScenarioSchema = z.object({
  scenario: z.enum(["completed", "rejected"]),
});

const runAuditStatusFilterSchema = z.object({
  status: z.enum(["all", "running", "completed", "failed", "cancelled"]),
});

const runAuditRunIdSchema = z.object({
  runId: z.string().min(1),
});

const optionalRunAuditRunIdSchema = z.object({
  runId: z.string().min(1).optional(),
});

const fullTraceRawPayloadPreviewSchema = z.object({
  open: z.boolean(),
});

export function CopilotKitWorkspaceProvider({ children }: { children: ReactNode }) {
  return (
    <CopilotKit
      runtimeUrl={copilotRuntimeUrl}
      credentials="same-origin"
      enableInspector={false}
      showDevConsole={false}
      onError={(event) => {
        console.warn("[copilotkit]", event);
      }}
    >
      {children}
    </CopilotKit>
  );
}

export function CopilotWorkspaceBridge({
  activeRunId,
  agents,
  attachmentPreviewName,
  conversations,
  draftAgentId,
  draftModelId,
  lastSeenSequence,
  previewArtifactId,
  selectedArtifactId,
  selectedConversationId,
  setIsRenaming,
  setPreviewArtifactId,
  setRenameValue,
  setSelectedConversationId,
  streamStatus,
}: CopilotWorkspaceBridgeProps) {
  const selectedConversation = conversations.find(
    (conversation) => conversation.id === selectedConversationId,
  );

  const workspaceContext = useMemo(
    () => ({
      activeRunId,
      agentCapabilityBoundary:
        "Frontend tools may only change UI state. Agent Runs, capability policy, Tool Calls, Card Rendering, Run Audit, and Full Trace stay backend-owned.",
      agents: agents.map((agent) => ({
        id: agent.id,
        name: agent.name,
        status: agent.status,
        allowedModels: agent.allowedModels.map((model) => model.label),
      })),
      attachmentPreviewName,
      currentPage: "对话工作台",
      draftAgentId,
      draftModelId,
      lastSeenSequence,
      previewArtifactId,
      selectedArtifactId,
      selectedConversation: selectedConversation
        ? {
            id: selectedConversation.id,
            title: selectedConversation.title,
            agentId: selectedConversation.agentId,
            status: selectedConversation.status,
            selectedModelId: selectedConversation.selectedModelId,
            messageCount: selectedConversation.messages.length,
            artifactIds: selectedConversation.messages
              .map((message) => message.artifactReference?.artifactId ?? null)
              .filter((artifactId): artifactId is number => artifactId != null),
          }
        : null,
      visibleConversations: conversations.map((conversation) => ({
        id: conversation.id,
        title: conversation.title,
        agentId: conversation.agentId,
        status: conversation.status,
        updatedAt: conversation.updatedAt,
      })),
      streamStatus,
    }),
    [
      activeRunId,
      agents,
      attachmentPreviewName,
      conversations,
      draftAgentId,
      draftModelId,
      lastSeenSequence,
      previewArtifactId,
      selectedArtifactId,
      selectedConversation,
      streamStatus,
    ],
  );

  useAgentContext({
    description:
      "Minimalist Agent workspace state for navigation and draft assistance. This is not an authorization source.",
    value: workspaceContext,
  });

  useFrontendTool(
    {
      name: "openAgentConversation",
      description:
        "Open an existing Agent Conversation in the workspace without starting an Agent Run.",
      parameters: conversationIdSchema,
      followUp: false,
      handler: async ({ conversationId }) => {
        const conversation = conversations.find((item) => item.id === conversationId);
        if (!conversation) {
          return `未找到对话 ${conversationId}。`;
        }

        setSelectedConversationId(conversation.id);
        setRenameValue(conversation.title);
        setIsRenaming(false);
        setPreviewArtifactId(
          conversation.messages.find((message) => message.artifactReference)?.artifactReference
            ?.artifactId ?? null,
        );

        return `已打开对话：${conversation.title}。`;
      },
    },
    [conversations],
  );

  useFrontendTool(
    {
      name: "startNewAgentConversationDraft",
      description: "Switch to a new Agent Conversation draft without starting an Agent Run.",
      parameters: z.object({}),
      followUp: false,
      handler: async () => {
        setSelectedConversationId(null);
        setRenameValue("未命名对话");
        setIsRenaming(false);
        setPreviewArtifactId(null);

        return "已准备新对话草稿。";
      },
    },
    [],
  );

  useFrontendTool(
    {
      name: "openArtifactPreview",
      description:
        "Open an existing Artifact Preview from the current workspace without reading or mutating artifact storage.",
      parameters: artifactIdSchema,
      followUp: false,
      handler: async ({ artifactId }) => {
        const conversation = conversations.find((item) =>
          item.messages.some(
            (message) => message.artifactReference?.artifactId === artifactId,
          ),
        );
        if (!conversation) {
          return `未在可见对话中找到制品 ${artifactId}。`;
        }

        setSelectedConversationId(conversation.id);
        setRenameValue(conversation.title);
        setIsRenaming(false);
        setPreviewArtifactId(artifactId);

        return `已打开制品预览 ${artifactId}。`;
      },
    },
    [conversations],
  );

  return null;
}

export function CopilotAdminBridge({ activeModule, modules }: CopilotAdminBridgeProps) {
  const adminContext = useMemo(
    () => ({
      activeModule,
      currentPage: "Administrator Console",
      governanceBoundary:
        "Copilot may help navigate Administrator Console modules. It must not approve accounts, change Agent policy, mutate model credentials, run tools, or reveal Full Trace data without backend authorization.",
      modules,
    }),
    [activeModule, modules],
  );

  useAgentContext({
    description:
      "Minimalist Agent Administrator Console page context for navigation and governance assistance. This is not an authorization source.",
    value: adminContext,
  });

  useFrontendTool(
    {
      name: "openAdministratorModule",
      description:
        "Navigate to an Administrator Console module by href. This only changes the visible page route and does not mutate governance data.",
      parameters: adminModuleSchema,
      followUp: false,
      handler: async ({ href }) => {
        const module = modules.find((item) => item.href === href);
        if (!module) {
          return `Administrator module ${href} was not found.`;
        }

        navigateWithinApp(module.href);
        return `Opened Administrator module ${module.title}.`;
      },
    },
    [modules],
  );

  return null;
}

export function CopilotAgentLifecycleBridge({
  agents,
  isCreateDraftOpen,
  selectedAgentId,
  setIsCreateDraftOpen,
  setSelectedAgentId,
}: CopilotAgentLifecycleBridgeProps) {
  const agentLifecycleContext = useMemo(
    () => ({
      agents: agents.map((agent) => ({
        id: agent.id,
        name: agent.name,
        status: agent.status,
        defaultModel: agent.defaultModel,
        allowedModelCount: agent.allowedModels.length,
        capabilitySummary: agent.capabilitySummary,
        processVisibility: agent.processVisibility,
      })),
      currentPage: "Agent Lifecycle",
      governanceBoundary:
        "Copilot may focus an Agent row or open a local Create Agent draft. It must not create, disable, retire, edit instructions, change model policy, or save Agent Capability Policy.",
      isCreateDraftOpen,
      selectedAgentId,
    }),
    [agents, isCreateDraftOpen, selectedAgentId],
  );

  useAgentContext({
    description:
      "Minimalist Agent Lifecycle page context for administrator guidance. This is not an Agent policy source.",
    value: agentLifecycleContext,
  });

  useFrontendTool(
    {
      name: "focusLifecycleAgent",
      description:
        "Focus an Agent in the Agent Lifecycle page without changing Agent policy, instructions, or status.",
      parameters: agentLifecycleAgentIdSchema,
      followUp: false,
      handler: async ({ agentId }) => {
        const agent = agents.find((item) => item.id === agentId);
        if (!agent) {
          return `Agent ${agentId} was not found.`;
        }

        setSelectedAgentId(agent.id);
        return `Focused ${agent.name}.`;
      },
    },
    [agents],
  );

  useFrontendTool(
    {
      name: "openCreateAgentDraft",
      description:
        "Open the local Create Agent draft without creating a backend Agent.",
      parameters: z.object({}),
      followUp: false,
      handler: async () => {
        setIsCreateDraftOpen(true);
        return "Opened a local Create Agent draft.";
      },
    },
    [],
  );

  return null;
}

export function CopilotModelConfigurationsBridge({
  configurations,
  isCreateDraftOpen,
  providerCatalog,
  selectedConfigurationId,
  setIsCreateDraftOpen,
  setSelectedConfigurationId,
}: CopilotModelConfigurationsBridgeProps) {
  const modelConfigurationContext = useMemo(
    () => ({
      configurations: configurations.map((configuration) => ({
        id: configuration.id,
        provider: configuration.provider,
        model: configuration.model,
        credentialReference: configuration.credentialReference,
        status: configuration.status,
        defaultParameters: configuration.defaultParameters,
        lastUpdated: configuration.lastUpdated,
        risk: configuration.risk,
      })),
      currentPage: "Model Configurations",
      governanceBoundary:
        "Copilot may focus Model Configuration rows or open a local creation draft. It must not create or edit configurations, reveal secrets, run model health checks, or change Agent Allowed Model Selection.",
      isCreateDraftOpen,
      providerCatalog,
      providerCatalogBoundary:
        "Provider catalog entries are creation affordances, not proof that a provider is configured or available.",
      selectedConfigurationId,
    }),
    [configurations, isCreateDraftOpen, providerCatalog, selectedConfigurationId],
  );

  useAgentContext({
    description:
      "Minimalist Agent Model Configurations page context for administrator guidance. Credential secret values are not included.",
    value: modelConfigurationContext,
  });

  useFrontendTool(
    {
      name: "focusModelConfiguration",
      description:
        "Focus a Model Configuration row without editing credentials, parameters, or availability.",
      parameters: modelConfigurationIdSchema,
      followUp: false,
      handler: async ({ configurationId }) => {
        const configuration = configurations.find((item) => item.id === configurationId);
        if (!configuration) {
          return `Model Configuration ${configurationId} was not found.`;
        }

        setSelectedConfigurationId(configuration.id);
        return `Focused ${configuration.model}.`;
      },
    },
    [configurations],
  );

  useFrontendTool(
    {
      name: "openCreateModelConfigurationDraft",
      description:
        "Open the local Create Model Configuration draft without saving provider, endpoint, credential, or parameter changes.",
      parameters: z.object({}),
      followUp: false,
      handler: async () => {
        setIsCreateDraftOpen(true);
        return "Opened a local Create Model Configuration draft.";
      },
    },
    [],
  );

  return null;
}

export function CopilotAccountApprovalBridge({
  accounts,
  selectedUsername,
  setSelectedUsername,
  setStatusFilter,
  statusFilter,
}: CopilotAccountApprovalBridgeProps) {
  const accountContext = useMemo(
    () => ({
      accounts: accounts.map((account) => ({
        username: account.username,
        email: account.email,
        status: account.status,
        createdAt: account.createdAt,
        lastAction: account.lastAction,
      })),
      currentPage: "Account Approval",
      governanceBoundary:
        "Copilot may focus a Local Account or switch approval tabs. It must not approve, reject, disable, or alter account state; those actions require explicit administrator UI actions and backend authorization.",
      selectedUsername,
      statusFilter,
    }),
    [accounts, selectedUsername, statusFilter],
  );

  useAgentContext({
    description:
      "Minimalist Agent Account Approval page context for local-account governance assistance. This is not an authorization source.",
    value: accountContext,
  });

  useFrontendTool(
    {
      name: "setLocalAccountApprovalView",
      description:
        "Switch the Account Approval tab without mutating any Local Account state.",
      parameters: accountApprovalStatusSchema,
      followUp: false,
      handler: async ({ status }) => {
        setStatusFilter(status);
        const firstAccount = accounts.find((account) => account.status === status);
        setSelectedUsername(firstAccount?.username ?? null);

        return `Showing ${status} Local Accounts.`;
      },
    },
    [accounts],
  );

  useFrontendTool(
    {
      name: "focusLocalAccount",
      description:
        "Focus a visible Local Account in the Account Approval page without approving, rejecting, disabling, or changing it.",
      parameters: localAccountUsernameSchema,
      followUp: false,
      handler: async ({ username }) => {
        const account = accounts.find((item) => item.username === username);
        if (!account) {
          return `Local Account ${username} was not found.`;
        }

        setStatusFilter(account.status);
        setSelectedUsername(account.username);
        return `Focused Local Account ${account.username}.`;
      },
    },
    [accounts],
  );

  return null;
}

export function CopilotMcpServersBridge({
  authorizationAgent,
  isConfigurationDraftOpen,
  selectedServerName,
  servers,
  setAuthorizationAgent,
  setIsConfigurationDraftOpen,
  setSelectedServerName,
}: CopilotMcpServersBridgeProps) {
  const mcpContext = useMemo(
    () => ({
      authorizationAgent,
      currentPage: "MCP Servers",
      governanceBoundary:
        "Copilot may focus remote MCP Servers, open local configuration drafts, or switch the authorization Agent. It must not register servers, discover tools, save authorization, reveal raw credentials, or bypass the Agent Tool Gateway.",
      isConfigurationDraftOpen,
      selectedServerName,
      servers: servers.map((server) => ({
        name: server.name,
        connectionType: server.connectionType,
        discoveryStatus: server.discoveryStatus,
        authorization: server.authorization,
        toolCount: server.toolCount,
      })),
    }),
    [authorizationAgent, isConfigurationDraftOpen, selectedServerName, servers],
  );

  useAgentContext({
    description:
      "Minimalist Agent MCP Servers page context for administrator guidance. This is not an authorization source.",
    value: mcpContext,
  });

  useFrontendTool(
    {
      name: "focusMcpServer",
      description:
        "Focus a remote MCP Server row without discovering tools, registering servers, saving authorization, or exposing credentials.",
      parameters: mcpServerNameSchema,
      followUp: false,
      handler: async ({ serverName }) => {
        const server = servers.find((item) => item.name === serverName);
        if (!server) {
          return `MCP Server ${serverName} was not found.`;
        }

        setSelectedServerName(server.name);
        return `Focused MCP Server ${server.name}.`;
      },
    },
    [servers],
  );

  useFrontendTool(
    {
      name: "openMcpServerConfigurationDraft",
      description:
        "Open the local MCP Server configuration draft. This does not register or update a backend MCP Server.",
      parameters: optionalMcpServerNameSchema,
      followUp: false,
      handler: async ({ serverName }) => {
        if (serverName) {
          const server = servers.find((item) => item.name === serverName);
          if (!server) {
            return `MCP Server ${serverName} was not found.`;
          }
          setSelectedServerName(server.name);
        } else {
          setSelectedServerName(null);
        }

        setIsConfigurationDraftOpen(true);
        return serverName
          ? `Opened a local configuration draft for ${serverName}.`
          : "Opened a local MCP Server configuration draft.";
      },
    },
    [servers],
  );

  useFrontendTool(
    {
      name: "setMcpAuthorizationAgent",
      description:
        "Switch the Agent shown in the MCP Tool Authorization panel without saving authorization changes.",
      parameters: mcpAuthorizationAgentSchema,
      followUp: false,
      handler: async ({ agentName }) => {
        setAuthorizationAgent(agentName);
        return `Showing MCP Tool Authorization draft for ${agentName}.`;
      },
    },
    [],
  );

  return null;
}

export function CopilotSearchProviderBridge({
  scenario,
  setScenario,
}: CopilotSearchProviderBridgeProps) {
  const searchProviderContext = useMemo(
    () => ({
      currentPage: "Search Provider Configuration",
      governanceBoundary:
        "Copilot may explain Search Provider state, switch runtime previews, or navigate to Page Read Provider. It must not change credentials, run health checks, alter Agent Capability Policy, or combine Search with Page Read.",
      provider: "Doubao Search Provider",
      scenario,
      searchCapabilityBoundary:
        "Search returns candidate URLs, titles, and summaries. Page Read reads full text from a known URL.",
    }),
    [scenario],
  );

  useAgentContext({
    description:
      "Minimalist Agent Search Provider page context for administrator guidance. This is not an authorization source.",
    value: searchProviderContext,
  });

  useFrontendTool(
    {
      name: "setSearchProviderRuntimePreview",
      description:
        "Switch the visible Search Provider runtime-state preview without running a health check or changing provider configuration.",
      parameters: searchProviderScenarioSchema,
      followUp: false,
      handler: async ({ scenario: nextScenario }) => {
        setScenario(nextScenario);
        return `Showing Search Provider ${nextScenario} preview.`;
      },
    },
    [],
  );

  useFrontendTool(
    {
      name: "openPageReadProviderConfiguration",
      description:
        "Navigate to Page Read Provider Configuration to inspect the separate full-page-read capability.",
      parameters: z.object({}),
      followUp: false,
      handler: async () => {
        navigateWithinApp("/admin/page-read-provider");
        return "Opened Page Read Provider Configuration.";
      },
    },
    [],
  );

  return null;
}

export function CopilotPageReadProviderBridge({
  scenario,
  setScenario,
}: CopilotPageReadProviderBridgeProps) {
  const pageReadProviderContext = useMemo(
    () => ({
      currentPage: "Page Read Provider Configuration",
      governanceBoundary:
        "Copilot may explain Page Read Provider state, switch health-check previews, or navigate to Search Provider. It must not read URLs, change domain policy, expose credentials, or combine Page Read with Search/browser mode.",
      pageReadCapabilityBoundary:
        "Page Read extracts readable content from a known URL. Search finds candidate URLs and summaries.",
      provider: "Jina Reader Provider",
      scenario,
    }),
    [scenario],
  );

  useAgentContext({
    description:
      "Minimalist Agent Page Read Provider page context for administrator guidance. This is not an authorization source.",
    value: pageReadProviderContext,
  });

  useFrontendTool(
    {
      name: "setPageReadHealthCheckPreview",
      description:
        "Switch the visible Page Read health-check preview without fetching URLs or changing domain policy.",
      parameters: pageReadScenarioSchema,
      followUp: false,
      handler: async ({ scenario: nextScenario }) => {
        setScenario(nextScenario);
        return `Showing Page Read Provider ${nextScenario} preview.`;
      },
    },
    [],
  );

  useFrontendTool(
    {
      name: "openSearchProviderConfiguration",
      description:
        "Navigate to Search Provider Configuration to inspect the separate candidate-search capability.",
      parameters: z.object({}),
      followUp: false,
      handler: async () => {
        navigateWithinApp("/admin/search-provider");
        return "Opened Search Provider Configuration.";
      },
    },
    [],
  );

  return null;
}

export function CopilotSandboxStatusBridge({
  scenario,
  setScenario,
}: CopilotSandboxStatusBridgeProps) {
  const sandboxContext = useMemo(
    () => ({
      currentPage: "Sandbox Status",
      governanceBoundary:
        "Copilot may explain Sandbox Capability state, switch recent-call previews, or navigate to Run Audit. It must not execute code, enable Sandbox Capability, override Agent Capability Policy, or imply host Docker access.",
      runtime: "OpenAI Agents SDK sandbox support",
      sandboxCapabilityBoundary:
        "Sandbox Capability is authorized per Agent by administrators. Users do not toggle it in the composer.",
      scenario,
    }),
    [scenario],
  );

  useAgentContext({
    description:
      "Minimalist Agent Sandbox Status page context for administrator guidance. This is not an authorization source.",
    value: sandboxContext,
  });

  useFrontendTool(
    {
      name: "setSandboxRecentCallPreview",
      description:
        "Switch the visible Sandbox recent-call preview without executing code or changing Agent Capability Policy.",
      parameters: sandboxScenarioSchema,
      followUp: false,
      handler: async ({ scenario: nextScenario }) => {
        setScenario(nextScenario);
        return `Showing Sandbox ${nextScenario} preview.`;
      },
    },
    [],
  );

  useFrontendTool(
    {
      name: "openRunAuditForSandbox",
      description:
        "Navigate to Run Audit for backend-owned sandbox Tool Call review.",
      parameters: z.object({}),
      followUp: false,
      handler: async () => {
        navigateWithinApp("/admin/run-audit");
        return "Opened Run Audit for Sandbox review.";
      },
    },
    [],
  );

  return null;
}

export function CopilotRunAuditBridge({
  runs,
  selectedRunId,
  setSelectedRunId,
  setStatusFilter,
  statusFilter,
}: CopilotRunAuditBridgeProps) {
  const runAuditContext = useMemo(
    () => ({
      currentPage: "Run Audit",
      governanceBoundary:
        "Copilot may filter or focus Agent Run summaries and open the Full Trace route. It must not mutate audit records, expose Full Trace payloads, change retention, or bypass Administrator-only access.",
      fullTraceRetention: "90 days",
      runs: runs.map((run) => ({
        id: run.id,
        conversation: run.conversation,
        user: run.user,
        agent: run.agent,
        model: run.model,
        status: run.status,
        toolCount: run.toolCount,
        artifactCount: run.artifactCount,
      })),
      selectedRunId,
      statusFilter,
    }),
    [runs, selectedRunId, statusFilter],
  );

  useAgentContext({
    description:
      "Minimalist Agent Run Audit page context for administrator guidance. This contains only summary metadata, not raw Full Trace payloads.",
    value: runAuditContext,
  });

  useFrontendTool(
    {
      name: "setRunAuditStatusFilter",
      description:
        "Filter visible Agent Run summaries by status without changing audit records or retention.",
      parameters: runAuditStatusFilterSchema,
      followUp: false,
      handler: async ({ status }) => {
        setStatusFilter(status);
        const nextRun =
          status === "all"
            ? runs[0] ?? null
            : runs.find((run) => run.status === status) ?? null;
        setSelectedRunId(nextRun?.id ?? null);
        return `Showing ${status} Agent Runs in Run Audit.`;
      },
    },
    [runs],
  );

  useFrontendTool(
    {
      name: "focusAgentRun",
      description:
        "Focus an Agent Run summary row and adjust the local status filter so the row is visible. This does not read Full Trace data.",
      parameters: runAuditRunIdSchema,
      followUp: false,
      handler: async ({ runId }) => {
        const run = runs.find((item) => item.id === runId);
        if (!run) {
          return `Agent Run ${runId} was not found.`;
        }

        setStatusFilter(run.status);
        setSelectedRunId(run.id);
        return `Focused Agent Run ${run.id}.`;
      },
    },
    [runs],
  );

  useFrontendTool(
    {
      name: "openFullTraceDetail",
      description:
        "Navigate to the Administrator-only Full Trace Detail route without exposing raw trace payloads.",
      parameters: optionalRunAuditRunIdSchema,
      followUp: false,
      handler: async ({ runId }) => {
        if (runId) {
          const run = runs.find((item) => item.id === runId);
          if (!run) {
            return `Agent Run ${runId} was not found.`;
          }
          setStatusFilter(run.status);
          setSelectedRunId(run.id);
        }

        navigateWithinApp("/admin/full-trace");
        return "Opened Full Trace Detail.";
      },
    },
    [runs],
  );

  return null;
}

export function CopilotFullTraceBridge({
  isRawPayloadOpen,
  runId,
  setIsRawPayloadOpen,
  status,
  traceId,
}: CopilotFullTraceBridgeProps) {
  const fullTraceContext = useMemo(
    () => ({
      currentPage: "Full Trace Detail",
      governanceBoundary:
        "Copilot may explain the Full Trace summary, collapse or expand the local raw-payload preview, and navigate back to Run Audit. It must not expose raw diagnostic payloads, mutate audit records, change trace retention, or make Full Trace visible to non-Administrators.",
      isRawPayloadOpen,
      rawPayloadBoundary:
        "Raw diagnostic payload content is rendered only in the Administrator UI and is not included in Copilot context.",
      runId,
      status,
      traceId,
    }),
    [isRawPayloadOpen, runId, status, traceId],
  );

  useAgentContext({
    description:
      "Minimalist Agent Full Trace Detail context for administrator guidance. Raw diagnostic payload data is intentionally excluded.",
    value: fullTraceContext,
  });

  useFrontendTool(
    {
      name: "setFullTraceRawPayloadPreview",
      description:
        "Collapse or expand the local raw diagnostic payload preview without reading, copying, or changing trace payload data.",
      parameters: fullTraceRawPayloadPreviewSchema,
      followUp: false,
      handler: async ({ open }) => {
        setIsRawPayloadOpen(open);
        return open
          ? "Expanded the raw diagnostic payload preview."
          : "Collapsed the raw diagnostic payload preview.";
      },
    },
    [],
  );

  useFrontendTool(
    {
      name: "openRunAuditFromFullTrace",
      description:
        "Navigate back to Run Audit without changing audit records or trace retention.",
      parameters: z.object({}),
      followUp: false,
      handler: async () => {
        navigateWithinApp("/admin/run-audit");
        return "Opened Run Audit.";
      },
    },
    [],
  );

  return null;
}

function navigateWithinApp(href: string) {
  if (window.location.pathname === href) {
    return;
  }

  window.history.pushState({}, "", href);
  window.dispatchEvent(new Event("minimalist-agent:navigate"));
}
