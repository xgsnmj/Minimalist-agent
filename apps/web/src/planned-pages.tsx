import { FormEvent, useMemo, useState } from "react";

import {
  CopilotAccountApprovalBridge,
  CopilotAdminBridge,
  CopilotAgentLifecycleBridge,
  CopilotFullTraceBridge,
  CopilotMcpServersBridge,
  CopilotModelConfigurationsBridge,
  CopilotPageReadProviderBridge,
  CopilotRunAuditBridge,
  CopilotSandboxStatusBridge,
  CopilotSearchProviderBridge,
} from "./copilotkit-adapter";

type AppRoute =
  | "login"
  | "register"
  | "approval-pending"
  | "conversation"
  | "account-settings"
  | "admin-overview"
  | "account-approval"
  | "agent-lifecycle"
  | "model-configurations"
  | "mcp-servers"
  | "search-provider"
  | "page-read-provider"
  | "sandbox-status"
  | "run-audit"
  | "full-trace";

type AdminModule = {
  route: AppRoute;
  href: string;
  title: string;
  meta: string;
};

type LocalAccountStatus = "pending" | "enabled" | "rejected" | "disabled";

type LocalAccount = {
  username: string;
  email: string;
  status: LocalAccountStatus;
  createdAt: string;
  lastAction: string;
  riskNote: string;
  history: string[];
};

type McpConnectionType = "SSE" | "Streamable HTTP";

type McpServer = {
  name: string;
  connectionType: McpConnectionType;
  credentialReference: string;
  discoveryStatus: "Discovered" | "Pending discovery";
  authorization: string;
  toolCount: number;
};

type McpToolDiscovery = {
  name: string;
  description: string;
  schemaSummary: string;
  lastDiscovered: string;
};

type SearchProviderScenario = "success" | "empty" | "error";
type PageReadScenario = "success" | "policy-violation";
type SandboxScenario = "completed" | "rejected";
type RunAuditStatus = "running" | "completed" | "failed" | "cancelled";
type RunAuditStatusFilter = "all" | RunAuditStatus;

type AgentRunAuditRecord = {
  id: string;
  conversation: string;
  user: string;
  agent: string;
  model: string;
  status: RunAuditStatus;
  started: string;
  duration: string;
  toolCount: number;
  artifactCount: number;
  statusTimeline: string[];
  messageReferences: string[];
  processSummary: string;
  toolCallSequence: string[];
  capabilitySnapshot: string[];
  artifacts: string[];
  failureDetail: string;
};

type FullTraceRecord = {
  traceId: string;
  runId: string;
  status: RunAuditStatus;
  agent: string;
  model: string;
  user: string;
  timestamp: string;
  events: string[][];
  rawPayload: string;
  artifacts: string[];
};

type AgentLifecycleStatus = "enabled" | "disabled" | "retired";

type AgentLifecycleRecord = {
  id: string;
  name: string;
  status: AgentLifecycleStatus;
  description: string;
  avatar: string;
  instruction: string;
  processVisibility: string;
  defaultModel: string;
  allowedModels: string[];
  capabilitySummary: string;
  capabilityPolicy: string[];
  mcpToolAuthorization: string[];
};

type ModelConfigurationStatus = "enabled" | "disabled" | "draft";

type ModelConfigurationRecord = {
  id: string;
  provider: string;
  model: string;
  credentialReference: string;
  status: ModelConfigurationStatus;
  baseUrl: string;
  defaultParameters: string;
  lastUpdated: string;
  risk: string;
};

const initialLocalAccounts: LocalAccount[] = [
  {
    username: "lin.request",
    email: "lin.request@example.com",
    status: "pending",
    createdAt: "today",
    lastAction: "Awaiting Administrator review",
    riskNote: "New Local Account. No prior approvals or failed attempts.",
    history: ["Registered today", "Email format accepted", "Pending first review"],
  },
  {
    username: "mei.request",
    email: "mei.request@example.com",
    status: "pending",
    createdAt: "yesterday",
    lastAction: "Awaiting Administrator review",
    riskNote: "Requested access from the same domain as an enabled account.",
    history: ["Registered yesterday", "No Administrator action yet"],
  },
  {
    username: "wang.user",
    email: "wang.user@example.com",
    status: "enabled",
    createdAt: "last week",
    lastAction: "Approved by oil",
    riskNote: "Administrator role. Current account cannot be disabled here.",
    history: ["Approved by oil", "Signed in from workspace"],
  },
  {
    username: "old.contractor",
    email: "old.contractor@example.com",
    status: "disabled",
    createdAt: "last month",
    lastAction: "Disabled after contract ended",
    riskNote: "Disabled accounts cannot enter Agent Platform.",
    history: ["Approved by oil", "Disabled by oil"],
  },
  {
    username: "unknown.vendor",
    email: "unknown.vendor@example.com",
    status: "rejected",
    createdAt: "last month",
    lastAction: "Rejected by oil",
    riskNote: "Rejected accounts stay outside workspace access.",
    history: ["Registered last month", "Rejected by oil"],
  },
];

const runAuditRecords: AgentRunAuditRecord[] = [
  {
    id: "run_current",
    conversation: "Market research",
    user: "wang.user",
    agent: "Default Agent",
    model: "OpenAI GPT-5",
    status: "running",
    started: "10:40",
    duration: "7m",
    toolCount: 3,
    artifactCount: 1,
    statusTimeline: ["created", "model response streaming", "sandbox artifact captured"],
    messageReferences: ["msg_201 user request", "msg_202 assistant progress"],
    processSummary: "Agent Run is still attached to the active Agent Conversation.",
    toolCallSequence: ["search.web", "page.read", "sandbox.exec"],
    capabilitySnapshot: ["Search Capability", "Page Read Capability", "Sandbox Capability"],
    artifacts: ["brief.md"],
    failureDetail: "No failure or cancellation recorded.",
  },
  {
    id: "run_failed",
    conversation: "Customer interview",
    user: "chen.user",
    agent: "Research Agent",
    model: "Claude Sonnet",
    status: "failed",
    started: "09:18",
    duration: "2m",
    toolCount: 1,
    artifactCount: 0,
    statusTimeline: ["created", "tool gateway request", "failed"],
    messageReferences: ["msg_118 customer-interview prompt", "msg_119 failed tool status"],
    processSummary: "Search Capability returned an upstream provider error before artifacts were written.",
    toolCallSequence: ["search.web failed with provider_error"],
    capabilitySnapshot: ["Search Capability", "No Sandbox Capability"],
    artifacts: ["No artifacts captured"],
    failureDetail: "failure/cancellation detail: provider_error from Search Capability.",
  },
];

const fullTraceRecord: FullTraceRecord = {
  traceId: "trace_run_failed",
  runId: "run_failed",
  status: "failed",
  agent: "Research Agent",
  model: "Claude Sonnet",
  user: "chen.user",
  timestamp: "09:20",
  events: [
    ["09:18", "runtime event", "Agent Run accepted by Agent Runtime"],
    ["09:19", "model interaction", "Claude Sonnet requested Search Capability"],
    ["09:20", "tool call", "search.web failed with provider_error"],
    ["09:20", "error", "Agent Run marked failed"],
  ],
  rawPayload:
    '{"error":"provider_error","provider":"Doubao Search Provider","redaction":"credentials omitted","traceId":"trace_run_failed"}',
  artifacts: ["No artifacts captured"],
};

const agentLifecycleRecords: AgentLifecycleRecord[] = [
  {
    id: "default-agent",
    name: "Default Agent",
    status: "enabled",
    description: "Primary Agent for general Agent Conversations.",
    avatar: "DA",
    instruction: "Help Users complete workspace tasks while respecting approved capabilities.",
    processVisibility: "Process visibility: standard",
    defaultModel: "OpenAI GPT-5",
    allowedModels: ["OpenAI GPT-5", "Claude Sonnet"],
    capabilitySummary: "search, sandbox",
    capabilityPolicy: ["Search Capability enabled", "Sandbox Capability enabled", "Page Read Capability disabled"],
    mcpToolAuthorization: ["github.search allowed", "linear.issue.read allowed"],
  },
  {
    id: "research-agent",
    name: "Research Agent",
    status: "enabled",
    description: "Research-focused Agent for source discovery and interview synthesis.",
    avatar: "RA",
    instruction: "Gather source candidates, read approved pages, and produce concise research notes.",
    processVisibility: "Process visibility: summary",
    defaultModel: "Claude Sonnet",
    allowedModels: ["Claude Sonnet", "OpenAI GPT-5"],
    capabilitySummary: "search, page read",
    capabilityPolicy: ["Search Capability enabled", "Page Read Capability enabled", "Sandbox Capability disabled"],
    mcpToolAuthorization: ["github.search read-only", "notion.page.read read-only"],
  },
];

const modelProviderCatalog = [
  "OpenAI",
  "Anthropic",
  "Google Gemini",
  "DeepSeek",
  "Qwen/DashScope",
  "Moonshot/Kimi",
  "Doubao",
  "Zhipu/GLM",
  "MiniMax",
  "OpenRouter",
  "Custom OpenAI-compatible endpoint",
];

const modelConfigurationRecords: ModelConfigurationRecord[] = [
  {
    id: "openai-gpt5",
    provider: "OpenAI",
    model: "GPT-5",
    credentialReference: "openai-main",
    status: "enabled",
    baseUrl: "https://api.openai.com/v1",
    defaultParameters: "temperature 0.3",
    lastUpdated: "today",
    risk: "No configuration risk detected.",
  },
  {
    id: "deepseek-reasoner",
    provider: "DeepSeek",
    model: "Reasoner",
    credentialReference: "deepseek-main",
    status: "enabled",
    baseUrl: "https://api.deepseek.com",
    defaultParameters: "temperature 0.2",
    lastUpdated: "today",
    risk: "No configuration risk detected.",
  },
  {
    id: "minimax-m1",
    provider: "MiniMax",
    model: "M1",
    credentialReference: "minimax-main",
    status: "enabled",
    baseUrl: "https://api.minimax.io/v1",
    defaultParameters: "temperature 0.5",
    lastUpdated: "yesterday",
    risk: "No configuration risk detected.",
  },
  {
    id: "custom-gateway",
    provider: "Custom OpenAI-compatible endpoint",
    model: "gateway-default",
    credentialReference: "custom-gateway",
    status: "draft",
    baseUrl: "https://models.internal.example/v1",
    defaultParameters: "temperature 0.4",
    lastUpdated: "yesterday",
    risk: "Credential missing is admin-only and does not expose secret.",
  },
];

const mcpServers: McpServer[] = [
  {
    name: "Document Tools",
    connectionType: "SSE",
    credentialReference: "secret reference",
    discoveryStatus: "Discovered",
    authorization: "Default Agent",
    toolCount: 3,
  },
  {
    name: "Data Reader",
    connectionType: "Streamable HTTP",
    credentialReference: "secret reference",
    discoveryStatus: "Pending discovery",
    authorization: "Unassigned",
    toolCount: 0,
  },
];

const mcpDiscoveredTools: McpToolDiscovery[] = [
  {
    name: "read_document",
    description: "Read approved document content for an Agent Run.",
    schemaSummary: "path, format",
    lastDiscovered: "10:32",
  },
  {
    name: "extract_table",
    description: "Extract a structured table from an approved document.",
    schemaSummary: "path, sheet, range",
    lastDiscovered: "10:32",
  },
  {
    name: "render_artifact",
    description: "Render a backend-approved Artifact Reference.",
    schemaSummary: "artifactId, previewType",
    lastDiscovered: "10:31",
  },
];

const adminModules: AdminModule[] = [
  { route: "admin-overview", href: "/admin", title: "Governance Overview", meta: "Admin home" },
  { route: "account-approval", href: "/admin/account-approval", title: "Account Approval", meta: "Local Accounts" },
  { route: "agent-lifecycle", href: "/admin/agents", title: "Agent Lifecycle", meta: "Agent policy" },
  { route: "model-configurations", href: "/admin/models", title: "Model Configurations", meta: "Provider catalog" },
  { route: "mcp-servers", href: "/admin/mcp-servers", title: "MCP Servers", meta: "Tool registry" },
  { route: "search-provider", href: "/admin/search-provider", title: "Search Provider", meta: "Search Capability" },
  { route: "page-read-provider", href: "/admin/page-read-provider", title: "Page Read Provider", meta: "Page Read Capability" },
  { route: "sandbox-status", href: "/admin/sandbox", title: "Sandbox Status", meta: "Sandbox Capability" },
  { route: "run-audit", href: "/admin/run-audit", title: "Run Audit", meta: "Run governance" },
  { route: "full-trace", href: "/admin/full-trace", title: "Full Trace Detail", meta: "Admin diagnostics" },
];

export function resolveAppRoute(pathname: string): AppRoute {
  switch (pathname) {
    case "/login":
      return "login";
    case "/register":
      return "register";
    case "/approval-pending":
      return "approval-pending";
    case "/app/conversations":
    case "/app/conversations/new":
    case "/":
      return "conversation";
    case "/account-settings":
      return "account-settings";
    case "/admin":
      return "admin-overview";
    case "/admin/account-approval":
      return "account-approval";
    case "/admin/agents":
      return "agent-lifecycle";
    case "/admin/models":
      return "model-configurations";
    case "/admin/mcp-servers":
      return "mcp-servers";
    case "/admin/search-provider":
      return "search-provider";
    case "/admin/page-read-provider":
      return "page-read-provider";
    case "/admin/sandbox":
      return "sandbox-status";
    case "/admin/run-audit":
      return "run-audit";
    case "/admin/full-trace":
      return "full-trace";
    default:
      return "conversation";
  }
}

export function LoginPage() {
  return (
    <main className="access-page" aria-labelledby="login-title">
      <section className="access-panel">
        <p className="eyebrow">Minimalist Agent</p>
        <h1 id="login-title">Sign in</h1>
        <p>Use an approved Local Account to enter the Agent Platform.</p>
        <form className="stack">
          <label>
            <span>Username or email</span>
            <input name="username" autoComplete="username" />
          </label>
          <label>
            <span>Password</span>
            <input name="password" type="password" autoComplete="current-password" />
          </label>
          <button className="primary-button" type="button">Sign in</button>
          <a className="secondary-link" href="/register">Create Local Account</a>
        </form>
      </section>
    </main>
  );
}

export function RegisterPage() {
  const [isPending, setIsPending] = useState(false);

  function requestAccess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsPending(true);
  }

  if (isPending) {
    return <ApprovalPendingPage />;
  }

  return (
    <main className="access-page" aria-labelledby="register-title">
      <section className="access-panel">
        <p className="eyebrow">Local Account</p>
        <h1 id="register-title">Request access</h1>
        <p>New accounts must be approved by an Administrator before workspace access.</p>
        <form className="stack" onSubmit={requestAccess}>
          <label><span>Username</span><input name="username" autoComplete="username" /></label>
          <label><span>Email</span><input name="email" type="email" autoComplete="email" /></label>
          <label><span>Password</span><input name="password" type="password" autoComplete="new-password" /></label>
          <button className="primary-button" type="submit">Request Access</button>
          <a className="secondary-link" href="/login">Back to login</a>
        </form>
      </section>
    </main>
  );
}

export function ApprovalPendingPage() {
  return (
    <main className="access-page" aria-labelledby="pending-title">
      <section className="access-panel">
        <p className="eyebrow">Account Approval</p>
        <h1 id="pending-title">Account pending approval</h1>
        <p>An Administrator must approve this Local Account before the Agent Platform is available.</p>
        <div className="button-row">
          <a className="secondary-button" href="/login">Back to login</a>
          <button className="primary-button" type="button">Refresh status</button>
        </div>
      </section>
    </main>
  );
}

export function AccountSettingsPage() {
  return (
    <main className="route-page" aria-labelledby="account-settings-title">
      <section className="route-panel">
        <p className="eyebrow">Local Account</p>
        <h1 id="account-settings-title">Account Settings</h1>
        <div className="detail-grid">
          <InfoTile title="Username" value="oil" />
          <InfoTile title="Email" value="oil@example.com" />
          <InfoTile title="Role" value="Administrator" />
          <InfoTile title="Status" value="enabled" />
        </div>
        <button className="danger-button" type="button">Sign out</button>
      </section>
    </main>
  );
}

export function AdminPage({ route }: { route: AppRoute }) {
  const active = adminModules.find((module) => module.route === route) ?? adminModules[0];

  return (
    <main className="admin-route-shell">
      <CopilotAdminBridge activeModule={active} modules={adminModules} />
      <aside className="admin-route-nav" aria-label="Administrator navigation">
        <a className="brand-link" href="/app/conversations">
          <span className="brand-mark">MA</span>
          <span>Administrator</span>
        </a>
        <nav className="nav-list">
          {adminModules.map((module) => (
            <a
              className={module.route === route ? "nav-item active" : "nav-item"}
              href={module.href}
              key={module.route}
            >
              <strong>{module.title}</strong>
              <span className="meta">{module.meta}</span>
            </a>
          ))}
        </nav>
      </aside>
      <div className="admin-route-main">
        <header className="route-header">
          <div>
            <p className="eyebrow">Administrator Console</p>
            <h1 id="admin-page-title">{active.title}</h1>
            <p>{adminIntro(route)}</p>
          </div>
          <a className="secondary-button" href="/app/conversations">Back to workspace</a>
        </header>
        {adminContent(route)}
      </div>
    </main>
  );
}

function adminIntro(route: AppRoute) {
  switch (route) {
    case "admin-overview":
      return "A governance workspace, not a BI dashboard.";
    case "account-approval":
      return "Approve, reject, or disable Local Accounts before workspace access.";
    case "agent-lifecycle":
      return "Manage Agents, instructions, model policy, process visibility, and capability policy.";
    case "model-configurations":
      return "Configure provider catalog entries, credentials, endpoints, and model defaults.";
    case "mcp-servers":
      return "Register remote MCP Servers, discover tools, and authorize tools per Agent.";
    case "search-provider":
      return "Configure the provider behind Search Capability without mixing it with Page Read.";
    case "page-read-provider":
      return "Configure known-URL page reading, extraction limits, and domain policy.";
    case "sandbox-status":
      return "Inspect Sandbox Capability status, Agent authorization, and recent sandbox calls.";
    case "run-audit":
      return "Audit Agent Run status, Tool Calls, Artifacts, failures, and retention.";
    case "full-trace":
      return "Review Administrator-only diagnostic detail for a single Agent Run.";
    default:
      return "";
  }
}

function adminContent(route: AppRoute) {
  switch (route) {
    case "admin-overview":
      return (
        <>
          <section className="detail-grid">
            <InfoTile title="Pending accounts" value="3" tone="pending" />
            <InfoTile title="Provider health" value="available" tone="success" />
            <InfoTile title="Recent failed runs" value="1" tone="warning" />
            <InfoTile title="Artifact storage" value="policy ready" />
          </section>
          <TaskList />
        </>
      );
    case "account-approval":
      return <AccountApprovalPanel />;
    case "agent-lifecycle":
      return <AgentLifecyclePanel />;
    case "model-configurations":
      return <ModelConfigurationsPanel />;
    case "mcp-servers":
      return <McpServersPanel />;
    case "search-provider":
      return <SearchProviderPanel />;
    case "page-read-provider":
      return <PageReadProviderPanel />;
    case "sandbox-status":
      return <SandboxStatusPanel />;
    case "run-audit":
      return <RunAuditPanel />;
    case "full-trace":
      return <FullTracePanel />;
    default:
      return null;
  }
}

function TaskList() {
  return (
    <section className="route-panel">
      <p className="eyebrow">Governance tasks</p>
      <h2>Needs attention</h2>
      <div className="task-list">
        <TaskRow title="Approve new Local Accounts" meta="Account Approval" status="pending" />
        <TaskRow title="Confirm Agent Capability Policy" meta="Agent Lifecycle" status="ready" />
        <TaskRow title="Review failed Agent Runs" meta="Run Audit" status="warning" />
      </div>
    </section>
  );
}

function TaskRow({ title, meta, status }: { title: string; meta: string; status: string }) {
  return (
    <article className="task-row">
      <div>
        <strong>{title}</strong>
        <p>{meta}</p>
      </div>
      <span className={`audit-chip ${status}`}>{status}</span>
    </article>
  );
}

function AccountApprovalPanel() {
  const [accounts, setAccounts] = useState<LocalAccount[]>(initialLocalAccounts);
  const [statusFilter, setStatusFilter] = useState<LocalAccountStatus>("pending");
  const [selectedUsername, setSelectedUsername] = useState<string | null>("lin.request");

  const filteredAccounts = useMemo(
    () => accounts.filter((account) => account.status === statusFilter),
    [accounts, statusFilter],
  );
  const selectedAccount =
    accounts.find((account) => account.username === selectedUsername) ?? filteredAccounts[0] ?? null;
  const accountCounts = useMemo(
    () => ({
      pending: accounts.filter((account) => account.status === "pending").length,
      enabled: accounts.filter((account) => account.status === "enabled").length,
      rejected: accounts.filter((account) => account.status === "rejected").length,
      disabled: accounts.filter((account) => account.status === "disabled").length,
    }),
    [accounts],
  );

  function changeStatus(username: string, status: LocalAccountStatus) {
    setAccounts((currentAccounts) =>
      currentAccounts.map((account) =>
        account.username === username
          ? {
              ...account,
              status,
              lastAction: accountStatusAction(status),
              history: [accountStatusAction(status), ...account.history],
            }
          : account,
      ),
    );
    setSelectedUsername(username);
    setStatusFilter(status);
  }

  function switchStatus(status: LocalAccountStatus) {
    setStatusFilter(status);
    setSelectedUsername(accounts.find((account) => account.status === status)?.username ?? null);
  }

  return (
    <section className="route-panel" aria-label="Account Approval">
      <CopilotAccountApprovalBridge
        accounts={accounts}
        selectedUsername={selectedAccount?.username ?? null}
        setSelectedUsername={setSelectedUsername}
        setStatusFilter={setStatusFilter}
        statusFilter={statusFilter}
      />
      <div className="account-toolbar">
        <div className="tab-list" role="tablist" aria-label="Local Account status">
          {(["pending", "enabled", "rejected", "disabled"] as LocalAccountStatus[]).map((status) => (
            <button
              aria-selected={statusFilter === status}
              className={statusFilter === status ? "tab-button active" : "tab-button"}
              key={status}
              role="tab"
              type="button"
              onClick={() => switchStatus(status)}
            >
              {statusLabel(status)}
              <span>{accountCounts[status]}</span>
            </button>
          ))}
        </div>
        <p className="inline-note">Current Administrator account cannot be disabled from this page.</p>
      </div>
      <div className="account-approval-layout">
        <div className="route-table-wrap">
          <table className="route-table">
            <thead>
              <tr>
                <th>username</th>
                <th>email</th>
                <th>status</th>
                <th>created</th>
                <th>last action</th>
                <th>actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredAccounts.map((account) => (
                <tr
                  className={account.username === selectedAccount?.username ? "selected-row" : ""}
                  key={account.username}
                >
                  <td>{account.username}</td>
                  <td>{account.email}</td>
                  <td><span className={`status-badge ${account.status}`}>{statusLabel(account.status)}</span></td>
                  <td>{account.createdAt}</td>
                  <td>{account.lastAction}</td>
                  <td>
                    <div className="table-actions">
                      <button className="secondary-button" type="button" onClick={() => setSelectedUsername(account.username)}>
                        Details
                      </button>
                      {account.status === "pending" ? (
                        <>
                          <button className="primary-button" type="button" onClick={() => changeStatus(account.username, "enabled")}>
                            Approve
                          </button>
                          <button className="danger-button" type="button" onClick={() => changeStatus(account.username, "rejected")}>
                            Reject
                          </button>
                        </>
                      ) : null}
                      {account.status === "enabled" && account.username !== "wang.user" ? (
                        <button className="danger-button" type="button" onClick={() => changeStatus(account.username, "disabled")}>
                          Disable
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredAccounts.length === 0 ? (
            <p className="empty-state">No Local Accounts in this status.</p>
          ) : null}
        </div>
        <aside className="account-detail-panel" aria-label="Local Account detail">
          {selectedAccount ? (
            <>
              <div>
                <p className="eyebrow">Local Account</p>
                <h2>{selectedAccount.username}</h2>
                <p>{selectedAccount.email}</p>
              </div>
              <span className={`status-badge ${selectedAccount.status}`}>{statusLabel(selectedAccount.status)}</span>
              <p>{selectedAccount.riskNote}</p>
              <div className="stack">
                <h3>Approval history</h3>
                <ul className="plain-list">
                  {selectedAccount.history.map((entry) => (
                    <li key={entry}>{entry}</li>
                  ))}
                </ul>
              </div>
              <label>
                <span>Administrator note</span>
                <textarea placeholder="Visible to Administrators only" />
              </label>
            </>
          ) : (
            <p className="empty-state">Select a Local Account to review details.</p>
          )}
        </aside>
      </div>
    </section>
  );
}

function accountStatusAction(status: LocalAccountStatus) {
  switch (status) {
    case "enabled":
      return "Approved by Administrator";
    case "rejected":
      return "Rejected by Administrator";
    case "disabled":
      return "Disabled by Administrator";
    case "pending":
      return "Awaiting Administrator review";
  }
}

function statusLabel(status: LocalAccountStatus) {
  switch (status) {
    case "pending":
      return "Pending";
    case "enabled":
      return "Enabled";
    case "rejected":
      return "Rejected";
    case "disabled":
      return "Disabled";
  }
}

function AgentLifecyclePanel() {
  const [selectedAgentId, setSelectedAgentId] = useState("default-agent");
  const [isCreateDraftOpen, setIsCreateDraftOpen] = useState(false);
  const selectedAgent =
    agentLifecycleRecords.find((agent) => agent.id === selectedAgentId) ?? agentLifecycleRecords[0];

  return (
    <section className="route-panel" aria-label="Agent Lifecycle">
      <CopilotAgentLifecycleBridge
        agents={agentLifecycleRecords}
        isCreateDraftOpen={isCreateDraftOpen}
        selectedAgentId={selectedAgent?.id ?? null}
        setIsCreateDraftOpen={setIsCreateDraftOpen}
        setSelectedAgentId={setSelectedAgentId}
      />
      <div className="button-row">
        <button className="primary-button" type="button" onClick={() => setIsCreateDraftOpen(true)}>Create Agent</button>
        <button className="secondary-button" type="button">Disable Agent</button>
        <button className="secondary-button" type="button">Retire Agent</button>
      </div>
      <div className="route-table-wrap">
        <table className="route-table" aria-label="Agent list">
          <thead>
            <tr>
              <th>name</th>
              <th>status</th>
              <th>default model</th>
              <th>Allowed Model Selection</th>
              <th>capability summary</th>
              <th>process visibility</th>
              <th>actions</th>
            </tr>
          </thead>
          <tbody>
            {agentLifecycleRecords.map((agent) => (
              <tr className={agent.id === selectedAgent?.id ? "selected-row" : ""} key={agent.id}>
                <td>{agent.name}</td>
                <td>{agent.status}</td>
                <td>{agent.defaultModel}</td>
                <td>{agent.allowedModels.length}</td>
                <td>{agent.capabilitySummary}</td>
                <td>{agent.processVisibility}</td>
                <td>
                  <button className="secondary-button" type="button" onClick={() => setSelectedAgentId(agent.id)}>
                    Details
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selectedAgent ? (
        <section className="state-panel" aria-label="Agent detail">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Agent {selectedAgent.avatar}</p>
              <h2>{selectedAgent.name}</h2>
              <p>{selectedAgent.description}</p>
            </div>
            <span className={`status-badge ${selectedAgent.status}`}>{selectedAgent.status}</span>
          </div>
          <section className="boundary-list">
            <h3>Agent Instruction</h3>
            <p>{selectedAgent.instruction}</p>
            <p>Instruction snapshot recorded for new Agent Runs</p>
          </section>
          <section className="detail-grid">
            <InfoTile title="Process Visibility Policy" value={selectedAgent.processVisibility} />
            <InfoTile title="Default Model Configuration" value={selectedAgent.defaultModel} />
            <InfoTile title="Allowed Model Selection" value={selectedAgent.allowedModels.join(", ")} />
            <InfoTile title="Capability rules" value={selectedAgent.capabilityPolicy.length.toString()} />
          </section>
          <section className="boundary-list">
            <h3>Agent Capability Policy</h3>
            {selectedAgent.capabilityPolicy.map((policy) => <p key={policy}>{policy}</p>)}
          </section>
          <section className="boundary-list">
            <h3>MCP Tool Authorization</h3>
            {selectedAgent.mcpToolAuthorization.map((tool) => <p key={tool}>{tool}</p>)}
          </section>
        </section>
      ) : null}
      {isCreateDraftOpen ? (
        <section className="state-panel" aria-label="Create Agent draft">
          <p className="eyebrow">Local draft</p>
          <h2>Create Agent</h2>
          <p>Draft only. Backend governance must create the Agent.</p>
          <div className="form-grid">
            <label>
              Agent name
              <input placeholder="Support Agent" />
            </label>
            <label>
              Description
              <input placeholder="What this Agent is for" />
            </label>
            <label>
              Agent Instruction
              <textarea placeholder="Draft Agent Instruction" />
            </label>
          </div>
        </section>
      ) : null}
    </section>
  );
}

function ModelConfigurationsPanel() {
  const [selectedConfigurationId, setSelectedConfigurationId] = useState("openai-gpt5");
  const [isCreateDraftOpen, setIsCreateDraftOpen] = useState(false);
  const selectedConfiguration =
    modelConfigurationRecords.find((configuration) => configuration.id === selectedConfigurationId) ??
    modelConfigurationRecords[0];

  return (
    <section className="route-panel" aria-label="Model Configurations">
      <CopilotModelConfigurationsBridge
        configurations={modelConfigurationRecords}
        isCreateDraftOpen={isCreateDraftOpen}
        providerCatalog={modelProviderCatalog}
        selectedConfigurationId={selectedConfiguration?.id ?? null}
        setIsCreateDraftOpen={setIsCreateDraftOpen}
        setSelectedConfigurationId={setSelectedConfigurationId}
      />
      <div className="button-row">
        <button className="primary-button" type="button" onClick={() => setIsCreateDraftOpen(true)}>
          Create Model Configuration
        </button>
      </div>
      <section className="state-panel" aria-label="Model Provider Catalog">
        <h2>Model Provider Catalog</h2>
        <p>Provider catalog is a creation entry, not availability status.</p>
        <div className="provider-grid">
          {modelProviderCatalog.map((provider) => <span className="provider-chip" key={provider}>{provider}</span>)}
        </div>
      </section>
      <div className="route-table-wrap">
        <table className="route-table" aria-label="Model Configuration list">
          <thead>
            <tr>
              <th>provider</th>
              <th>model</th>
              <th>credential reference</th>
              <th>status</th>
              <th>default parameters</th>
              <th>last updated</th>
              <th>actions</th>
            </tr>
          </thead>
          <tbody>
            {modelConfigurationRecords.map((configuration) => (
              <tr className={configuration.id === selectedConfiguration?.id ? "selected-row" : ""} key={configuration.id}>
                <td>{configuration.provider}</td>
                <td>{configuration.model}</td>
                <td>{configuration.credentialReference}</td>
                <td>{configuration.status}</td>
                <td>{configuration.defaultParameters}</td>
                <td>{configuration.lastUpdated}</td>
                <td>
                  <button className="secondary-button" type="button" onClick={() => setSelectedConfigurationId(configuration.id)}>
                    Details
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selectedConfiguration ? (
        <section className="state-panel" aria-label="Model Configuration detail">
          <div className="panel-head">
            <div>
              <p className="eyebrow">{selectedConfiguration.provider}</p>
              <h2>{selectedConfiguration.model}</h2>
              <p>{selectedConfiguration.baseUrl}</p>
            </div>
            <span className={`status-badge ${selectedConfiguration.status}`}>{selectedConfiguration.status}</span>
          </div>
          <section className="detail-grid">
            <InfoTile title="Credential reference" value={selectedConfiguration.credentialReference} />
            <InfoTile title="Default parameters" value={selectedConfiguration.defaultParameters} />
            <InfoTile title="Last updated" value={selectedConfiguration.lastUpdated} />
            <InfoTile title="Configuration status" value={selectedConfiguration.status} />
          </section>
          <section className="boundary-list">
            <h3>Configuration risk</h3>
            <p>{selectedConfiguration.risk}</p>
          </section>
        </section>
      ) : null}
      {isCreateDraftOpen ? (
        <section className="state-panel" aria-label="Create Model Configuration draft">
          <p className="eyebrow">Local draft</p>
          <h2>Create Model Configuration</h2>
          <div className="form-grid">
            <label>
              Provider
              <select defaultValue="OpenAI">
                {modelProviderCatalog.map((provider) => <option key={provider}>{provider}</option>)}
              </select>
            </label>
            <label>
              Base URL
              <input placeholder="https://provider.example/v1" />
            </label>
            <label>
              Model name
              <input placeholder="model-name" />
            </label>
            <label>
              Credential reference
              <input placeholder="credential-reference" />
            </label>
            <label>
              Temperature
              <input defaultValue="0.3" inputMode="decimal" />
            </label>
          </div>
        </section>
      ) : null}
    </section>
  );
}

function McpServersPanel() {
  const [selectedServerName, setSelectedServerName] = useState<string | null>("Document Tools");
  const [authorizationAgent, setAuthorizationAgent] = useState("Default Agent");
  const [isConfigurationDraftOpen, setIsConfigurationDraftOpen] = useState(false);
  const selectedServer = mcpServers.find((server) => server.name === selectedServerName) ?? null;

  function openConfigurationDraft(serverName: string | null) {
    setSelectedServerName(serverName);
    setIsConfigurationDraftOpen(true);
  }

  return (
    <section className="route-panel" aria-label="MCP Servers">
      <CopilotMcpServersBridge
        authorizationAgent={authorizationAgent}
        isConfigurationDraftOpen={isConfigurationDraftOpen}
        selectedServerName={selectedServerName}
        servers={mcpServers}
        setAuthorizationAgent={setAuthorizationAgent}
        setIsConfigurationDraftOpen={setIsConfigurationDraftOpen}
        setSelectedServerName={setSelectedServerName}
      />
      <div className="panel-head">
        <div>
          <p className="eyebrow">Agent Tool Gateway</p>
          <h2>Remote MCP registry</h2>
          <p>SSE or Streamable HTTP only; stdio MCP servers stay outside the MVP.</p>
        </div>
        <button className="primary-button" type="button" onClick={() => openConfigurationDraft(null)}>
          Create MCP Server
        </button>
      </div>
      <div className="route-table-wrap">
        <table className="route-table" aria-label="MCP Server list">
          <thead>
            <tr>
              <th>name</th>
              <th>connection type</th>
              <th>credential</th>
              <th>discovery</th>
              <th>authorization</th>
              <th>actions</th>
            </tr>
          </thead>
          <tbody>
            {mcpServers.map((server) => (
              <tr
                className={server.name === selectedServerName ? "selected-row" : ""}
                key={server.name}
              >
                <td>{server.name}</td>
                <td>{server.connectionType}</td>
                <td>{server.credentialReference}</td>
                <td>{server.discoveryStatus}</td>
                <td>{server.authorization}</td>
                <td>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => openConfigurationDraft(server.name)}
                  >
                    {server.discoveryStatus === "Discovered" ? "Edit" : "Configure"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="admin-workbench-grid">
        <section className="sub-panel stack" aria-labelledby="mcp-discovery-title">
          <div>
            <p className="eyebrow">Tool discovery</p>
            <h3 id="mcp-discovery-title">Tool discovery result</h3>
          </div>
          <div className="task-list">
            {mcpDiscoveredTools.map((tool) => (
              <article className="task-row" key={tool.name}>
                <div>
                  <strong>{tool.name}</strong>
                  <p>{tool.description}</p>
                </div>
                <span className="audit-chip">{tool.schemaSummary}</span>
              </article>
            ))}
          </div>
          <p className="inline-note">
            Last discovery belongs to the backend Agent Tool Gateway, not this frontend panel.
          </p>
        </section>
        <section className="sub-panel stack" aria-label="MCP Tool Authorization">
          <div>
            <p className="eyebrow">Authorization panel</p>
            <h3>MCP Tool Authorization</h3>
          </div>
          <label>
            <span>Agent</span>
            <select
              aria-label="Agent"
              value={authorizationAgent}
              onChange={(event) => setAuthorizationAgent(event.target.value)}
            >
              <option>Default Agent</option>
              <option>Research Agent</option>
            </select>
          </label>
          <div className="card-field-list" aria-label="Authorized tools">
            <span className="card-field">read_document</span>
            <span className="card-field">extract_table</span>
            <span className="card-field">render_artifact</span>
          </div>
          <p>Agent Tool Gateway remains backend-owned; the frontend never exposes raw MCP credentials.</p>
          <button className="secondary-button" type="button">Save authorization draft</button>
        </section>
      </div>
      {isConfigurationDraftOpen ? (
        <section className="sub-panel stack" aria-label="MCP Server configuration draft">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Configuration draft</p>
              <h3>{selectedServer ? selectedServer.name : "Create MCP Server"}</h3>
            </div>
            <button
              className="secondary-button"
              type="button"
              onClick={() => setIsConfigurationDraftOpen(false)}
            >
              Close
            </button>
          </div>
          <div className="form-grid">
            <label>
              <span>Name</span>
              <input defaultValue={selectedServer?.name ?? ""} placeholder="MCP Server name" />
            </label>
            <label>
              <span>Connection type</span>
              <select defaultValue={selectedServer?.connectionType ?? "SSE"}>
                <option>SSE</option>
                <option>Streamable HTTP</option>
              </select>
            </label>
            <label>
              <span>Credential reference</span>
              <input
                defaultValue={selectedServer?.credentialReference ?? ""}
                placeholder="secret/mcp-server"
              />
            </label>
            <label>
              <span>Timeout</span>
              <input placeholder="30s" />
            </label>
          </div>
          <p className="inline-note">
            Saving this draft will require backend authorization before an MCP Server is registered.
          </p>
        </section>
      ) : null}
    </section>
  );
}

function SearchProviderPanel() {
  const [scenario, setScenario] = useState<SearchProviderScenario>("success");

  return (
    <section className="route-panel" aria-label="Search Provider Configuration">
      <CopilotSearchProviderBridge scenario={scenario} setScenario={setScenario} />
      <div className="panel-head">
        <div>
          <p className="eyebrow">Capability configuration</p>
          <h2>Doubao Search Provider</h2>
          <p>Search Capability finds candidate URLs and summaries; Page Read reads known URLs.</p>
        </div>
        <button className="secondary-button" type="button">Health check</button>
      </div>
      <section className="detail-grid" aria-label="Doubao Search Provider status">
        <InfoTile title="Provider" value="enabled" tone="success" />
        <InfoTile title="Credential" value="secret/doubao-search" />
        <InfoTile title="Result limit" value="8 candidate results" />
        <InfoTile title="Availability" value="passing" tone="success" />
      </section>
      <div className="admin-workbench-grid">
        <section className="sub-panel stack" aria-label="Search Provider edit panel">
          <div>
            <p className="eyebrow">Edit panel</p>
            <h3>Runtime configuration</h3>
          </div>
          <label>
            <span>Endpoint</span>
            <input defaultValue="Doubao Search Provider" />
          </label>
          <div className="form-grid">
            <label>
              <span>Rate limit</span>
              <input defaultValue="60 / min" />
            </label>
            <label>
              <span>Timeout</span>
              <input defaultValue="12s" />
            </label>
          </div>
          <label>
            <span>Result limit</span>
            <select defaultValue="8 candidate results">
              <option>5 candidate results</option>
              <option>8 candidate results</option>
              <option>12 candidate results</option>
            </select>
          </label>
          <p className="inline-note">This does not change Page Read content-length limits.</p>
          <button className="primary-button" type="button">Save configuration draft</button>
        </section>
        <section className="sub-panel stack" aria-label="Capability boundary">
          <div>
            <p className="eyebrow">Boundary</p>
            <h3>Search is not Page Read</h3>
          </div>
          <div className="boundary-list">
            <p>Search: candidate URLs, titles, and summaries.</p>
            <p>Page Read: full text from a known URL.</p>
            <p>Do not collapse either capability into browser mode.</p>
          </div>
          <a className="secondary-button" href="/admin/page-read-provider">Open Page Read Provider</a>
        </section>
      </div>
      <section className="sub-panel stack">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Runtime states</p>
            <h3>Provider runtime preview</h3>
          </div>
          <div className="tab-list" role="tablist" aria-label="Search Provider runtime states">
            <button
              aria-selected={scenario === "success"}
              className={scenario === "success" ? "tab-button active" : "tab-button"}
              role="tab"
              type="button"
              onClick={() => setScenario("success")}
            >
              Success
            </button>
            <button
              aria-selected={scenario === "empty"}
              className={scenario === "empty" ? "tab-button active" : "tab-button"}
              role="tab"
              type="button"
              onClick={() => setScenario("empty")}
            >
              Empty
            </button>
            <button
              aria-selected={scenario === "error"}
              className={scenario === "error" ? "tab-button active" : "tab-button"}
              role="tab"
              type="button"
              onClick={() => setScenario("error")}
            >
              Provider error
            </button>
          </div>
        </div>
        {scenario === "success" ? (
          <div className="state-panel" role="tabpanel" aria-label="Success">
            <h3>Candidate summaries available</h3>
            <p>Agent Runs may pass a selected known URL to Page Read Provider for full text.</p>
            <TableBlock
              title="Candidate results"
              columns={["title", "url", "summary", "next step"]}
              rows={[
                ["Minimalist Agent MVP", "docs/internal/mvp", "Conversation-first platform scope.", "Page Read allowed"],
                ["Search Capability", "docs/capability/search", "Candidate URL and summary provider.", "Page Read allowed"],
              ]}
            />
          </div>
        ) : null}
        {scenario === "empty" ? (
          <div className="state-panel" role="tabpanel" aria-label="Empty">
            <h3>No candidate URLs</h3>
            <p>Ask the user to refine the query or inspect provider limits.</p>
          </div>
        ) : null}
        {scenario === "error" ? (
          <div className="state-panel danger-state" role="tabpanel" aria-label="Provider error">
            <h3>Search Provider unavailable</h3>
            <p>Credential and internal endpoint details stay Administrator-only.</p>
          </div>
        ) : null}
      </section>
    </section>
  );
}

function PageReadProviderPanel() {
  const [scenario, setScenario] = useState<PageReadScenario>("success");

  return (
    <section className="route-panel" aria-label="Page Read Provider Configuration">
      <CopilotPageReadProviderBridge scenario={scenario} setScenario={setScenario} />
      <div className="panel-head">
        <div>
          <p className="eyebrow">Capability configuration</p>
          <h2>Jina Reader Provider</h2>
          <p>Page Read reads full text from a known URL; Search only finds candidate URLs and summaries.</p>
        </div>
        <button className="secondary-button" type="button">Health check</button>
      </div>
      <section className="detail-grid" aria-label="Jina Reader Provider status">
        <InfoTile title="Provider" value="enabled" tone="success" />
        <InfoTile title="Credential" value="secret/jina-reader" />
        <InfoTile title="Content limit" value="40k characters" />
        <InfoTile title="Availability" value="passing" tone="success" />
      </section>
      <div className="admin-workbench-grid">
        <section className="sub-panel stack" aria-label="Domain policy editor">
          <div>
            <p className="eyebrow">Domain policy</p>
            <h3>Known URL access</h3>
          </div>
          <p>Allow or deny known URLs before Page Read extracts readable text.</p>
          <label>
            <span>Allow domains</span>
            <textarea defaultValue={"docs.example.com\nhelp.example.com"} />
          </label>
          <label>
            <span>Deny domains</span>
            <textarea defaultValue="internal.example.com" />
          </label>
          <button className="primary-button" type="button">Save policy draft</button>
        </section>
        <section className="sub-panel stack" aria-label="Page Read runtime settings">
          <div>
            <p className="eyebrow">Runtime settings</p>
            <h3>Extraction limits</h3>
          </div>
          <label>
            <span>Extract mode</span>
            <select defaultValue="Readable text">
              <option>Readable text</option>
              <option>Preserve structure</option>
            </select>
          </label>
          <div className="form-grid">
            <label>
              <span>Timeout</span>
              <input defaultValue="15s" />
            </label>
            <label>
              <span>Content length</span>
              <input defaultValue="40k characters" />
            </label>
          </div>
          <p className="inline-note">These settings do not change Search Provider result limits.</p>
          <a className="secondary-button" href="/admin/search-provider">Open Search Provider</a>
        </section>
      </div>
      <section className="sub-panel stack" aria-label="Page Read health check result">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Health check</p>
            <h3>Known URL read preview</h3>
          </div>
          <div className="tab-list" role="tablist" aria-label="Page Read health check states">
            <button
              aria-selected={scenario === "success"}
              className={scenario === "success" ? "tab-button active" : "tab-button"}
              role="tab"
              type="button"
              onClick={() => setScenario("success")}
            >
              Success
            </button>
            <button
              aria-selected={scenario === "policy-violation"}
              className={scenario === "policy-violation" ? "tab-button active" : "tab-button"}
              role="tab"
              type="button"
              onClick={() => setScenario("policy-violation")}
            >
              Policy violation
            </button>
          </div>
        </div>
        {scenario === "success" ? (
          <div className="state-panel" role="tabpanel" aria-label="Success">
            <h3>Readable content extracted</h3>
            <p>Known URL passed domain policy and content-length limits.</p>
            <p>No Search query was issued by Page Read.</p>
          </div>
        ) : null}
        {scenario === "policy-violation" ? (
          <div className="state-panel danger-state" role="tabpanel" aria-label="Policy violation">
            <h3>Known URL blocked by domain policy</h3>
            <p>Administrator domain policy denied the requested URL before extraction.</p>
            <p>No Search query was issued by Page Read.</p>
          </div>
        ) : null}
      </section>
    </section>
  );
}

function SandboxStatusPanel() {
  const [scenario, setScenario] = useState<SandboxScenario>("completed");

  return (
    <section className="route-panel" aria-label="Sandbox Status">
      <CopilotSandboxStatusBridge scenario={scenario} setScenario={setScenario} />
      <div className="panel-head">
        <div>
          <p className="eyebrow">Sandbox Capability</p>
          <h2>Sandbox runtime and policy</h2>
          <p>Uses OpenAI Agents SDK sandbox support; this page does not imply a production host Docker sandbox.</p>
        </div>
        <a className="secondary-button" href="/admin/run-audit">Open Run Audit</a>
      </div>
      <section className="detail-grid" aria-label="Sandbox runtime status">
        <InfoTile title="Runtime" value="available" tone="success" />
        <InfoTile title="Isolation" value="workspace isolated" />
        <InfoTile title="Capture" value="artifact capture enabled" tone="success" />
        <InfoTile title="Recent calls" value="2 reviewed" />
      </section>
      <div className="route-table-wrap">
        <table className="route-table" aria-label="Agent Sandbox Capability">
          <thead>
            <tr>
              <th>agent</th>
              <th>capability</th>
              <th>artifact capture</th>
              <th>policy</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Default Agent</td>
              <td>enabled</td>
              <td>artifact capture on</td>
              <td>Administrator policy</td>
            </tr>
            <tr>
              <td>Research Agent</td>
              <td>restricted</td>
              <td>artifact capture review</td>
              <td>Summary-only policy</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="admin-workbench-grid">
        <section className="sub-panel stack" aria-label="Recent sandbox tool calls">
          <div>
            <p className="eyebrow">Tool Calls</p>
            <h3>Recent sandbox tool calls</h3>
          </div>
          <div className="task-list">
            <article className="task-row">
              <div>
                <strong>sandbox.exec</strong>
                <p>report.md captured as Artifact Reference</p>
              </div>
              <span className="audit-chip success">completed</span>
            </article>
            <article className="task-row">
              <div>
                <strong>extract_table</strong>
                <p>Temporary Run Attachment table extraction needs review.</p>
              </div>
              <span className="audit-chip warning">review</span>
            </article>
          </div>
        </section>
        <section className="sub-panel stack" aria-label="Artifact capture summary">
          <div>
            <p className="eyebrow">Artifacts</p>
            <h3>Artifact capture summary</h3>
          </div>
          <p>2 captured artifacts</p>
          <p>HTML previews stay sandboxed before rendering in Artifact Preview.</p>
          <p className="inline-note">Captured files are stored as Artifact References, not inline message bodies.</p>
        </section>
      </div>
      <section className="sub-panel stack">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Policy preview</p>
            <h3>Recent call outcome</h3>
          </div>
          <div className="tab-list" role="tablist" aria-label="Sandbox recent call outcomes">
            <button
              aria-selected={scenario === "completed"}
              className={scenario === "completed" ? "tab-button active" : "tab-button"}
              role="tab"
              type="button"
              onClick={() => setScenario("completed")}
            >
              Completed call
            </button>
            <button
              aria-selected={scenario === "rejected"}
              className={scenario === "rejected" ? "tab-button active" : "tab-button"}
              role="tab"
              type="button"
              onClick={() => setScenario("rejected")}
            >
              Rejected call
            </button>
          </div>
        </div>
        {scenario === "completed" ? (
          <div className="state-panel" role="tabpanel" aria-label="Completed call">
            <h3>Sandbox Tool Call completed</h3>
            <p>Outputs were captured through backend Artifact storage policy.</p>
          </div>
        ) : null}
        {scenario === "rejected" ? (
          <div className="state-panel danger-state" role="tabpanel" aria-label="Rejected call">
            <h3>Sandbox Capability denied by Agent Capability Policy</h3>
            <p>The frontend did not run code or override backend policy.</p>
          </div>
        ) : null}
      </section>
    </section>
  );
}

function FullTracePanel() {
  const [isRawPayloadOpen, setIsRawPayloadOpen] = useState(false);

  return (
    <section className="route-panel" aria-label="Full Trace Detail">
      <CopilotFullTraceBridge
        isRawPayloadOpen={isRawPayloadOpen}
        runId={fullTraceRecord.runId}
        setIsRawPayloadOpen={setIsRawPayloadOpen}
        status={fullTraceRecord.status}
        traceId={fullTraceRecord.traceId}
      />
      <div className="panel-head">
        <div>
          <p className="eyebrow">Administrator diagnostic view</p>
          <h2>Full Trace Detail</h2>
          <p>Administrator-only diagnostic record</p>
        </div>
        <a className="secondary-button" href="/admin/run-audit">Back to Run Audit</a>
      </div>
      <section className="detail-grid" aria-label="Trace header">
        <InfoTile title="Run" value={fullTraceRecord.runId} />
        <InfoTile title="Status" value={fullTraceRecord.status} tone="warning" />
        <InfoTile title="Agent" value={fullTraceRecord.agent} />
        <InfoTile title="Model" value={fullTraceRecord.model} />
        <InfoTile title="User" value={fullTraceRecord.user} />
        <InfoTile title="Time" value={fullTraceRecord.timestamp} />
      </section>
      <div className="route-table-wrap">
        <table className="route-table" aria-label="Event timeline">
          <thead>
            <tr>
              <th>time</th>
              <th>event</th>
              <th>detail</th>
            </tr>
          </thead>
          <tbody>
            {fullTraceRecord.events.map((event) => (
              <tr key={event.join(":")}>
                {event.map((cell) => <td key={cell}>{cell}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <details
        aria-label="Raw diagnostic payload"
        className="state-panel"
        open={isRawPayloadOpen}
        onToggle={(event) => setIsRawPayloadOpen(event.currentTarget.open)}
      >
        <summary>Raw diagnostic payload</summary>
        <pre>{fullTraceRecord.rawPayload}</pre>
      </details>
      <section className="boundary-list" aria-label="Artifact references">
        <h3>Artifact references</h3>
        {fullTraceRecord.artifacts.map((artifact) => <p key={artifact}>{artifact}</p>)}
      </section>
    </section>
  );
}

function RunAuditPanel() {
  const [statusFilter, setStatusFilter] = useState<RunAuditStatusFilter>("all");
  const [selectedRunId, setSelectedRunId] = useState<string | null>("run_current");
  const filteredRuns = useMemo(
    () =>
      statusFilter === "all"
        ? runAuditRecords
        : runAuditRecords.filter((run) => run.status === statusFilter),
    [statusFilter],
  );
  const selectedRun =
    runAuditRecords.find((run) => run.id === selectedRunId) ?? filteredRuns[0] ?? null;

  function switchStatusFilter(status: RunAuditStatusFilter) {
    setStatusFilter(status);
    setSelectedRunId(
      status === "all"
        ? runAuditRecords[0]?.id ?? null
        : runAuditRecords.find((run) => run.status === status)?.id ?? null,
    );
  }

  return (
    <section className="route-panel" aria-label="Run Audit">
      <CopilotRunAuditBridge
        runs={runAuditRecords}
        selectedRunId={selectedRun?.id ?? null}
        setSelectedRunId={setSelectedRunId}
        setStatusFilter={setStatusFilter}
        statusFilter={statusFilter}
      />
      <h2>Run Audit</h2>
      <div className="audit-overview" aria-label="Run Audit overview">
        <span>Full Trace retained for 90 days</span>
        <span>Storage: 1 artifact</span>
        <span>Recent failed runs: 1</span>
      </div>
      <section className="state-panel" aria-label="Run Audit filters">
        <label htmlFor="run-audit-status-filter">Status</label>
        <select
          id="run-audit-status-filter"
          value={statusFilter}
          onChange={(event) => switchStatusFilter(event.currentTarget.value as RunAuditStatusFilter)}
        >
          <option value="all">all</option>
          <option value="running">running</option>
          <option value="completed">completed</option>
          <option value="failed">failed</option>
          <option value="cancelled">cancelled</option>
        </select>
      </section>
      <div className="route-table-wrap">
        <table className="route-table" aria-label="Agent Run list">
          <thead>
            <tr>
              <th>run id</th>
              <th>conversation</th>
              <th>user</th>
              <th>Agent</th>
              <th>model</th>
              <th>status</th>
              <th>tool count</th>
              <th>artifact count</th>
              <th>actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredRuns.map((run) => (
              <tr className={run.id === selectedRun?.id ? "selected-row" : ""} key={run.id}>
                <td>{run.id}</td>
                <td>{run.conversation}</td>
                <td>{run.user}</td>
                <td>{run.agent}</td>
                <td>{run.model}</td>
                <td>{run.status}</td>
                <td>{run.toolCount}</td>
                <td>{run.artifactCount}</td>
                <td>
                  <button className="secondary-button" type="button" onClick={() => setSelectedRunId(run.id)}>
                    Details
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredRuns.length === 0 ? (
          <p className="empty-state">No Agent Runs match this filter.</p>
        ) : null}
      </div>
      {selectedRun ? (
        <section className="state-panel" aria-label="Agent Run detail">
          <div>
            <p className="eyebrow">Agent Run</p>
            <h2>{selectedRun.id}</h2>
            <p>{selectedRun.conversation} / {selectedRun.user} / {selectedRun.agent}</p>
          </div>
          <div className="detail-grid">
            <InfoTile title="Status" value={selectedRun.status} />
            <InfoTile title="Model" value={selectedRun.model} />
            <InfoTile title="Started" value={selectedRun.started} />
            <InfoTile title="Duration" value={selectedRun.duration} />
          </div>
          <section className="boundary-list">
            <h3>Status timeline</h3>
            {selectedRun.statusTimeline.map((item) => <p key={item}>{item}</p>)}
          </section>
          <section className="boundary-list">
            <h3>Conversation Message references</h3>
            {selectedRun.messageReferences.map((item) => <p key={item}>{item}</p>)}
          </section>
          <section className="boundary-list">
            <h3>Process Summary</h3>
            <p>{selectedRun.processSummary}</p>
          </section>
          <section className="boundary-list">
            <h3>Tool Call sequence</h3>
            {selectedRun.toolCallSequence.map((item) => <p key={item}>{item}</p>)}
          </section>
          <section className="boundary-list">
            <h3>Run Capability Snapshot</h3>
            {selectedRun.capabilitySnapshot.map((item) => <p key={item}>{item}</p>)}
          </section>
          <section className="boundary-list">
            <h3>Artifacts</h3>
            {selectedRun.artifacts.map((item) => <p key={item}>{item}</p>)}
          </section>
          <section className="boundary-list">
            <h3>failure/cancellation detail</h3>
            <p>{selectedRun.failureDetail}</p>
          </section>
          <section className="boundary-list">
            <h3>Full Trace entry</h3>
            <p>Administrator-only diagnostic record retained under the 90 day policy.</p>
            <a className="secondary-button" href="/admin/full-trace">Open Full Trace Detail</a>
          </section>
        </section>
      ) : null}
    </section>
  );
}

function ProviderPanel({ title, capability, settings }: { title: string; capability: string; settings: string[] }) {
  return (
    <section className="route-panel">
      <p className="eyebrow">{capability}</p>
      <h2>{title}</h2>
      <div className="detail-grid">
        <InfoTile title="Status" value="available" tone="success" />
        <InfoTile title="Credential" value="configured" />
        <InfoTile title="Health check" value="passing" tone="success" />
      </div>
      <div className="provider-grid">
        {settings.map((setting) => <span className="provider-chip" key={setting}>{setting}</span>)}
      </div>
    </section>
  );
}

function DataTable({ title, columns, rows }: { title: string; columns: string[]; rows: string[][] }) {
  return (
    <section className="route-panel">
      <TableBlock title={title} columns={columns} rows={rows} />
    </section>
  );
}

function TableBlock({ title, columns, rows }: { title: string; columns: string[]; rows: string[][] }) {
  return (
    <>
      <h2>{title}</h2>
      <div className="route-table-wrap">
        <table className="route-table">
          <thead>
            <tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.join(":")}>{row.map((cell) => <td key={cell}>{cell}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function InfoTile({ title, value, tone }: { title: string; value: string; tone?: string }) {
  return (
    <article className="info-tile">
      <span className={tone ? `audit-chip ${tone}` : "audit-chip"}>{title}</span>
      <strong>{value}</strong>
    </article>
  );
}
