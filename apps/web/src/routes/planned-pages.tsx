import { FormEvent, type ElementType, type ReactNode, useEffect, useMemo, useRef, useState } from "react";

import {
  CopilotAccountApprovalBridge,
  CopilotAdminBridge,
  CopilotAgentLifecycleBridge,
  CopilotFullTraceBridge,
  CopilotMcpServersBridge,
  CopilotModelConfigurationsBridge,
  CopilotRunAuditBridge,
} from "../shared/copilotkit-adapter";
import {
  authTokenStorageKey,
  getAuthToken,
  getCurrentUser,
  handleUnauthorized,
  logout,
  notifyAuthChanged,
  updateCurrentUser,
  type CurrentUser,
} from "../features/workspace/auth-api";
import { useGSAP } from "@gsap/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Activity,
  ArrowRight,
  BadgeCheck,
  Bot,
  Database,
  Eye,
  EyeOff,
  FileSearch,
  FileText,
  Gauge,
  LockKeyhole,
  ScrollText,
  Search,
  ServerCog,
  Settings2,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  UserCheck,
  Workflow,
} from "lucide-react";
import gsap from "gsap";
import ScrollTrigger from "gsap/ScrollTrigger";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

gsap.registerPlugin(ScrollTrigger);

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
  icon: ElementType;
};

type LocalAccountStatus = "pending" | "enabled" | "rejected" | "disabled";

type LocalAccount = {
  id: number;
  username: string;
  email: string;
  role: "admin" | "user";
  status: LocalAccountStatus;
  createdAt: string;
  note: string;
  statusReason: string;
  lastAction: string;
  riskNote: string;
  history: string[];
};

type McpConnectionType = "SSE" | "Streamable HTTP";

type McpServer = {
  id: number;
  name: string;
  connectionType: McpConnectionType;
  credentialReference: string;
  discoveryStatus: "Discovered" | "Pending discovery";
  authorization: string;
  toolCount: number;
  timeoutSeconds: number;
  url: string;
};

type McpToolDiscovery = {
  name: string;
  description: string;
  schemaSummary: string;
  lastDiscovered: string;
};

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
  processVisibilityValue: ApiAgent["process_visibility"];
  defaultModel: string;
  defaultModelConfigurationId: number | null;
  allowedModels: string[];
  allowedModelConfigurationIds: number[];
  capabilitySummary: string;
  capabilityPolicy: string[];
  capabilityPolicyValue: ApiAgent["capability_policy"];
  mcpToolAuthorization: string[];
};

type ModelConfigurationStatus = "enabled" | "disabled";
type ModelHealthStatus = "not_checked" | "healthy" | "unhealthy";

type ModelConfigurationRecord = {
  id: string;
  providerId: string;
  provider: string;
  name: string;
  model: string;
  credentialReference: string;
  status: ModelConfigurationStatus;
  enabled: boolean;
  baseUrl: string;
  defaultParameters: string;
  defaultParametersValue: Record<string, unknown>;
  lastUpdated: string;
  healthStatus: ModelHealthStatus;
  healthLabel: string;
  lastCheckedAt: string;
  lastError: string;
  risk: string;
};

type ApiLocalAccount = CurrentUser;

type ApiAgent = {
  id: number;
  name: string;
  description: string;
  icon: string;
  status: AgentLifecycleStatus;
  is_default: boolean;
  instruction: string;
  process_visibility: "minimal" | "standard" | "verbose";
  default_model_configuration_id: number | null;
  allowed_model_configuration_ids: number[];
  capability_policy: {
    mcp_server_ids: number[];
    sandbox_enabled: boolean;
    search_enabled: boolean;
    page_read_enabled: boolean;
  };
};

type ApiRunAuditSummary = {
  id: number;
  conversation_id: number;
  owner_user_id: number;
  agent_id: number;
  status: RunAuditStatus;
  selected_model_configuration_id: number | null;
  updated_at: string;
  full_trace_available: boolean;
  tool_call_count: number;
  artifact_count: number;
};

type ApiRunAuditList = {
  runs: ApiRunAuditSummary[];
  retention: {
    full_trace_retention_days: number;
    policy: string;
  };
  storage: {
    artifact_count: number;
    artifact_bytes: number;
    retained_full_trace_count: number;
  };
};

type ApiRunAuditDetail = {
  id: number;
  conversation_id: number;
  owner_user_id: number;
  status: RunAuditStatus;
  error: string | null;
  user_message: string;
  assistant_message: string | null;
  process_summaries: string[];
  capability_snapshot: {
    agent_id: number;
    agent_instruction_snapshot: string;
    process_visibility: "minimal" | "standard" | "verbose";
    selected_model_configuration_id: number | null;
    default_model_configuration_id: number | null;
    allowed_model_configuration_ids: number[];
    capability_policy: {
      mcp_server_ids: number[];
      sandbox_enabled: boolean;
      search_enabled: boolean;
      page_read_enabled: boolean;
    };
  };
  tool_calls: Array<{
    id: number;
    tool_name: string;
    status: string;
    error: string | null;
  }>;
  artifacts: Array<{
    id: number;
    filename: string;
    size: number;
  }>;
  events: Array<{
    sequence: number;
    event_type: string;
    data: Record<string, unknown>;
  }>;
  full_trace_available: boolean;
  full_trace_retention_days: number;
};

type ApiModelProvider = {
  id: string;
  name: string;
  endpoint_template: string;
  recommended_models: string[];
};

type ApiModelConfiguration = {
  id: number;
  provider_id: string;
  name: string;
  model_name: string;
  endpoint: string;
  credential_reference: string;
  default_parameters: Record<string, unknown>;
  enabled: boolean;
  health_status: ModelHealthStatus;
  last_checked_at: string | null;
  last_error: string | null;
};

type ApiModelConfigurationHealthCheck = {
  configuration: ApiModelConfiguration;
  status: ModelHealthStatus;
  checked_at: string;
  message: string;
};

type ApiAgentReadiness = {
  agent_id: number;
  ready: boolean;
  issues: string[];
};

type ApiAccountAuditEvent = {
  id: number;
  account_id: number;
  actor_id: number | null;
  action: "registered" | "bootstrapped" | "approved" | "rejected" | "disabled" | "enabled" | "updated";
  reason: string;
  note: string;
  created_at: string;
};

type ApiMcpServer = {
  id: number;
  name: string;
  connection_type: "sse" | "streamable_http";
  url: string;
  header_secret_refs: Record<string, string>;
  timeout_seconds: number;
  enabled: boolean;
  last_discovery_status: "not_run" | "succeeded" | "failed";
};

type ApiMcpTool = {
  id: number;
  server_id: number;
  tool_name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

type ApiSearchProvider = {
  id: number;
  provider_id: "doubao";
  name: string;
  endpoint: string;
  credential_reference: string;
  timeout_seconds: number;
  max_results: number;
  enabled: boolean;
};

type ApiPageReadProvider = {
  id: number;
  provider_id: "jina_reader";
  name: string;
  endpoint: string;
  credential_reference: string;
  timeout_seconds: number;
  max_content_length: number;
  allowed_domains: string[];
  enabled: boolean;
};

type ApiFullTrace = {
  run_id: number;
  retention_days: number;
  trace: Record<string, unknown>;
};

type AdminOverviewState = {
  pendingAccounts: number;
  enabledAgents: number;
  failedRuns: number;
  artifactCount: number;
  searchProviderReady: boolean;
  pageReadProviderReady: boolean;
};

type AdminOverviewTask = {
  href: string;
  title: string;
  meta: string;
  status: "pending" | "ready" | "warning";
};

async function adminFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getAuthToken();
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(path, {
    ...init,
    headers,
  });
  if (!response.ok) {
    if (response.status === 401) {
      handleUnauthorized();
      throw new Error("登录已过期，请重新登录。");
    }
    throw new Error(`管理员接口请求失败：${response.status}`);
  }
  return await response.json() as T;
}

function parseAdminInteger(value: string, fallback: number): number {
  const parsed = Number.parseInt(value.replace(/[^\d]/g, ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function credentialStatus(reference: string | null | undefined) {
  return reference && reference.trim().length > 0 ? "已配置" : "未配置";
}

function SecretTextInput({
  autoComplete = "new-password",
  defaultValue = "",
  name,
  placeholder,
  required = false,
}: {
  autoComplete?: string;
  defaultValue?: string;
  name: string;
  placeholder?: string;
  required?: boolean;
}) {
  const [isVisible, setIsVisible] = useState(false);
  const Icon = isVisible ? EyeOff : Eye;

  return (
    <div className="secret-input-control">
      <Input
        autoComplete={autoComplete}
        defaultValue={defaultValue}
        name={name}
        placeholder={placeholder}
        required={required}
        type={isVisible ? "text" : "password"}
      />
      <Button
        aria-label={isVisible ? "隐藏 API Key" : "显示 API Key"}
        className="secret-input-toggle"
        size="icon-sm"
        type="button"
        variant="ghost"
        onClick={() => setIsVisible((current) => !current)}
      >
        <Icon aria-hidden="true" strokeWidth={2} />
      </Button>
    </div>
  );
}

function compactTimestamp(value: string | null | undefined) {
  if (!value) {
    return "未记录";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function mapLocalAccount(account: ApiLocalAccount): LocalAccount {
  return {
    id: account.id,
    username: account.username,
    email: account.email ?? "未填写",
    role: account.role,
    status: account.status,
    createdAt: compactTimestamp(account.created_at),
    note: account.note ?? "",
    statusReason: account.status_reason ?? "",
    lastAction: accountStatusAction(account.status, account.status_reason),
    riskNote: account.role === "admin"
      ? "管理员账号。当前页面不会禁用管理员账号。"
      : account.status_reason
        ? account.status_reason
        : "未记录风险备注。",
    history: [
      accountStatusAction(account.status, account.status_reason),
      `创建：${compactTimestamp(account.created_at)}`,
    ],
  };
}

function mapAgent(agent: ApiAgent): AgentLifecycleRecord {
  const allowedModels = agent.allowed_model_configuration_ids.map((id) => `模型配置 #${id}`);
  return {
    id: String(agent.id),
    name: agent.name,
    status: agent.status,
    description: agent.description || "后端未填写描述。",
    avatar: agent.icon || "agent",
    instruction: agent.instruction,
    processVisibility: `过程可见性：${processVisibilityLabel(agent.process_visibility)}`,
    processVisibilityValue: agent.process_visibility,
    defaultModel: agent.default_model_configuration_id ? `模型配置 #${agent.default_model_configuration_id}` : "未设置",
    defaultModelConfigurationId: agent.default_model_configuration_id,
    allowedModels: allowedModels.length > 0 ? allowedModels : ["未设置"],
    allowedModelConfigurationIds: agent.allowed_model_configuration_ids,
    capabilitySummary: capabilitySummary(agent.capability_policy),
    capabilityPolicy: capabilityPolicyLines(agent.capability_policy),
    capabilityPolicyValue: agent.capability_policy,
    mcpToolAuthorization: agent.capability_policy.mcp_server_ids.length > 0
      ? agent.capability_policy.mcp_server_ids.map((id) => `MCP 服务器 #${id}`)
      : ["未授权 MCP 服务器"],
  };
}

function mapRunSummary(run: ApiRunAuditSummary): AgentRunAuditRecord {
  return {
    id: String(run.id),
    conversation: `会话 #${run.conversation_id}`,
    user: `用户 #${run.owner_user_id}`,
    agent: `智能体 #${run.agent_id}`,
    model: run.selected_model_configuration_id ? `模型配置 #${run.selected_model_configuration_id}` : "未设置",
    status: run.status,
    started: run.updated_at,
    duration: "后端未记录",
    toolCount: run.tool_call_count,
    artifactCount: run.artifact_count,
    statusTimeline: ["选择运行后加载后端事件时间线"],
    messageReferences: [`会话 #${run.conversation_id}`],
    processSummary: "选择运行后加载过程摘要。",
    toolCallSequence: ["选择运行后加载工具调用序列"],
    capabilitySnapshot: ["选择运行后加载能力快照"],
    artifacts: ["选择运行后加载产物引用"],
    failureDetail: run.status === "failed" ? "选择运行后加载失败详情。" : "未记录失败或取消信息。",
  };
}

function mergeRunDetail(summary: AgentRunAuditRecord, detail: ApiRunAuditDetail): AgentRunAuditRecord {
  return {
    ...summary,
    status: detail.status,
    statusTimeline: detail.events.length > 0
      ? detail.events.map((event) => `#${event.sequence} ${event.event_type}`)
      : ["后端暂未记录事件"],
    messageReferences: [
      `用户消息：${detail.user_message}`,
      detail.assistant_message ? `助手消息：${detail.assistant_message}` : "助手消息：后端未记录",
    ],
    processSummary: detail.process_summaries.join("\n") || "后端暂未记录过程摘要。",
    toolCallSequence: detail.tool_calls.length > 0
      ? detail.tool_calls.map((tool) => `${tool.tool_name}：${tool.status}${tool.error ? `，${tool.error}` : ""}`)
      : ["后端暂未记录工具调用"],
    capabilitySnapshot: capabilityPolicyLines(detail.capability_snapshot.capability_policy),
    artifacts: detail.artifacts.length > 0
      ? detail.artifacts.map((artifact) => `${artifact.filename}（${artifact.size} bytes）`)
      : ["未捕获产物"],
    failureDetail: detail.error ? `失败/取消详情：${detail.error}` : "未记录失败或取消信息。",
  };
}

function mapModelConfiguration(
  configuration: ApiModelConfiguration,
  providers: ApiModelProvider[],
): ModelConfigurationRecord {
  const providerName =
    providers.find((provider) => provider.id === configuration.provider_id)?.name ??
    configuration.provider_id;
  const parameterText = Object.entries(configuration.default_parameters)
    .map(([key, value]) => `${key} ${String(value)}`)
    .join(", ");
  return {
    id: String(configuration.id),
    providerId: configuration.provider_id,
    provider: providerName,
    name: configuration.name,
    model: configuration.model_name,
    credentialReference: configuration.credential_reference,
    status: configuration.enabled ? "enabled" : "disabled",
    enabled: configuration.enabled,
    baseUrl: configuration.endpoint,
    defaultParameters: parameterText || "未设置",
    defaultParametersValue: configuration.default_parameters,
    lastUpdated: compactTimestamp(configuration.last_checked_at),
    healthStatus: configuration.health_status,
    healthLabel: modelHealthLabel(configuration.health_status),
    lastCheckedAt: compactTimestamp(configuration.last_checked_at),
    lastError: configuration.last_error ?? "",
    risk: configuration.last_error
      ? configuration.last_error
      : configuration.credential_reference
      ? "API Key 已配置。"
      : "API Key 缺失，请补齐后再启用。",
  };
}

function mapMcpServer(server: ApiMcpServer): McpServer {
  return {
    id: server.id,
    name: server.name,
    connectionType: server.connection_type === "sse" ? "SSE" : "Streamable HTTP",
    credentialReference: Object.keys(server.header_secret_refs).length > 0 ? "密钥引用" : "未配置",
    discoveryStatus: server.last_discovery_status === "succeeded" ? "Discovered" : "Pending discovery",
    authorization: server.enabled ? "按智能体策略授权" : "已停用",
    toolCount: 0,
    timeoutSeconds: server.timeout_seconds,
    url: server.url,
  };
}

function mapMcpTool(tool: ApiMcpTool): McpToolDiscovery {
  return {
    name: tool.tool_name,
    description: tool.description || "后端未填写工具说明。",
    schemaSummary: Object.keys(tool.input_schema).join(", ") || "schema",
    lastDiscovered: "后端未记录",
  };
}

function mapFullTrace(run: AgentRunAuditRecord, trace: ApiFullTrace): FullTraceRecord {
  const eventRows = Object.entries(trace.trace).map(([key, value]) => [
    "后端追踪",
    key,
    typeof value === "string" ? value : JSON.stringify(value),
  ]);
  return {
    traceId: `trace_${trace.run_id}`,
    runId: String(trace.run_id),
    status: run.status,
    agent: run.agent,
    model: run.model,
    user: run.user,
    timestamp: run.started,
    events: eventRows.length > 0 ? eventRows : [["后端追踪", "trace", "未记录事件明细"]],
    rawPayload: JSON.stringify(trace.trace, null, 2),
    artifacts: run.artifacts,
  };
}

const adminModules: AdminModule[] = [
  { route: "admin-overview", href: "/admin", title: "治理总览", meta: "待办与风险", icon: Gauge },
  { route: "account-approval", href: "/admin/account-approval", title: "账号审批", meta: "本地账号", icon: UserCheck },
  { route: "agent-lifecycle", href: "/admin/agents", title: "智能体生命周期", meta: "策略与能力", icon: Bot },
  { route: "model-configurations", href: "/admin/models", title: "模型配置", meta: "提供商目录", icon: Settings2 },
  { route: "mcp-servers", href: "/admin/mcp-servers", title: "MCP 服务器", meta: "工具注册表", icon: ServerCog },
  { route: "search-provider", href: "/admin/search-provider", title: "搜索提供方", meta: "搜索能力", icon: Search },
  { route: "page-read-provider", href: "/admin/page-read-provider", title: "页面读取提供方", meta: "页面读取能力", icon: FileText },
  { route: "sandbox-status", href: "/admin/sandbox", title: "沙箱状态", meta: "沙箱能力", icon: TerminalSquare },
  { route: "run-audit", href: "/admin/run-audit", title: "运行审计", meta: "运行治理", icon: Activity },
];

const adminPageModules: AdminModule[] = [
  ...adminModules,
  { route: "full-trace", href: "/admin/full-trace", title: "完整追踪详情", meta: "管理员诊断", icon: ScrollText },
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

function AuthEntryPage({
  error,
  mode,
  notice,
  onSubmit,
}: {
  error?: string;
  mode: "login" | "register";
  notice?: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const visualRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<Array<HTMLDivElement | null>>([]);

  useGSAP(
    () => {
      const shell = shellRef.current;
      const visual = visualRef.current;
      const panel = panelRef.current;
      if (!shell || !visual || !panel) {
        return;
      }

      const animateIn = gsap.context(() => {
        gsap.set([visual, ...cardRefs.current.filter(Boolean)], { opacity: 0, y: 18 });
        gsap.set(panel, { y: 10 });
        gsap.to(visual, { opacity: 1, y: 0, duration: 0.9, ease: "power3.out" });
        gsap.to(panel, { y: 0, duration: 0.7, ease: "power3.out", delay: 0.04 });
        gsap.to(cardRefs.current.filter(Boolean), {
          opacity: 1,
          y: 0,
          duration: 0.9,
          stagger: 0.07,
          delay: 0.12,
          ease: "power3.out",
        });

        const parallax = shell.querySelector<HTMLElement>(".auth-showcase");
        if (parallax) {
          gsap.fromTo(
            parallax,
            { y: 0, rotate: -8 },
            {
              y: -18,
              rotate: 2,
              ease: "none",
              scrollTrigger: {
                trigger: shell,
                start: "top top",
                end: "bottom top",
                scrub: 0.8,
              },
            },
          );
        }
      }, shell);

      return () => animateIn.revert();
    },
    { scope: shellRef, dependencies: [mode] },
  );

  const isLogin = mode === "login";

  return (
    <main className="auth-page">
      <div className="auth-backdrop" aria-hidden="true" />
      <div className="auth-shell" ref={shellRef}>
        <aside className="auth-visual" ref={visualRef} aria-hidden="true">
          <div className="auth-showcase">
            <div className="auth-browser" ref={(node) => { cardRefs.current[0] = node; }}>
              <div className="auth-browser-bar">
                <span />
                <span />
                <span />
                <i />
              </div>
              <div className="auth-browser-toolbar">
                <span className="auth-toolbar-primary" />
                <span />
                <span />
              </div>
              <div className="auth-browser-icons">
                <span><Search size={20} strokeWidth={2} /></span>
                <span><Database size={20} strokeWidth={2} /></span>
                <span><TerminalSquare size={20} strokeWidth={2} /></span>
              </div>
              <div className="auth-browser-grid">
                {Array.from({ length: 9 }).map((_, index) => (
                  <span key={index}>
                    <i />
                    <b />
                    <b />
                  </span>
                ))}
              </div>
            </div>

            <div className="auth-floating-card auth-floating-card-left" ref={(node) => { cardRefs.current[1] = node; }}>
              <div className="auth-mini-bars">
                <span />
                <span />
                <span />
              </div>
              <div className="auth-mini-stack">
                <span />
                <span />
                <span />
              </div>
            </div>

            <div className="auth-floating-card auth-floating-card-right" ref={(node) => { cardRefs.current[2] = node; }}>
              <svg viewBox="0 0 132 70" role="presentation">
                <path d="M10 54C36 52 49 38 66 30c18-9 30-15 56-18" />
                <path d="M10 54C36 52 49 38 66 30c18-9 30-15 56-18" />
              </svg>
              <div className="auth-mini-dots">
                <span />
                <span />
                <span />
              </div>
            </div>

            <div className="auth-boost" ref={(node) => { cardRefs.current[3] = node; }}>
              <BadgeCheck size={18} strokeWidth={2.2} />
              <span />
            </div>

            <div className="auth-visual-chips" ref={(node) => { cardRefs.current[4] = node; }}>
              <span><LockKeyhole size={18} strokeWidth={2} /></span>
              <span><Workflow size={18} strokeWidth={2} /></span>
              <span><Sparkles size={18} strokeWidth={2} /></span>
            </div>
          </div>
        </aside>

        <section className="auth-panel" ref={panelRef} aria-label={isLogin ? "登录" : "账号申请"}>
          <div className="auth-panel-top">
            <a className="auth-brand" href={isLogin ? "/login" : "/register"} aria-label="Minimalist Agent">
              <span className="brand-mark" aria-hidden="true">
                <img className="brand-logo" src="/brand-mark.svg" alt="" />
              </span>
              <span>Minimalist Agent</span>
            </a>
          </div>

          <div className="auth-card-header">
            <h1>{isLogin ? "登录" : "申请账号"}</h1>
            <p>{isLogin ? "欢迎回来，进入 Minimalist Agent 工作台" : "提交本地账号申请，等待管理员审批"}</p>
          </div>

          <form className="auth-form" onSubmit={onSubmit}>
            <label className="auth-field" htmlFor="auth-identity">
              <span>{isLogin ? "账号或邮箱" : "用户名"}</span>
              <Input
                id="auth-identity"
                name="username"
                autoComplete={isLogin ? "username" : "username"}
                placeholder={isLogin ? "请输入账号或邮箱" : "请输入用户名"}
              />
            </label>

            {!isLogin ? (
              <label className="auth-field" htmlFor="auth-email">
                <span>邮箱</span>
                <Input id="auth-email" name="email" type="email" autoComplete="email" placeholder="请输入邮箱" />
              </label>
            ) : null}

            <label className="auth-field" htmlFor="auth-password">
              <span>密码</span>
              <Input
                id="auth-password"
                name="password"
                type="password"
                autoComplete={isLogin ? "current-password" : "new-password"}
                placeholder="请输入密码"
              />
            </label>

            {!isLogin ? (
              <label className="auth-field" htmlFor="auth-password-confirm">
                <span>确认密码</span>
                <Input
                  id="auth-password-confirm"
                  name="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="请再次输入密码"
                />
              </label>
            ) : null}

            {error ? <p role="alert" className="form-error">{error}</p> : null}
            {notice ? <p role="status" className="form-success">{notice}</p> : null}

            <Button className="auth-submit" type="submit" aria-label={isLogin ? "登录" : "提交申请"}>
              <ArrowRight size={18} strokeWidth={2.2} />
              <span>{isLogin ? "登录" : "提交申请"}</span>
            </Button>
          </form>

          <div className="auth-inline-row">
            <span>{isLogin ? "无账号" : "已有账号"}</span>
            <a href={isLogin ? "/register" : "/login"}>{isLogin ? "申请" : "登录"}</a>
          </div>
        </section>
      </div>
    </main>
  );
}

export function LoginPage() {
  const [loginError, setLoginError] = useState("");
  const registrationNotice = new URLSearchParams(window.location.search).get("registered") === "1"
    ? "账号申请已提交，审批通过后即可登录"
    : "";

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoginError("");

    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        login: String(form.get("username") ?? ""),
        password: String(form.get("password") ?? ""),
      }),
    });

    if (!response.ok) {
      if (response.status === 403) {
        const error = await response.json() as { detail?: string };
        if (error.detail === "Account is pending approval.") {
          window.history.pushState({}, "", "/approval-pending");
          window.dispatchEvent(new Event("minimalist-agent:navigate"));
          return;
        }
      }
      setLoginError("账号或密码无效");
      return;
    }

    const result = await response.json() as { access_token: string };
    window.localStorage.setItem(authTokenStorageKey, result.access_token);
    notifyAuthChanged();
    window.history.pushState({}, "", "/app/conversations");
    window.dispatchEvent(new Event("minimalist-agent:navigate"));
  }

  return (
    <AuthEntryPage
      error={loginError}
      mode="login"
      notice={loginError ? "" : registrationNotice}
      onSubmit={login}
    />
  );
}

export function RegisterPage() {
  const [registerError, setRegisterError] = useState("");

  async function requestAccess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRegisterError("");

    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirmPassword = String(form.get("confirm-password") ?? "");

    if (password !== confirmPassword) {
      setRegisterError("两次输入的密码不一致");
      return;
    }

    const email = String(form.get("email") ?? "").trim();
    let response: Response;
    try {
      response = await fetch("/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: String(form.get("username") ?? "").trim(),
          email: email || null,
          password,
        }),
      });
    } catch {
      setRegisterError("账号申请提交失败，请检查后端服务。");
      return;
    }

    if (!response.ok) {
      setRegisterError(response.status === 409 ? "账号或邮箱已存在" : "账号申请提交失败，请稍后重试");
      return;
    }

    window.history.pushState({}, "", "/login?registered=1");
    window.dispatchEvent(new Event("minimalist-agent:navigate"));
  }

  return <AuthEntryPage error={registerError} mode="register" onSubmit={requestAccess} />;
}

export function ApprovalPendingPage() {
  return (
    <main className="access-page access-workbench" aria-labelledby="pending-title">
      <section className="access-console" aria-label="待审批状态">
        <header className="access-console-top">
          <a className="access-brand" href="/login" aria-label="Minimalist Agent">
            <span className="brand-mark" aria-hidden="true">
              <img className="brand-logo" src="/brand-mark.svg" alt="" />
            </span>
            <span>Minimalist Agent</span>
          </a>
          <span className="access-state pending">待审批</span>
        </header>

        <div className="access-console-main">
          <div className="access-card-header">
            <p className="eyebrow">账号审批</p>
            <h1 id="pending-title">待审批</h1>
          </div>
          <ol className="access-status-list" aria-label="审批进度">
            <li>
              <span>申请</span>
              <strong>已提交</strong>
            </li>
            <li className="current">
              <span>审批</span>
              <strong>等待管理员</strong>
            </li>
            <li>
              <span>访问</span>
              <strong>未开放</strong>
            </li>
          </ol>
          <div className="access-form-actions">
            <Button className="primary-button full-width" type="button">刷新状态</Button>
            <a className="secondary-button full-width" href="/login">返回登录</a>
          </div>
        </div>

        <footer className="access-console-foot">
          <span>入口：锁定</span>
          <span>下一步：审批通过后登录</span>
        </footer>
      </section>
    </main>
  );
}

export function AccountSettingsPage() {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let isCurrent = true;

    getCurrentUser()
      .then((user) => {
        if (!isCurrent) {
          return;
        }
        setCurrentUser(user);
        setUsername(user.username);
        setEmail(user.email ?? "");
      })
      .catch((loadError) => {
        if (!isCurrent) {
          return;
        }
        setError(loadError instanceof Error ? loadError.message : "账号信息加载失败。");
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextUsername = username.trim();
    const nextEmail = email.trim();
    if (!nextUsername) {
      setError("用户名不能为空。");
      return;
    }

    setIsSaving(true);
    setStatusMessage("");
    setError("");
    try {
      const updatedUser = await updateCurrentUser({
        username: nextUsername,
        email: nextEmail || null,
      });
      setCurrentUser(updatedUser);
      setUsername(updatedUser.username);
      setEmail(updatedUser.email ?? "");
      setStatusMessage("账号信息已保存。");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "账号信息保存失败。");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="route-page" aria-labelledby="account-settings-title">
      <section className="route-panel account-settings-panel">
        <div className="route-header compact-account-header">
          <div>
            <p className="eyebrow">本地账号</p>
            <h1 id="account-settings-title">账号设置</h1>
          </div>
          <a className="secondary-button" href="/app/conversations">返回工作区</a>
        </div>
        <div className="detail-grid">
          <InfoTile title="用户名" value={currentUser?.username ?? "加载中"} />
          <InfoTile title="邮箱" value={currentUser?.email ?? "未设置"} />
          <InfoTile title="角色" value={formatUserRole(currentUser?.role)} />
          <InfoTile title="状态" value={formatUserStatus(currentUser?.status)} />
        </div>
        <form className="profile-edit-form" aria-label="个人信息修改" onSubmit={saveProfile}>
          <label>
            <span>用户名</span>
            <Input
              name="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </label>
          <label>
            <span>邮箱</span>
            <Input
              name="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          {statusMessage ? <p className="form-success" role="status">{statusMessage}</p> : null}
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <div className="account-settings-actions">
            <Button className="primary-button" disabled={isSaving} type="submit">
              {isSaving ? "保存中" : "保存个人信息"}
            </Button>
            <Button className="danger-button" type="button" onClick={logout}>退出登录</Button>
          </div>
        </form>
      </section>
    </main>
  );
}

function formatUserRole(role: CurrentUser["role"] | undefined) {
  if (role === "admin") {
    return "管理员";
  }
  if (role === "user") {
    return "成员";
  }
  return "加载中";
}

function formatUserStatus(status: CurrentUser["status"] | undefined) {
  if (!status) {
    return "加载中";
  }
  return statusLabel(status);
}

export function AdminPage({ route }: { route: AppRoute }) {
  const active = adminPageModules.find((module) => module.route === route) ?? adminModules[0];
  const shellRef = useRef<HTMLElement | null>(null);

  useGSAP(
    () => {
      const shell = shellRef.current;
      if (!shell) {
        return;
      }

      const context = gsap.context(() => {
        gsap.fromTo(
          shell.querySelectorAll(".nav-item, .route-header, .route-panel"),
          { opacity: 0, y: 8 },
          { opacity: 1, y: 0, duration: 0.42, ease: "power2.out", stagger: 0.025 },
        );
      }, shell);

      return () => context.revert();
    },
    { scope: shellRef, dependencies: [route] },
  );

  return (
    <main className="admin-route-shell" ref={shellRef}>
      <CopilotAdminBridge activeModule={active} modules={adminModules} />
      <aside className="admin-route-nav" aria-label="管理员导航">
        <a className="brand-link" href="/app/conversations">
          <span className="brand-mark" aria-hidden="true">
            <img className="brand-logo" src="/brand-mark.svg" alt="" />
          </span>
          <span>管理控制台</span>
        </a>
        <nav className="nav-list">
          {adminModules.map((module) => (
            <a
              className={module.route === route ? "nav-item active" : "nav-item"}
              href={module.href}
              key={module.route}
            >
              <module.icon aria-hidden="true" strokeWidth={1.8} />
              <span>
                <strong>{module.title}</strong>
                <span className="meta">{module.meta}</span>
              </span>
            </a>
          ))}
        </nav>
      </aside>
      <div className="admin-route-main">
        <header className="route-header">
          <div>
            <h1 id="admin-page-title">{active.title}</h1>
            <p className="compact-route-meta">{active.meta}</p>
          </div>
          <a className="secondary-button admin-exit-link" href="/app/conversations">工作区</a>
        </header>
        {adminContent(route)}
      </div>
    </main>
  );
}

function adminContent(route: AppRoute) {
  switch (route) {
    case "admin-overview":
      return <AdminOverviewPanel />;
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

function AdminOverviewPanel() {
  const [overview, setOverview] = useState<AdminOverviewState | null>(null);
  const [loadError, setLoadError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isCurrent = true;
    setIsLoading(true);
    setLoadError("");

    Promise.all([
      adminFetch<ApiLocalAccount[]>("/api/admin/accounts"),
      adminFetch<ApiAgent[]>("/api/admin/agents"),
      adminFetch<ApiRunAuditList>("/api/admin/run-audit"),
      adminFetch<ApiSearchProvider[]>("/api/admin/search-provider-configurations"),
      adminFetch<ApiPageReadProvider[]>("/api/admin/page-read-provider-configurations"),
    ])
      .then(([accounts, agents, audit, searchProviders, pageReadProviders]) => {
        if (!isCurrent) {
          return;
        }
        setOverview({
          pendingAccounts: accounts.filter((account) => account.status === "pending").length,
          enabledAgents: agents.filter((agent) => agent.status === "enabled").length,
          failedRuns: audit.runs.filter((run) => run.status === "failed").length,
          artifactCount: audit.storage.artifact_count,
          searchProviderReady: searchProviders.some((provider) => provider.enabled),
          pageReadProviderReady: pageReadProviders.some((provider) => provider.enabled),
        });
      })
      .catch(() => {
        if (isCurrent) {
          setOverview(null);
          setLoadError("无法加载治理总览，请检查管理员权限或后端服务。");
        }
      })
      .finally(() => {
        if (isCurrent) {
          setIsLoading(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  const providerReady = Boolean(overview?.searchProviderReady && overview?.pageReadProviderReady);
  const tasks: AdminOverviewTask[] = [
    {
      href: "/admin/account-approval",
      title: overview && overview.pendingAccounts > 0
        ? `审批 ${overview.pendingAccounts} 个待审批账号`
        : "没有待审批账号",
      meta: "账号审批",
      status: overview && overview.pendingAccounts > 0 ? "pending" : "ready",
    },
    {
      href: providerReady ? "/admin/search-provider" : "/admin/search-provider",
      title: providerReady ? "搜索与页面读取提供方可用" : "检查能力提供方配置",
      meta: "搜索提供方 / 页面读取提供方",
      status: providerReady ? "ready" : "warning",
    },
    {
      href: "/admin/run-audit",
      title: overview && overview.failedRuns > 0
        ? `复核 ${overview.failedRuns} 条失败运行`
        : "近期没有失败运行",
      meta: "运行审计",
      status: overview && overview.failedRuns > 0 ? "warning" : "ready",
    },
  ];

  return (
    <>
      {isLoading ? <p className="empty-state">正在加载治理总览...</p> : null}
      {loadError ? <p className="empty-state danger-state" role="alert">{loadError}</p> : null}
      <section className="detail-grid" aria-label="治理总览指标">
        <InfoTile title="待审批账号" value={overview ? String(overview.pendingAccounts) : "未加载"} tone={overview?.pendingAccounts ? "pending" : "success"} icon={UserCheck} />
        <InfoTile title="启用智能体" value={overview ? `${overview.enabledAgents} 个` : "未加载"} tone={overview?.enabledAgents ? "success" : "warning"} icon={Bot} />
        <InfoTile title="近期失败运行" value={overview ? String(overview.failedRuns) : "未加载"} tone={overview?.failedRuns ? "warning" : "success"} icon={Activity} />
        <InfoTile title="产物存储" value={overview ? `${overview.artifactCount} 个产物` : "未加载"} icon={Database} />
      </section>
      <TaskList tasks={tasks} />
    </>
  );
}

function TaskList({ tasks }: { tasks: AdminOverviewTask[] }) {
  const actionableTasks = tasks.filter((task) => task.status !== "ready");

  return (
    <Card className="route-panel">
      <CardHeader>
        <CardDescription>治理待办</CardDescription>
        <CardTitle>{actionableTasks.length > 0 ? "需要处理" : "暂无待处理风险"}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {actionableTasks.length > 0 ? (
          actionableTasks.map((task) => (
            <TaskRow
              href={task.href}
              key={`${task.meta}-${task.title}`}
              title={task.title}
              meta={task.meta}
              status={task.status}
            />
          ))
        ) : (
          <EmptyStateAction
            title="所有治理入口当前正常"
            description="待审批账号、能力提供方和失败运行都没有需要立即处理的事项。"
            href="/admin/run-audit"
            actionLabel="查看运行审计"
          />
        )}
      </CardContent>
    </Card>
  );
}

function TaskRow({
  href,
  title,
  meta,
  status,
}: {
  href: string;
  title: string;
  meta: string;
  status: string;
}) {
  return (
    <a className="task-row" href={href}>
      <div>
        <strong>{title}</strong>
        <p>{meta}</p>
      </div>
      <span className="task-row-action">
        <Badge variant={taskBadgeVariant(status)}>{taskStatusLabel(status)}</Badge>
        <ArrowRight aria-hidden="true" />
      </span>
    </a>
  );
}

function EmptyStateAction({
  actionLabel,
  description,
  href,
  onAction,
  title,
}: {
  actionLabel: string;
  description: string;
  href?: string;
  onAction?: () => void;
  title: string;
}) {
  return (
    <div className="empty-state action-empty-state">
      <div>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
      {onAction ? (
        <Button className="secondary-button" type="button" onClick={onAction}>{actionLabel}</Button>
      ) : href ? (
        <a className="secondary-button" href={href}>{actionLabel}</a>
      ) : (
        <Button className="secondary-button" type="button" disabled>{actionLabel}</Button>
      )}
    </div>
  );
}

function AdminDialog({
  children,
  eyebrow,
  onClose,
  title,
}: {
  children: ReactNode;
  eyebrow?: string;
  onClose: () => void;
  title: string;
}) {
  return (
    <div className="admin-dialog-backdrop">
      <section className="admin-dialog" role="dialog" aria-modal="true" aria-label={title}>
        <div className="panel-head compact-panel-head">
          <div>
            {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
            <h2>{title}</h2>
          </div>
          <Button className="secondary-button admin-dialog-close" type="button" onClick={onClose}>
            关闭
          </Button>
        </div>
        {children}
      </section>
    </div>
  );
}

function AccountApprovalPanel() {
  const [accounts, setAccounts] = useState<LocalAccount[]>([]);
  const [loadError, setLoadError] = useState("");
  const [saveStatus, setSaveStatus] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<LocalAccountStatus>("pending");
  const [selectedUsername, setSelectedUsername] = useState<string | null>(null);
  const [accountActionReason, setAccountActionReason] = useState("");
  const [accountAuditEvents, setAccountAuditEvents] = useState<string[]>([]);
  const [accountAuditRefreshKey, setAccountAuditRefreshKey] = useState(0);

  useEffect(() => {
    let isCurrent = true;
    setIsLoading(true);
    setLoadError("");

    adminFetch<ApiLocalAccount[]>("/api/admin/accounts")
      .then((result) => {
        if (!isCurrent) {
          return;
        }
        const mappedAccounts = result.map(mapLocalAccount);
        setAccounts(mappedAccounts);
        setSelectedUsername(
          mappedAccounts.find((account) => account.status === statusFilter)?.username ??
          mappedAccounts[0]?.username ??
          null,
        );
      })
      .catch(() => {
        if (!isCurrent) {
          return;
        }
        setAccounts([]);
        setSelectedUsername(null);
        setLoadError("无法加载本地账号列表，请检查管理员权限或后端服务。");
      })
      .finally(() => {
        if (isCurrent) {
          setIsLoading(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  const filteredAccounts = useMemo(
    () => accounts.filter((account) => account.status === statusFilter),
    [accounts, statusFilter],
  );
  const selectedAccount = filteredAccounts.find((account) => account.username === selectedUsername) ?? null;
  const accountCounts = useMemo(
    () => ({
      pending: accounts.filter((account) => account.status === "pending").length,
      enabled: accounts.filter((account) => account.status === "enabled").length,
      rejected: accounts.filter((account) => account.status === "rejected").length,
      disabled: accounts.filter((account) => account.status === "disabled").length,
    }),
    [accounts],
  );

  useEffect(() => {
    if (!selectedAccount) {
      setAccountAuditEvents([]);
      return;
    }
    let isCurrent = true;
    adminFetch<ApiAccountAuditEvent[]>(`/api/admin/accounts/${selectedAccount.id}/audit-events`)
      .then((events) => {
        if (!isCurrent) {
          return;
        }
        setAccountAuditEvents(events.length > 0
          ? events.map(accountAuditLine).reverse()
          : selectedAccount.history);
      })
      .catch(() => {
        if (isCurrent) {
          setAccountAuditEvents(selectedAccount.history);
        }
      });
    return () => {
      isCurrent = false;
    };
  }, [selectedAccount?.id, selectedAccount?.lastAction, accountAuditRefreshKey]);

  function updateMappedAccount(updated: ApiLocalAccount) {
    const mappedAccount = mapLocalAccount(updated);
    setAccounts((currentAccounts) =>
      currentAccounts.map((currentAccount) =>
        currentAccount.id === mappedAccount.id
          ? {
              ...mappedAccount,
              history: [mappedAccount.lastAction, ...currentAccount.history],
            }
          : currentAccount,
      ),
    );
    setSelectedUsername(mappedAccount.username);
    setStatusFilter(mappedAccount.status);
    setAccountAuditRefreshKey((currentKey) => currentKey + 1);
    return mappedAccount;
  }

  async function changeStatus(account: LocalAccount, status: LocalAccountStatus) {
    const actionPath = {
      disabled: "disable",
      enabled: account.status === "pending" ? "approve" : "enable",
      pending: "",
      rejected: "reject",
    }[status];
    if (!actionPath) {
      return;
    }

    const reason = accountActionReason.trim();
    if ((status === "rejected" || status === "disabled") && !reason) {
      setSaveStatus("请填写原因。");
      return;
    }

    setLoadError("");
    setSaveStatus("");
    try {
      const updated = await adminFetch<ApiLocalAccount>(`/api/admin/accounts/${account.id}/${actionPath}`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
      updateMappedAccount(updated);
      setAccountActionReason("");
      setSaveStatus("账号状态已更新。");
    } catch {
      setLoadError("账号状态更新失败，请稍后重试。");
    }
  }

  async function updateAccountNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedAccount) {
      return;
    }
    const formData = new FormData(event.currentTarget);
    setSaveStatus("");
    try {
      const updated = await adminFetch<ApiLocalAccount>(`/api/admin/accounts/${selectedAccount.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          note: String(formData.get("note") ?? ""),
        }),
      });
      updateMappedAccount(updated);
      setSaveStatus("管理员备注已保存。");
    } catch {
      setSaveStatus("管理员备注保存失败。");
    }
  }

  function switchStatus(status: LocalAccountStatus) {
    setStatusFilter(status);
    setSelectedUsername(accounts.find((account) => account.status === status)?.username ?? null);
  }

  return (
    <section className="route-panel" aria-label="账号审批">
      <CopilotAccountApprovalBridge
        accounts={accounts}
        selectedUsername={selectedAccount?.username ?? null}
        setSelectedUsername={setSelectedUsername}
        setStatusFilter={setStatusFilter}
        statusFilter={statusFilter}
      />
      <div className="account-toolbar">
        <Tabs
          className="w-full"
          value={statusFilter}
          onValueChange={(value) => switchStatus(value as LocalAccountStatus)}
        >
          <TabsList className="w-fit" aria-label="本地账号状态">
            {(["pending", "enabled", "rejected", "disabled"] as LocalAccountStatus[]).map((status) => (
              <TabsTrigger key={status} value={status}>
                {statusLabel(status)}
                <Badge variant="secondary">{accountCounts[status]}</Badge>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <p className="inline-note">当前管理员账号不能在此页面禁用。</p>
      </div>
      {saveStatus ? <p className="inline-note">{saveStatus}</p> : null}
      {isLoading ? <p className="empty-state">正在加载本地账号...</p> : null}
      {loadError ? <p className="empty-state danger-state" role="alert">{loadError}</p> : null}
      <div className={selectedAccount ? "account-approval-layout" : "account-approval-layout empty-detail"}>
        <div className="route-table-wrap">
          <table className="route-table" aria-label="本地账号列表">
            <thead>
              <tr>
                <th>用户名</th>
                <th>邮箱</th>
                <th>状态</th>
                <th>创建时间</th>
                <th>最近操作</th>
                <th>操作</th>
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
                  <td><Badge variant={accountBadgeVariant(account.status)}>{statusLabel(account.status)}</Badge></td>
                  <td>{account.createdAt}</td>
                  <td>{account.lastAction}</td>
                  <td>
                    <div className="table-actions">
                      <Button className="secondary-button" type="button" onClick={() => setSelectedUsername(account.username)}>
                        详情
                      </Button>
                      {account.status === "pending" ? (
                        <>
                          <Button className="primary-button" type="button" onClick={() => changeStatus(account, "enabled")}>
                            批准
                          </Button>
                          <Button className="danger-button" type="button" onClick={() => changeStatus(account, "rejected")}>
                            拒绝
                          </Button>
                        </>
                      ) : null}
                      {account.status === "enabled" && account.role !== "admin" ? (
                        <Button className="danger-button" type="button" onClick={() => changeStatus(account, "disabled")}>
                          禁用
                        </Button>
                      ) : null}
                      {(account.status === "disabled" || account.status === "rejected") ? (
                        <Button className="secondary-button" type="button" onClick={() => changeStatus(account, "enabled")}>
                          重新启用
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredAccounts.length === 0 ? (
            <EmptyStateAction
              title={`暂无${statusLabel(statusFilter)}账号`}
              description={statusFilter === "pending"
                ? "新的账号申请会出现在这里。现在无需处理审批。"
                : "切换到其他状态可以查看历史账号。"}
              onAction={() => switchStatus("pending")}
              actionLabel="查看待审批"
            />
          ) : null}
        </div>
        {selectedAccount ? (
          <Card className="account-detail-panel" aria-label="本地账号详情">
            <CardContent className="flex flex-col gap-4">
              <div>
                <p className="eyebrow">本地账号</p>
                <h2>{selectedAccount.username}</h2>
                <p>{selectedAccount.email}</p>
              </div>
              <Badge variant={accountBadgeVariant(selectedAccount.status)}>{statusLabel(selectedAccount.status)}</Badge>
              <p>{selectedAccount.riskNote}</p>
              {selectedAccount.statusReason ? (
                <p className="inline-note">原因：{selectedAccount.statusReason}</p>
              ) : null}
              <label>
                <span>操作原因</span>
                <Textarea
                  value={accountActionReason}
                  onChange={(event) => setAccountActionReason(event.currentTarget.value)}
                  placeholder="拒绝或禁用时必填"
                />
              </label>
              <div className="stack">
                <h3>审批记录</h3>
                <ul className="plain-list">
                  {(accountAuditEvents.length > 0 ? accountAuditEvents : selectedAccount.history).map((entry) => (
                    <li key={entry}>{entry}</li>
                  ))}
                </ul>
              </div>
              <form className="admin-inline-form account-note-form" aria-label="保存管理员备注" onSubmit={updateAccountNote}>
                <label>
                  <span>管理员备注</span>
                  <Textarea name="note" placeholder="仅管理员可见" defaultValue={selectedAccount.note} />
                </label>
                <Button className="secondary-button" type="submit">保存备注</Button>
              </form>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </section>
  );
}

function accountStatusAction(status: LocalAccountStatus, reason = "") {
  const suffix = reason ? `：${reason}` : "";
  switch (status) {
    case "enabled":
      return `管理员已批准${suffix}`;
    case "rejected":
      return `管理员已拒绝${suffix}`;
    case "disabled":
      return `管理员已禁用${suffix}`;
    case "pending":
      return "等待管理员审核";
  }
}

function accountAuditLine(event: ApiAccountAuditEvent) {
  const label = {
    approved: "批准",
    bootstrapped: "初始化管理员",
    disabled: "禁用",
    enabled: "重新启用",
    registered: "注册",
    rejected: "拒绝",
    updated: "更新",
  }[event.action];
  const reason = event.reason ? `：${event.reason}` : "";
  return `${compactTimestamp(event.created_at)} ${label}${reason}`;
}

function processVisibilityLabel(visibility: ApiAgent["process_visibility"]) {
  switch (visibility) {
    case "minimal":
      return "最小";
    case "standard":
      return "标准";
    case "verbose":
      return "详细";
  }
}

function capabilitySummary(policy: ApiAgent["capability_policy"]) {
  const enabled = [
    policy.search_enabled ? "搜索" : null,
    policy.page_read_enabled ? "页面读取" : null,
    policy.sandbox_enabled ? "沙箱" : null,
    policy.mcp_server_ids.length > 0 ? "MCP" : null,
  ].filter(Boolean);
  return enabled.length > 0 ? enabled.join("、") : "未启用能力";
}

function capabilityPolicyLines(policy: ApiAgent["capability_policy"]) {
  return [
    policy.search_enabled ? "搜索能力已启用" : "搜索能力已停用",
    policy.page_read_enabled ? "页面读取能力已启用" : "页面读取能力已停用",
    policy.sandbox_enabled ? "沙箱能力已启用" : "沙箱能力已停用",
    policy.mcp_server_ids.length > 0
      ? `MCP 服务器授权：${policy.mcp_server_ids.map((id) => `#${id}`).join("、")}`
      : "未授权 MCP 服务器",
  ];
}

function statusLabel(status: LocalAccountStatus) {
  switch (status) {
    case "pending":
      return "待审批";
    case "enabled":
      return "已启用";
    case "rejected":
      return "已拒绝";
    case "disabled":
      return "已禁用";
  }
}

function modelHealthLabel(status: ModelHealthStatus) {
  switch (status) {
    case "healthy":
      return "健康";
    case "unhealthy":
      return "异常";
    case "not_checked":
      return "未检查";
  }
}

function AgentLifecyclePanel() {
  const [agents, setAgents] = useState<AgentLifecycleRecord[]>([]);
  const [modelConfigurations, setModelConfigurations] = useState<ModelConfigurationRecord[]>([]);
  const [loadError, setLoadError] = useState("");
  const [saveStatus, setSaveStatus] = useState("");
  const [agentReadiness, setAgentReadiness] = useState<ApiAgentReadiness | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [isCreateDraftOpen, setIsCreateDraftOpen] = useState(false);
  const [newAgentProcessVisibility, setNewAgentProcessVisibility] = useState<ApiAgent["process_visibility"]>("standard");
  const [newAgentDefaultModelId, setNewAgentDefaultModelId] = useState("");
  const selectedAgent =
    agents.find((agent) => agent.id === selectedAgentId) ?? agents[0] ?? null;

  useEffect(() => {
    setAgentReadiness(null);
  }, [selectedAgent?.id]);

  useEffect(() => {
    let isCurrent = true;
    setIsLoading(true);
    setLoadError("");

    Promise.all([
      adminFetch<ApiAgent[]>("/api/admin/agents"),
      adminFetch<ApiModelConfiguration[]>("/api/admin/model-configurations"),
      adminFetch<ApiModelProvider[]>("/api/admin/model-providers"),
    ])
      .then(([agentResult, modelResult, providerResult]) => {
        if (!isCurrent) {
          return;
        }
        const mappedAgents = agentResult.map(mapAgent);
        const mappedConfigurations = modelResult.map((configuration) =>
          mapModelConfiguration(configuration, providerResult),
        );
        setAgents(mappedAgents);
        setModelConfigurations(mappedConfigurations);
        setSelectedAgentId(mappedAgents[0]?.id ?? "");
        setNewAgentDefaultModelId(String(mappedConfigurations[0]?.id ?? ""));
      })
      .catch(() => {
        if (!isCurrent) {
          return;
        }
        setAgents([]);
        setModelConfigurations([]);
        setSelectedAgentId("");
        setLoadError("无法加载智能体列表，请检查管理员权限或后端服务。");
      })
      .finally(() => {
        if (isCurrent) {
          setIsLoading(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  async function setAgentStatus(action: "disable" | "enable" | "retire") {
    if (!selectedAgent) {
      return;
    }
    setLoadError("");
    try {
      const updated = await adminFetch<ApiAgent>(`/api/admin/agents/${selectedAgent.id}/${action}`, {
        method: "POST",
      });
      const mappedAgent = mapAgent(updated);
      setAgents((currentAgents) =>
        currentAgents.map((agent) => agent.id === mappedAgent.id ? mappedAgent : agent),
      );
      setSelectedAgentId(mappedAgent.id);
    } catch {
      setLoadError("智能体状态更新失败，请稍后重试。");
    }
  }

  async function checkAgentReadiness() {
    if (!selectedAgent) {
      return;
    }
    setLoadError("");
    setSaveStatus("");
    try {
      const result = await adminFetch<ApiAgentReadiness>(
        `/api/admin/agents/${selectedAgent.id}/readiness-check`,
        { method: "POST" },
      );
      setAgentReadiness(result);
      setSaveStatus(result.ready ? "智能体已就绪。" : "智能体未就绪。");
    } catch {
      setSaveStatus("智能体就绪检查失败。");
    }
  }

  function checkedModelIds(formData: FormData, fallbackDefaultModelId: number | null) {
    const selectedIds = formData
      .getAll("allowedModelIds")
      .map((value) => Number.parseInt(String(value), 10))
      .filter(Number.isFinite);
    if (fallbackDefaultModelId !== null && !selectedIds.includes(fallbackDefaultModelId)) {
      selectedIds.unshift(fallbackDefaultModelId);
    }
    return selectedIds;
  }

  async function updateAgentPolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedAgent) {
      return;
    }
    const formData = new FormData(event.currentTarget);
    const defaultModelRaw = String(formData.get("defaultModelId") ?? "");
    const defaultModelId = defaultModelRaw ? Number.parseInt(defaultModelRaw, 10) : null;
    const capabilityPolicy = {
      mcp_server_ids: selectedAgent.capabilityPolicyValue.mcp_server_ids,
      sandbox_enabled: formData.get("sandboxEnabled") === "on",
      search_enabled: formData.get("searchEnabled") === "on",
      page_read_enabled: formData.get("pageReadEnabled") === "on",
    };

    setLoadError("");
    setSaveStatus("");
    try {
      const updated = await adminFetch<ApiAgent>(`/api/admin/agents/${selectedAgent.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          default_model_configuration_id: defaultModelId,
          allowed_model_configuration_ids: checkedModelIds(formData, defaultModelId),
          process_visibility: String(formData.get("processVisibility") ?? selectedAgent.processVisibilityValue),
          capability_policy: capabilityPolicy,
        }),
      });
      const mappedAgent = mapAgent(updated);
      setAgents((currentAgents) =>
        currentAgents.map((agent) => agent.id === mappedAgent.id ? mappedAgent : agent),
      );
      setSelectedAgentId(mappedAgent.id);
      setSaveStatus("智能体策略已保存。");
    } catch {
      setSaveStatus("智能体策略保存失败，请检查模型绑定或管理员权限。");
    }
  }

  async function updateAgentInstruction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedAgent) {
      return;
    }
    const formData = new FormData(event.currentTarget);
    const instruction = String(formData.get("instruction") ?? "").trim();
    if (!instruction) {
      setSaveStatus("智能体说明不能为空。");
      return;
    }

    setLoadError("");
    setSaveStatus("");
    try {
      const updated = await adminFetch<ApiAgent>(`/api/admin/agents/${selectedAgent.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          description: String(formData.get("description") ?? "").trim(),
          instruction,
        }),
      });
      const mappedAgent = mapAgent(updated);
      setAgents((currentAgents) =>
        currentAgents.map((agent) => agent.id === mappedAgent.id ? mappedAgent : agent),
      );
      setSelectedAgentId(mappedAgent.id);
      setSaveStatus("智能体说明已保存。");
    } catch {
      setSaveStatus("智能体说明保存失败。");
    }
  }

  async function createAgent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("name") ?? "").trim();
    const instruction = String(formData.get("instruction") ?? "").trim();
    if (!name || !instruction) {
      setSaveStatus("请填写智能体名称和说明。");
      return;
    }

    const defaultModelRaw = String(formData.get("defaultModelId") ?? "");
    const defaultModelId = defaultModelRaw ? Number.parseInt(defaultModelRaw, 10) : null;
    setLoadError("");
    setSaveStatus("");
    try {
      const created = await adminFetch<ApiAgent>("/api/admin/agents", {
        method: "POST",
        body: JSON.stringify({
          name,
          description: String(formData.get("description") ?? "").trim(),
          icon: String(formData.get("icon") ?? "agent").trim() || "agent",
          instruction,
          process_visibility: String(formData.get("processVisibility") ?? "standard"),
          default_model_configuration_id: defaultModelId,
          allowed_model_configuration_ids: checkedModelIds(formData, defaultModelId),
          capability_policy: {
            mcp_server_ids: [],
            sandbox_enabled: formData.get("sandboxEnabled") === "on",
            search_enabled: formData.get("searchEnabled") === "on",
            page_read_enabled: formData.get("pageReadEnabled") === "on",
          },
        }),
      });
      const mappedAgent = mapAgent(created);
      setAgents((currentAgents) => [...currentAgents, mappedAgent]);
      setSelectedAgentId(mappedAgent.id);
      setIsCreateDraftOpen(false);
      setSaveStatus("智能体已创建。");
    } catch {
      setSaveStatus("智能体创建失败，请检查后端返回或管理员权限。");
    }
  }

  return (
    <section className="route-panel" aria-label="智能体生命周期">
      <CopilotAgentLifecycleBridge
        agents={agents}
        isCreateDraftOpen={isCreateDraftOpen}
        selectedAgentId={selectedAgent?.id ?? null}
        setIsCreateDraftOpen={setIsCreateDraftOpen}
        setSelectedAgentId={setSelectedAgentId}
      />
      <div className="panel-head compact-panel-head">
        <div>
          <p className="eyebrow">智能体清单</p>
          <h2>先选智能体，再调整策略</h2>
          {saveStatus ? <p className="inline-note">{saveStatus}</p> : null}
        </div>
        <Button className="primary-button" type="button" onClick={() => setIsCreateDraftOpen(true)}>创建智能体</Button>
      </div>
      {isLoading ? <p className="empty-state">正在加载智能体...</p> : null}
      {loadError ? <p className="empty-state danger-state" role="alert">{loadError}</p> : null}
      <div className="admin-master-detail">
        <div className="route-table-wrap">
          <table className="route-table" aria-label="智能体列表">
            <thead>
              <tr>
                <th>名称</th>
                <th>状态</th>
                <th>默认模型</th>
                <th>可选模型数</th>
                <th>能力摘要</th>
                <th>过程可见性</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((agent) => (
                <tr className={agent.id === selectedAgent?.id ? "selected-row" : ""} key={agent.id}>
                  <td>{agent.name}</td>
                  <td>{lifecycleStatusLabel(agent.status)}</td>
                  <td>{agent.defaultModel}</td>
                  <td>{agent.allowedModels.length}</td>
                  <td>{agent.capabilitySummary}</td>
                  <td>{agent.processVisibility}</td>
                  <td>
                    <Button className="secondary-button" type="button" onClick={() => setSelectedAgentId(agent.id)}>
                      详情
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!isLoading && agents.length === 0 ? (
            <EmptyStateAction
              title="暂无智能体"
              description="创建后才能配置模型策略、能力授权和过程可见性。"
              onAction={() => setIsCreateDraftOpen(true)}
              actionLabel="创建智能体"
            />
          ) : null}
        </div>
        {selectedAgent ? (
          <aside className="context-panel" aria-label="智能体详情" role="region">
            <div className="panel-head">
              <div>
                <p className="eyebrow">智能体 {selectedAgent.avatar}</p>
                <h2>{selectedAgent.name}</h2>
                <p>{selectedAgent.description}</p>
              </div>
              <Badge variant={accountBadgeVariant(selectedAgent.status)}>{lifecycleStatusLabel(selectedAgent.status)}</Badge>
            </div>
            <div className="button-row compact-actions">
              <Button aria-label="启用智能体" className="secondary-button" type="button" disabled={selectedAgent.status !== "disabled"} onClick={() => setAgentStatus("enable")}>
                启用
              </Button>
              <Button aria-label="停用智能体" className="secondary-button" type="button" disabled={selectedAgent.status !== "enabled"} onClick={() => setAgentStatus("disable")}>
                停用
              </Button>
              <Button aria-label="归档智能体" className="secondary-button" type="button" disabled={selectedAgent.status === "retired"} onClick={() => setAgentStatus("retire")}>
                归档
              </Button>
              <Button aria-label="检查智能体就绪状态" className="secondary-button" type="button" onClick={checkAgentReadiness}>
                就绪检查
              </Button>
            </div>
            {agentReadiness ? (
              <section className="boundary-list readiness-list" aria-label="智能体就绪结果">
                <h3>{agentReadiness.ready ? "已就绪" : "未就绪"}</h3>
                {agentReadiness.issues.length > 0
                  ? agentReadiness.issues.map((issue) => <p key={issue}>{issue}</p>)
                  : <p>模型和能力引用可用。</p>}
              </section>
            ) : null}
            <Tabs defaultValue="policy">
              <TabsList aria-label="智能体详情分组">
                <TabsTrigger value="policy">策略</TabsTrigger>
                <TabsTrigger value="instruction">说明</TabsTrigger>
                <TabsTrigger value="mcp">MCP</TabsTrigger>
              </TabsList>
              <TabsContent value="policy">
                <section className="detail-grid compact-detail-grid">
                  <InfoTile title="过程可见性" value={selectedAgent.processVisibility} icon={FileSearch} />
                  <InfoTile title="默认模型" value={selectedAgent.defaultModel} icon={Settings2} />
                  <InfoTile title="可选模型" value={selectedAgent.allowedModels.join(", ")} icon={Bot} />
                  <InfoTile title="能力规则" value={selectedAgent.capabilityPolicy.length.toString()} icon={ShieldCheck} />
                </section>
                <form className="admin-inline-form" aria-label="编辑智能体策略" key={selectedAgent.id} onSubmit={updateAgentPolicy}>
                  <label>
                    <span>默认模型</span>
                    <Select name="defaultModelId" defaultValue={String(selectedAgent.defaultModelConfigurationId ?? "")}>
                      <SelectTrigger>
                        <SelectValue placeholder="未设置" />
                      </SelectTrigger>
                      <SelectContent>
                        {modelConfigurations.map((configuration) => (
                          <SelectItem key={configuration.id} value={configuration.id}>
                            {configuration.provider} · {configuration.model}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                  <fieldset className="checkbox-grid">
                    <legend>允许模型</legend>
                    {modelConfigurations.map((configuration) => (
                      <label className="checkbox-row" key={configuration.id}>
                        <input
                          defaultChecked={selectedAgent.allowedModelConfigurationIds.includes(Number(configuration.id))}
                          name="allowedModelIds"
                          type="checkbox"
                          value={configuration.id}
                        />
                        <span>{configuration.provider} · {configuration.model}</span>
                      </label>
                    ))}
                  </fieldset>
                  <label>
                    <span>过程可见性</span>
                    <Select name="processVisibility" defaultValue={selectedAgent.processVisibilityValue}>
                      <SelectTrigger>
                        <SelectValue placeholder="标准" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="minimal">最小</SelectItem>
                        <SelectItem value="standard">标准</SelectItem>
                        <SelectItem value="verbose">详细</SelectItem>
                      </SelectContent>
                    </Select>
                  </label>
                  <fieldset className="checkbox-grid">
                    <legend>能力策略</legend>
                    <label className="checkbox-row">
                      <input defaultChecked={selectedAgent.capabilityPolicyValue.search_enabled} name="searchEnabled" type="checkbox" />
                      <span>搜索</span>
                    </label>
                    <label className="checkbox-row">
                      <input defaultChecked={selectedAgent.capabilityPolicyValue.page_read_enabled} name="pageReadEnabled" type="checkbox" />
                      <span>页面读取</span>
                    </label>
                    <label className="checkbox-row">
                      <input defaultChecked={selectedAgent.capabilityPolicyValue.sandbox_enabled} name="sandboxEnabled" type="checkbox" />
                      <span>沙箱</span>
                    </label>
                  </fieldset>
                  <Button className="primary-button" type="submit">保存策略</Button>
                </form>
                <section className="boundary-list">
                  <h3>能力策略</h3>
                  {selectedAgent.capabilityPolicy.map((policy) => <p key={policy}>{policy}</p>)}
                </section>
              </TabsContent>
              <TabsContent value="instruction">
                <form className="admin-inline-form" aria-label="编辑智能体说明" key={`${selectedAgent.id}-instruction`} onSubmit={updateAgentInstruction}>
                  <label>
                    <span>描述</span>
                    <Input name="description" defaultValue={selectedAgent.description} />
                  </label>
                  <label>
                    <span>智能体说明</span>
                    <Textarea name="instruction" defaultValue={selectedAgent.instruction} required />
                  </label>
                  <Button className="primary-button" type="submit">保存说明</Button>
                </form>
              </TabsContent>
              <TabsContent value="mcp">
                <section className="boundary-list">
                  <h3>MCP 工具授权</h3>
                  {selectedAgent.mcpToolAuthorization.map((tool) => <p key={tool}>{tool}</p>)}
                </section>
              </TabsContent>
            </Tabs>
          </aside>
        ) : null}
      </div>
      {isCreateDraftOpen ? (
        <AdminDialog eyebrow="后端创建" title="创建智能体" onClose={() => setIsCreateDraftOpen(false)}>
          <form className="admin-dialog-form" aria-label="创建智能体" onSubmit={createAgent}>
            <div className="form-grid">
              <label>
                智能体名称
                <Input name="name" placeholder="支持智能体" required />
              </label>
              <label>
                描述
                <Input name="description" placeholder="说明这个智能体的职责边界" />
              </label>
              <label>
                图标标识
                <Input name="icon" placeholder="agent" defaultValue="agent" />
              </label>
              <label>
                过程可见性
                <input type="hidden" name="processVisibility" value={newAgentProcessVisibility} />
                <Select value={newAgentProcessVisibility} onValueChange={(value) => setNewAgentProcessVisibility(value as ApiAgent["process_visibility"])}>
                  <SelectTrigger>
                    <SelectValue placeholder="标准" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="minimal">最小</SelectItem>
                    <SelectItem value="standard">标准</SelectItem>
                    <SelectItem value="verbose">详细</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              <label>
                默认模型
                <input type="hidden" name="defaultModelId" value={newAgentDefaultModelId} />
                <Select value={newAgentDefaultModelId} onValueChange={setNewAgentDefaultModelId}>
                  <SelectTrigger>
                    <SelectValue placeholder="未设置" />
                  </SelectTrigger>
                  <SelectContent>
                    {modelConfigurations.map((configuration) => (
                      <SelectItem key={configuration.id} value={configuration.id}>
                        {configuration.provider} · {configuration.model}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <fieldset className="checkbox-grid form-grid-span">
                <legend>允许模型</legend>
                {modelConfigurations.map((configuration) => (
                  <label className="checkbox-row" key={configuration.id}>
                    <input
                      defaultChecked={configuration.id === newAgentDefaultModelId}
                      name="allowedModelIds"
                      type="checkbox"
                      value={configuration.id}
                    />
                    <span>{configuration.provider} · {configuration.model}</span>
                  </label>
                ))}
              </fieldset>
              <fieldset className="checkbox-grid form-grid-span">
                <legend>能力策略</legend>
                <label className="checkbox-row">
                  <input name="searchEnabled" type="checkbox" />
                  <span>搜索</span>
                </label>
                <label className="checkbox-row">
                  <input name="pageReadEnabled" type="checkbox" />
                  <span>页面读取</span>
                </label>
                <label className="checkbox-row">
                  <input name="sandboxEnabled" type="checkbox" />
                  <span>沙箱</span>
                </label>
              </fieldset>
              <label className="form-grid-span">
                智能体说明
                <Textarea name="instruction" placeholder="输入智能体运行时说明" required />
              </label>
            </div>
            <div className="button-row compact-actions">
              <Button className="primary-button" type="submit">保存智能体</Button>
              <Button className="secondary-button" type="button" onClick={() => setIsCreateDraftOpen(false)}>取消</Button>
            </div>
          </form>
        </AdminDialog>
      ) : null}
    </section>
  );
}

function ModelConfigurationsPanel() {
  const [providerCatalog, setProviderCatalog] = useState<ApiModelProvider[]>([]);
  const [configurations, setConfigurations] = useState<ModelConfigurationRecord[]>([]);
  const [selectedConfigurationId, setSelectedConfigurationId] = useState("");
  const [loadError, setLoadError] = useState("");
  const [saveStatus, setSaveStatus] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateDraftOpen, setIsCreateDraftOpen] = useState(false);
  const [newModelProviderId, setNewModelProviderId] = useState("openai");
  const providerNames = providerCatalog.map((provider) => provider.name);
  const selectedConfiguration =
    configurations.find((configuration) => configuration.id === selectedConfigurationId) ??
    configurations[0] ??
    null;

  useEffect(() => {
    let isCurrent = true;
    setIsLoading(true);
    setLoadError("");

    Promise.all([
      adminFetch<ApiModelProvider[]>("/api/admin/model-providers"),
      adminFetch<ApiModelConfiguration[]>("/api/admin/model-configurations"),
    ])
      .then(([providers, modelConfigurations]) => {
        if (!isCurrent) {
          return;
        }
        const mappedConfigurations = modelConfigurations.map((configuration) =>
          mapModelConfiguration(configuration, providers),
        );
        setProviderCatalog(providers);
        setNewModelProviderId((currentProviderId) => currentProviderId || providers[0]?.id || "openai");
        setConfigurations(mappedConfigurations);
        setSelectedConfigurationId(mappedConfigurations[0]?.id ?? "");
      })
      .catch(() => {
        if (!isCurrent) {
          return;
        }
        setProviderCatalog([]);
        setConfigurations([]);
        setSelectedConfigurationId("");
        setLoadError("无法加载模型配置，请检查管理员权限或后端服务。");
      })
      .finally(() => {
        if (isCurrent) {
          setIsLoading(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  async function createModelConfiguration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const providerId = String(formData.get("providerId") ?? "").trim();
    const modelName = String(formData.get("modelName") ?? "").trim();
    const endpoint = String(formData.get("endpoint") ?? "").trim();
    const apiKey = String(formData.get("apiKey") ?? "").trim();
    if (!providerId || !modelName || !endpoint || !apiKey) {
      setSaveStatus("请填写提供商、基础 URL、模型名称和 API Key。");
      return;
    }

    const temperature = Number.parseFloat(String(formData.get("temperature") ?? "0.3"));
    setLoadError("");
    setSaveStatus("");
    try {
      const created = await adminFetch<ApiModelConfiguration>("/api/admin/model-configurations", {
        method: "POST",
        body: JSON.stringify({
          provider_id: providerId,
          name: modelName,
          model_name: modelName,
          endpoint,
          credential_reference: apiKey,
          default_parameters: {
            temperature: Number.isFinite(temperature) ? temperature : 0.3,
          },
          enabled: true,
        }),
      });
      const mappedConfiguration = mapModelConfiguration(created, providerCatalog);
      setConfigurations((currentConfigurations) => [...currentConfigurations, mappedConfiguration]);
      setSelectedConfigurationId(mappedConfiguration.id);
      setIsCreateDraftOpen(false);
      setSaveStatus("模型配置已创建。");
    } catch {
      setSaveStatus("模型配置创建失败，请检查后端返回或管理员权限。");
    }
  }

  async function updateModelConfiguration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedConfiguration) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    const modelName = String(formData.get("modelName") ?? "").trim();
    const endpoint = String(formData.get("endpoint") ?? "").trim();
    const apiKey = String(formData.get("apiKey") ?? "").trim();
    if (!modelName || !endpoint || !apiKey) {
      setSaveStatus("模型名称、基础 URL 和 API Key 不能为空。");
      return;
    }

    const temperature = Number.parseFloat(String(formData.get("temperature") ?? ""));
    const maxTokens = Number.parseInt(String(formData.get("maxTokens") ?? ""), 10);
    const defaultParameters: Record<string, unknown> = {
      ...selectedConfiguration.defaultParametersValue,
    };
    if (Number.isFinite(temperature)) {
      defaultParameters.temperature = temperature;
    }
    if (Number.isFinite(maxTokens)) {
      defaultParameters.max_tokens = maxTokens;
    } else {
      delete defaultParameters.max_tokens;
    }

    setLoadError("");
    setSaveStatus("");
    try {
      const updated = await adminFetch<ApiModelConfiguration>(
        `/api/admin/model-configurations/${selectedConfiguration.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            model_name: modelName,
            name: modelName,
            endpoint,
            credential_reference: apiKey,
            default_parameters: defaultParameters,
          }),
        },
      );
      const mappedConfiguration = mapModelConfiguration(updated, providerCatalog);
      setConfigurations((currentConfigurations) =>
        currentConfigurations.map((configuration) =>
          configuration.id === mappedConfiguration.id ? mappedConfiguration : configuration,
        ),
      );
      setSelectedConfigurationId(mappedConfiguration.id);
      setSaveStatus("模型配置已保存。");
    } catch {
      setSaveStatus("模型配置保存失败，请检查后端返回或管理员权限。");
    }
  }

  async function setModelConfigurationEnabled(configuration: ModelConfigurationRecord, enabled: boolean) {
    setLoadError("");
    setSaveStatus("");
    try {
      const updated = await adminFetch<ApiModelConfiguration>(
        `/api/admin/model-configurations/${configuration.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ enabled }),
        },
      );
      const mappedConfiguration = mapModelConfiguration(updated, providerCatalog);
      setConfigurations((currentConfigurations) =>
        currentConfigurations.map((currentConfiguration) =>
          currentConfiguration.id === mappedConfiguration.id ? mappedConfiguration : currentConfiguration,
        ),
      );
      setSelectedConfigurationId(mappedConfiguration.id);
      setSaveStatus(enabled ? "模型配置已启用。" : "模型配置已停用。");
    } catch {
      setSaveStatus("模型配置状态更新失败。");
    }
  }

  async function checkModelConfigurationHealth(configuration: ModelConfigurationRecord) {
    setLoadError("");
    setSaveStatus("");
    try {
      const result = await adminFetch<ApiModelConfigurationHealthCheck>(
        `/api/admin/model-configurations/${configuration.id}/health-check`,
        { method: "POST" },
      );
      const mappedConfiguration = mapModelConfiguration(result.configuration, providerCatalog);
      setConfigurations((currentConfigurations) =>
        currentConfigurations.map((currentConfiguration) =>
          currentConfiguration.id === mappedConfiguration.id ? mappedConfiguration : currentConfiguration,
        ),
      );
      setSelectedConfigurationId(mappedConfiguration.id);
      setSaveStatus(result.message);
    } catch {
      setSaveStatus("模型健康检查失败。");
    }
  }

  return (
    <section className="route-panel" aria-label="模型配置">
      <CopilotModelConfigurationsBridge
        configurations={configurations}
        isCreateDraftOpen={isCreateDraftOpen}
        providerCatalog={providerNames}
        selectedConfigurationId={selectedConfiguration?.id ?? null}
        setIsCreateDraftOpen={setIsCreateDraftOpen}
        setSelectedConfigurationId={setSelectedConfigurationId}
      />
      <div className="button-row">
        <Button className="primary-button" type="button" onClick={() => setIsCreateDraftOpen(true)}>
          创建模型配置
        </Button>
      </div>
      {saveStatus ? <p className="inline-note">{saveStatus}</p> : null}
      {isLoading ? <p className="empty-state">正在加载模型配置...</p> : null}
      {loadError ? <p className="empty-state danger-state" role="alert">{loadError}</p> : null}
      <div className="admin-master-detail">
        <div className="route-table-wrap">
          <table className="route-table" aria-label="模型配置列表">
            <thead>
              <tr>
                <th>提供商</th>
                <th>模型</th>
                <th>凭据</th>
                <th>状态</th>
                <th>健康</th>
                <th>默认参数</th>
                <th>更新时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {configurations.map((configuration) => (
                <tr className={configuration.id === selectedConfiguration?.id ? "selected-row" : ""} key={configuration.id}>
                  <td>{configuration.provider}</td>
                  <td>{configuration.model}</td>
                  <td>{credentialStatus(configuration.credentialReference)}</td>
                  <td>{modelStatusLabel(configuration.status)}</td>
                  <td>{configuration.healthLabel}</td>
                  <td>{configuration.defaultParameters}</td>
                  <td>{configuration.lastUpdated}</td>
                  <td>
                    <div className="table-actions">
                      <Button className="secondary-button" type="button" onClick={() => setSelectedConfigurationId(configuration.id)}>
                        详情
                      </Button>
                      <Button className="secondary-button" type="button" onClick={() => setModelConfigurationEnabled(configuration, !configuration.enabled)}>
                        {configuration.enabled ? "停用" : "启用"}
                      </Button>
                      <Button className="secondary-button" type="button" onClick={() => checkModelConfigurationHealth(configuration)}>
                        健康检查
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!isLoading && configurations.length === 0 ? (
            <EmptyStateAction
              title="暂无模型配置"
              description="先创建一个可用模型配置，再把它授权给智能体。"
              onAction={() => setIsCreateDraftOpen(true)}
              actionLabel="创建模型配置"
            />
          ) : null}
        </div>
        {selectedConfiguration ? (
          <aside className="context-panel" aria-label="模型配置详情" role="region">
            <div className="panel-head">
              <div>
                <p className="eyebrow">{selectedConfiguration.provider}</p>
                <h2>{selectedConfiguration.model}</h2>
                <p>{selectedConfiguration.baseUrl}</p>
              </div>
              <Badge variant={accountBadgeVariant(selectedConfiguration.status)}>{modelStatusLabel(selectedConfiguration.status)}</Badge>
            </div>
            <section className="detail-grid compact-detail-grid">
              <InfoTile title="凭据" value={credentialStatus(selectedConfiguration.credentialReference)} icon={LockKeyhole} />
              <InfoTile title="默认参数" value={selectedConfiguration.defaultParameters} icon={Settings2} />
              <InfoTile title="最近检查" value={selectedConfiguration.lastCheckedAt} icon={Activity} />
              <InfoTile title="配置状态" value={modelStatusLabel(selectedConfiguration.status)} icon={ShieldCheck} />
              <InfoTile title="健康状态" value={selectedConfiguration.healthLabel} icon={Gauge} />
            </section>
            <section className="boundary-list">
              <h3>配置风险</h3>
                <p>{selectedConfiguration.risk}</p>
              </section>
            <form className="admin-inline-form" aria-label="编辑模型配置" key={selectedConfiguration.id} onSubmit={updateModelConfiguration}>
              <label>
                <span>模型名称</span>
                <Input name="modelName" defaultValue={selectedConfiguration.model} required />
              </label>
              <label>
                <span>基础 URL</span>
                <Input name="endpoint" defaultValue={selectedConfiguration.baseUrl} required />
              </label>
              <label>
                <span>API Key</span>
                <SecretTextInput name="apiKey" defaultValue={selectedConfiguration.credentialReference} placeholder="sk-..." required />
              </label>
              <div className="form-grid compact-form-grid">
                <label>
                  <span>Temperature</span>
                  <Input name="temperature" defaultValue={String(selectedConfiguration.defaultParametersValue.temperature ?? "")} inputMode="decimal" />
                </label>
                <label>
                  <span>Max tokens</span>
                  <Input name="maxTokens" defaultValue={String(selectedConfiguration.defaultParametersValue.max_tokens ?? selectedConfiguration.defaultParametersValue.max_output_tokens ?? "")} inputMode="numeric" />
                </label>
              </div>
              <div className="button-row compact-actions">
                <Button className="primary-button" type="submit">保存</Button>
                <Button className="secondary-button" type="button" onClick={() => setModelConfigurationEnabled(selectedConfiguration, !selectedConfiguration.enabled)}>
                  {selectedConfiguration.enabled ? "停用" : "启用"}
                </Button>
                <Button className="secondary-button" type="button" onClick={() => checkModelConfigurationHealth(selectedConfiguration)}>
                  健康检查
                </Button>
              </div>
            </form>
          </aside>
        ) : null}
      </div>
      {isCreateDraftOpen ? (
        <AdminDialog eyebrow="后端创建" title="创建模型配置" onClose={() => setIsCreateDraftOpen(false)}>
          <form className="admin-dialog-form" aria-label="创建模型配置" onSubmit={createModelConfiguration}>
            <div className="provider-grid compact-provider-grid" aria-label="模型提供商目录">
              {(providerCatalog.length > 0 ? providerCatalog : [{ id: "openai", name: "OpenAI", endpoint_template: "https://api.openai.com/v1", recommended_models: [] }]).map((provider) => (
                <span className="provider-chip" key={provider.id}>{provider.name}</span>
              ))}
            </div>
            <div className="form-grid">
              <label>
                提供商
                <input type="hidden" name="providerId" value={newModelProviderId} />
                <Select value={newModelProviderId} onValueChange={setNewModelProviderId}>
                  <SelectTrigger>
                    <SelectValue placeholder="OpenAI" />
                  </SelectTrigger>
                  <SelectContent>
                    {(providerCatalog.length > 0 ? providerCatalog : [{ id: "openai", name: "OpenAI", endpoint_template: "https://api.openai.com/v1", recommended_models: [] }]).map((provider) => (
                      <SelectItem key={provider.id} value={provider.id}>
                        {provider.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label>
                基础 URL
                <Input name="endpoint" placeholder="https://provider.example/v1" required />
              </label>
              <label>
                模型名称
                <Input name="modelName" placeholder="model-name" required />
              </label>
              <label>
                API Key
                <SecretTextInput name="apiKey" placeholder="sk-..." required />
              </label>
              <label>
                温度
                <Input name="temperature" defaultValue="0.3" inputMode="decimal" />
              </label>
            </div>
            <div className="button-row compact-actions">
              <Button className="primary-button" type="submit">保存模型配置</Button>
              <Button className="secondary-button" type="button" onClick={() => setIsCreateDraftOpen(false)}>取消</Button>
            </div>
          </form>
        </AdminDialog>
      ) : null}
    </section>
  );
}

function McpServersPanel() {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [tools, setTools] = useState<McpToolDiscovery[]>([]);
  const [agents, setAgents] = useState<AgentLifecycleRecord[]>([]);
  const [selectedServerName, setSelectedServerName] = useState<string | null>(null);
  const [authorizationAgent, setAuthorizationAgent] = useState("Default Agent");
  const [loadError, setLoadError] = useState("");
  const [saveStatus, setSaveStatus] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isConfigurationDraftOpen, setIsConfigurationDraftOpen] = useState(false);
  const [newMcpConnectionType, setNewMcpConnectionType] = useState<ApiMcpServer["connection_type"]>("sse");
  const selectedServer = servers.find((server) => server.name === selectedServerName) ?? null;
  const selectedAuthorizationAgent = agents.find((agent) => agent.name === authorizationAgent) ?? agents[0] ?? null;

  useEffect(() => {
    let isCurrent = true;
    setIsLoading(true);
    setLoadError("");

    Promise.all([
      adminFetch<ApiMcpServer[]>("/api/admin/mcp-servers"),
      adminFetch<ApiAgent[]>("/api/admin/agents"),
    ])
      .then(([serverResult, agentResult]) => {
        if (!isCurrent) {
          return;
        }
        const mappedServers = serverResult.map(mapMcpServer);
        const mappedAgents = agentResult.map(mapAgent);
        setServers(mappedServers);
        setAgents(mappedAgents);
        setSelectedServerName(mappedServers[0]?.name ?? null);
        setAuthorizationAgent(mappedAgents[0]?.name ?? "Default Agent");
      })
      .catch(() => {
        if (!isCurrent) {
          return;
        }
        setServers([]);
        setAgents([]);
        setSelectedServerName(null);
        setLoadError("无法加载 MCP 服务器，请检查管理员权限或后端服务。");
      })
      .finally(() => {
        if (isCurrent) {
          setIsLoading(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedServer) {
      setTools([]);
      return;
    }

    let isCurrent = true;
    adminFetch<ApiMcpTool[]>(`/api/admin/mcp-servers/${selectedServer.id}/tools`)
      .then((result) => {
        if (isCurrent) {
          setTools(result.map(mapMcpTool));
        }
      })
      .catch(() => {
        if (isCurrent) {
          setTools([]);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [selectedServer?.id]);

  function openConfigurationDraft(serverName: string | null) {
    setSelectedServerName(serverName);
    setIsConfigurationDraftOpen(true);
  }

  async function createMcpServer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("name") ?? "").trim();
    const url = String(formData.get("url") ?? "").trim();
    const credentialReference = String(formData.get("credentialReference") ?? "").trim();
    const headerName = String(formData.get("headerName") ?? "Authorization").trim() || "Authorization";
    if (!name || !url) {
      setSaveStatus("请填写 MCP 服务器名称和 URL。");
      return;
    }

    setLoadError("");
    setSaveStatus("");
    try {
      const created = await adminFetch<ApiMcpServer>("/api/admin/mcp-servers", {
        method: "POST",
        body: JSON.stringify({
          name,
          connection_type: String(formData.get("connectionType") ?? "sse"),
          url,
          header_secret_refs: credentialReference ? { [headerName]: credentialReference } : {},
          timeout_seconds: parseAdminInteger(String(formData.get("timeoutSeconds") ?? "30"), 30),
          enabled: true,
        }),
      });
      const mappedServer = mapMcpServer(created);
      setServers((currentServers) => [...currentServers, mappedServer]);
      setSelectedServerName(mappedServer.name);
      setIsConfigurationDraftOpen(false);
      setSaveStatus("MCP 服务器已创建。");
    } catch {
      setSaveStatus("MCP 服务器创建失败，请检查 URL、凭据引用或管理员权限。");
    }
  }

  async function discoverSelectedServerTools(server: McpServer) {
    setLoadError("");
    setSaveStatus("");
    try {
      const updated = await adminFetch<ApiMcpServer>(`/api/admin/mcp-servers/${server.id}/discover`, {
        method: "POST",
      });
      const mappedServer = mapMcpServer(updated);
      setServers((currentServers) =>
        currentServers.map((currentServer) => currentServer.id === mappedServer.id ? mappedServer : currentServer),
      );
      setSelectedServerName(mappedServer.name);
      const discoveredTools = await adminFetch<ApiMcpTool[]>(`/api/admin/mcp-servers/${mappedServer.id}/tools`);
      setTools(discoveredTools.map(mapMcpTool));
      setSaveStatus("工具发现已完成。");
    } catch {
      setSaveStatus("工具发现失败，请检查 MCP 服务器状态或管理员权限。");
    }
  }

  async function saveToolAuthorization() {
    if (!selectedServer || !selectedAuthorizationAgent || tools.length === 0) {
      return;
    }

    setLoadError("");
    setSaveStatus("");
    try {
      await Promise.all(tools.map((tool) =>
        adminFetch(`/api/admin/agents/${selectedAuthorizationAgent.id}/mcp-tool-authorizations`, {
          method: "POST",
          body: JSON.stringify({
            server_id: selectedServer.id,
            tool_name: tool.name,
            enabled: true,
          }),
        }),
      ));
      setSaveStatus("MCP 工具授权已保存。");
    } catch {
      setSaveStatus("MCP 工具授权保存失败，请确认工具已完成发现。");
    }
  }

  return (
    <section className="route-panel" aria-label="MCP 服务器">
      <CopilotMcpServersBridge
        authorizationAgent={authorizationAgent}
        isConfigurationDraftOpen={isConfigurationDraftOpen}
        selectedServerName={selectedServerName}
        servers={servers}
        setAuthorizationAgent={setAuthorizationAgent}
        setIsConfigurationDraftOpen={setIsConfigurationDraftOpen}
        setSelectedServerName={setSelectedServerName}
      />
      <div className="panel-head">
        <div>
          <p className="eyebrow">智能体工具网关</p>
          <h2>远程 MCP 注册表</h2>
          <p>仅支持 SSE 或 Streamable HTTP；stdio MCP 服务器不在当前 MVP 范围内。</p>
        </div>
        <Button className="primary-button" type="button" onClick={() => openConfigurationDraft(null)}>
          创建 MCP 服务器
        </Button>
      </div>
      {isLoading ? <p className="empty-state">正在加载 MCP 服务器...</p> : null}
      {loadError ? <p className="empty-state danger-state" role="alert">{loadError}</p> : null}
      {saveStatus ? <p className="inline-note">{saveStatus}</p> : null}
      <div className="route-table-wrap">
        <table className="route-table" aria-label="MCP 服务器列表">
          <thead>
            <tr>
              <th>名称</th>
              <th>连接类型</th>
              <th>URL</th>
              <th>凭据</th>
              <th>发现状态</th>
              <th>授权对象</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {servers.map((server) => (
              <tr
                className={server.name === selectedServerName ? "selected-row" : ""}
                key={server.name}
              >
                <td>{server.name}</td>
                <td>{server.connectionType}</td>
                <td>{server.url}</td>
                <td>{credentialStatus(server.credentialReference)}</td>
                <td>{discoveryStatusLabel(server.discoveryStatus)}</td>
                <td>{server.authorization}</td>
                <td>
                  <div className="table-actions">
                    <Button className="secondary-button" type="button" onClick={() => setSelectedServerName(server.name)}>
                      详情
                    </Button>
                    <Button className="secondary-button" type="button" onClick={() => discoverSelectedServerTools(server)}>
                      发现工具
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!isLoading && servers.length === 0 ? (
          <EmptyStateAction
            title="暂无 MCP 服务器"
            description="先注册一个远程 SSE 或 Streamable HTTP 服务器，之后才能发现工具和授权智能体。"
            onAction={() => openConfigurationDraft(null)}
            actionLabel="创建 MCP 服务器"
          />
        ) : null}
      </div>
      {servers.length > 0 ? (
        <div className="admin-workbench-grid">
          <section className="sub-panel stack" aria-labelledby="mcp-discovery-title">
            <div>
              <p className="eyebrow">工具发现</p>
              <h3 id="mcp-discovery-title">工具发现结果</h3>
            </div>
            <div className="task-list">
              {tools.map((tool) => (
                <article className="task-row static-task-row" key={tool.name}>
                  <div>
                    <strong>{tool.name}</strong>
                    <p>{tool.description}</p>
                  </div>
                  <span className="audit-chip">{tool.schemaSummary}</span>
                </article>
              ))}
            </div>
            {tools.length === 0 ? (
              <EmptyStateAction
                title="当前服务器暂无已发现工具"
                description="点击当前服务器的发现工具按钮，后端会执行工具发现并返回授权候选。"
                onAction={() => {
                  if (selectedServer) {
                    void discoverSelectedServerTools(selectedServer);
                  }
                }}
                actionLabel="发现工具"
              />
            ) : null}
          </section>
          <section className="sub-panel stack" aria-label="MCP 工具授权">
            <div>
              <p className="eyebrow">授权面板</p>
              <h3>MCP 工具授权</h3>
            </div>
            <label>
              <span>智能体</span>
              <Select value={authorizationAgent} onValueChange={setAuthorizationAgent}>
                <SelectTrigger aria-label="智能体">
                  <SelectValue placeholder="选择智能体" />
                </SelectTrigger>
                <SelectContent>
                  {agents.map((agent) => (
                    <SelectItem key={agent.id} value={agent.name}>{agent.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <div className="card-field-list" aria-label="已授权工具">
              {tools.length > 0 ? tools.map((tool) => (
                <span className="card-field" key={tool.name}>{tool.name}</span>
              )) : <span className="card-field muted-field">暂无可授权工具</span>}
            </div>
            <p>授权只保存工具选择，不暴露 MCP 凭据明文。</p>
            <Button className="secondary-button" type="button" disabled={tools.length === 0 || !selectedAuthorizationAgent} onClick={saveToolAuthorization}>保存授权</Button>
          </section>
        </div>
      ) : null}
      {isConfigurationDraftOpen ? (
        <AdminDialog eyebrow="后端创建" title="创建 MCP 服务器" onClose={() => setIsConfigurationDraftOpen(false)}>
          <form className="admin-dialog-form" aria-label="创建 MCP 服务器" onSubmit={createMcpServer}>
            <div className="form-grid">
              <label>
                <span>名称</span>
                <Input name="name" placeholder="MCP 服务器名称" required />
              </label>
              <label>
                <span>URL</span>
                <Input name="url" placeholder="https://mcp.example/sse" required />
              </label>
              <label>
                <span>连接类型</span>
                <input type="hidden" name="connectionType" value={newMcpConnectionType} />
                <Select value={newMcpConnectionType} onValueChange={(value) => setNewMcpConnectionType(value as ApiMcpServer["connection_type"])}>
                  <SelectTrigger>
                    <SelectValue placeholder="SSE" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sse">SSE</SelectItem>
                    <SelectItem value="streamable_http">Streamable HTTP</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              <label>
                <span>凭据 Header</span>
                <Input name="headerName" defaultValue="Authorization" />
              </label>
              <label>
                <span>凭据引用</span>
                <Input name="credentialReference" placeholder="secret/mcp-server" />
              </label>
              <label>
                <span>超时</span>
                <Input name="timeoutSeconds" placeholder="30s" defaultValue="30" inputMode="numeric" />
              </label>
            </div>
            <div className="button-row compact-actions">
              <Button className="primary-button" type="submit">保存 MCP 服务器</Button>
              <Button className="secondary-button" type="button" onClick={() => setIsConfigurationDraftOpen(false)}>取消</Button>
            </div>
          </form>
        </AdminDialog>
      ) : null}
    </section>
  );
}

function SearchProviderPanel() {
  const [provider, setProvider] = useState<ApiSearchProvider | null>(null);
  const [form, setForm] = useState({
    endpoint: "",
    maxResults: "5 个候选结果",
    name: "",
    timeout: "",
  });
  const [loadError, setLoadError] = useState("");
  const [saveStatus, setSaveStatus] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isCurrent = true;
    setIsLoading(true);
    setLoadError("");

    adminFetch<ApiSearchProvider[]>("/api/admin/search-provider-configurations")
      .then((result) => {
        if (isCurrent) {
          const nextProvider = result[0] ?? null;
          setProvider(nextProvider);
          if (nextProvider) {
            setForm({
              endpoint: nextProvider.endpoint,
              maxResults: `${nextProvider.max_results} 个候选结果`,
              name: nextProvider.name,
              timeout: `${nextProvider.timeout_seconds}s`,
            });
          }
        }
      })
      .catch(() => {
        if (isCurrent) {
          setProvider(null);
          setLoadError("无法加载搜索提供方配置，请检查管理员权限或后端服务。");
        }
      })
      .finally(() => {
        if (isCurrent) {
          setIsLoading(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  async function saveProviderSettings() {
    if (!provider) {
      return;
    }
    setSaveStatus("");
    try {
      const timeoutSeconds = parseAdminInteger(form.timeout, provider.timeout_seconds);
      const maxResults = parseAdminInteger(form.maxResults, provider.max_results);
      const updated = await adminFetch<ApiSearchProvider>(
        `/api/admin/search-provider-configurations/${provider.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            endpoint: form.endpoint,
            enabled: provider.enabled,
            max_results: maxResults,
            name: form.name,
            timeout_seconds: timeoutSeconds,
          }),
        },
      );
      setProvider(updated);
      setForm({
        endpoint: updated.endpoint,
        maxResults: `${updated.max_results} 个候选结果`,
        name: updated.name,
        timeout: `${updated.timeout_seconds}s`,
      });
      setSaveStatus("搜索提供方配置已保存。");
    } catch {
      setSaveStatus("搜索提供方配置保存失败。");
    }
  }

  return (
    <section className="route-panel" aria-label="搜索提供方配置">
      <div className="panel-head">
        <div>
          <p className="eyebrow">能力配置</p>
          <h2>{provider?.name ?? "搜索提供方"}</h2>
          <p>搜索能力负责查找候选 URL 和摘要；页面读取能力只读取已知 URL。</p>
        </div>
      </div>
      {isLoading ? <p className="empty-state">正在加载搜索提供方...</p> : null}
      {loadError ? <p className="empty-state danger-state" role="alert">{loadError}</p> : null}
      <section className="detail-grid" aria-label="搜索提供方状态">
        <InfoTile title="提供方" value={provider?.enabled ? "已启用" : "已停用"} tone={provider?.enabled ? "success" : "warning"} icon={Search} />
        <InfoTile title="凭据" value={credentialStatus(provider?.credential_reference)} icon={LockKeyhole} />
        <InfoTile title="结果上限" value={provider ? `${provider.max_results} 个候选结果` : "未配置"} icon={FileSearch} />
        <InfoTile title="超时" value={provider ? `${provider.timeout_seconds}s` : "未配置"} icon={ShieldCheck} />
      </section>
      <div className="admin-workbench-grid">
        <section className="sub-panel stack" aria-label="搜索提供方编辑面板">
          <div>
            <p className="eyebrow">编辑面板</p>
            <h3>运行时配置</h3>
          </div>
          <label>
            <span>端点</span>
            <Input
              value={form.endpoint}
              onChange={(event) => setForm((current) => ({ ...current, endpoint: event.target.value }))}
            />
          </label>
          <div className="form-grid">
            <label>
              <span>提供方名称</span>
              <Input
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              />
            </label>
            <label>
              <span>超时</span>
              <Input
                value={form.timeout}
                onChange={(event) => setForm((current) => ({ ...current, timeout: event.target.value }))}
              />
            </label>
          </div>
          <label>
            <span>结果上限</span>
            <Select
              value={form.maxResults}
              onValueChange={(value) => setForm((current) => ({ ...current, maxResults: value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="未配置" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5 个候选结果">5 个候选结果</SelectItem>
                <SelectItem value="8 个候选结果">8 个候选结果</SelectItem>
                <SelectItem value="12 个候选结果">12 个候选结果</SelectItem>
                <SelectItem value="未配置">未配置</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <p className="inline-note">此设置不会改变页面读取的内容长度限制。</p>
          <Button className="primary-button" type="button" disabled={!provider} onClick={saveProviderSettings}>保存配置</Button>
          {saveStatus ? <p className="inline-note">{saveStatus}</p> : null}
        </section>
        <section className="sub-panel stack" aria-label="能力边界">
          <div>
            <p className="eyebrow">边界</p>
            <h3>搜索不是页面读取</h3>
          </div>
          <div className="boundary-list">
            <p>搜索：候选 URL、标题和摘要。</p>
            <p>页面读取：从已知 URL 提取全文。</p>
            <p>不要把任一能力合并进浏览器模式。</p>
          </div>
          <a className="secondary-button" href="/admin/page-read-provider">打开页面读取提供方</a>
        </section>
      </div>
    </section>
  );
}

function PageReadProviderPanel() {
  const [provider, setProvider] = useState<ApiPageReadProvider | null>(null);
  const [form, setForm] = useState({
    allowedDomains: "",
    endpoint: "",
    maxContentLength: "",
    name: "",
    timeout: "",
  });
  const [loadError, setLoadError] = useState("");
  const [saveStatus, setSaveStatus] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isCurrent = true;
    setIsLoading(true);
    setLoadError("");

    adminFetch<ApiPageReadProvider[]>("/api/admin/page-read-provider-configurations")
      .then((result) => {
        if (isCurrent) {
          const nextProvider = result[0] ?? null;
          setProvider(nextProvider);
          if (nextProvider) {
            setForm({
              allowedDomains: nextProvider.allowed_domains.join("\n"),
              endpoint: nextProvider.endpoint,
              maxContentLength: `${nextProvider.max_content_length} 字符`,
              name: nextProvider.name,
              timeout: `${nextProvider.timeout_seconds}s`,
            });
          }
        }
      })
      .catch(() => {
        if (isCurrent) {
          setProvider(null);
          setLoadError("无法加载页面读取提供方配置，请检查管理员权限或后端服务。");
        }
      })
      .finally(() => {
        if (isCurrent) {
          setIsLoading(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  async function saveProviderSettings() {
    if (!provider) {
      return;
    }
    setSaveStatus("");
    try {
      const allowedDomains = form.allowedDomains
        .split(/\r?\n/)
        .map((domain) => domain.trim())
        .filter(Boolean);
      const maxContentLength = parseAdminInteger(form.maxContentLength, provider.max_content_length);
      const timeoutSeconds = parseAdminInteger(form.timeout, provider.timeout_seconds);
      const updated = await adminFetch<ApiPageReadProvider>(
        `/api/admin/page-read-provider-configurations/${provider.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            allowed_domains: allowedDomains,
            endpoint: form.endpoint,
            enabled: provider.enabled,
            max_content_length: maxContentLength,
            name: form.name,
            timeout_seconds: timeoutSeconds,
          }),
        },
      );
      setProvider(updated);
      setForm({
        allowedDomains: updated.allowed_domains.join("\n"),
        endpoint: updated.endpoint,
        maxContentLength: `${updated.max_content_length} 字符`,
        name: updated.name,
        timeout: `${updated.timeout_seconds}s`,
      });
      setSaveStatus("页面读取提供方配置已保存。");
    } catch {
      setSaveStatus("页面读取提供方配置保存失败。");
    }
  }

  const allowedDomains = form.allowedDomains
    .split(/\r?\n/)
    .map((domain) => domain.trim())
    .filter(Boolean);

  return (
    <section className="route-panel" aria-label="页面读取提供方配置">
      <div className="panel-head">
        <div>
          <p className="eyebrow">能力配置</p>
          <h2>{provider?.name ?? "页面读取提供方"}</h2>
          <p>页面读取能力读取已知 URL 的全文；搜索能力只查找候选 URL 和摘要。</p>
        </div>
      </div>
      {isLoading ? <p className="empty-state">正在加载页面读取提供方...</p> : null}
      {loadError ? <p className="empty-state danger-state" role="alert">{loadError}</p> : null}
      <section className="detail-grid" aria-label="页面读取提供方状态">
        <InfoTile title="提供方" value={provider?.enabled ? "已启用" : "已停用"} tone={provider?.enabled ? "success" : "warning"} icon={FileText} />
        <InfoTile title="凭据" value={credentialStatus(provider?.credential_reference)} icon={LockKeyhole} />
        <InfoTile title="内容上限" value={provider ? `${provider.max_content_length} 字符` : "未配置"} icon={FileSearch} />
        <InfoTile title="允许域名数" value={provider ? String(allowedDomains.length) : "未配置"} icon={ShieldCheck} />
      </section>
      <div className="admin-workbench-grid">
        <section className="sub-panel stack" aria-label="域名策略编辑器">
          <div>
            <p className="eyebrow">域名策略</p>
            <h3>已知 URL 访问</h3>
          </div>
          <p>在页面读取抽取可读文本前，对已知 URL 执行允许或拒绝策略。</p>
          <div className="domain-chip-list" aria-label="当前允许域名">
            {allowedDomains.length > 0 ? (
              allowedDomains.map((domain) => <span className="domain-chip" key={domain}>{domain}</span>)
            ) : (
              <span className="domain-chip muted-field">未设置允许域名</span>
            )}
          </div>
          <label>
            <span>允许域名</span>
            <Textarea
              value={form.allowedDomains}
              onChange={(event) => setForm((current) => ({ ...current, allowedDomains: event.target.value }))}
              placeholder="每行一个域名，例如 docs.example.com"
            />
          </label>
          <Button className="primary-button" type="button" disabled={!provider} onClick={saveProviderSettings}>保存策略</Button>
          {saveStatus ? <p className="inline-note">{saveStatus}</p> : null}
        </section>
        <section className="sub-panel stack" aria-label="页面读取运行设置">
          <div>
            <p className="eyebrow">运行设置</p>
            <h3>抽取限制</h3>
          </div>
          <div className="form-grid">
            <label>
              <span>提供方名称</span>
              <Input
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              />
            </label>
            <label>
              <span>端点</span>
              <Input
                value={form.endpoint}
                onChange={(event) => setForm((current) => ({ ...current, endpoint: event.target.value }))}
              />
            </label>
            <label>
              <span>超时</span>
              <Input
                value={form.timeout}
                onChange={(event) => setForm((current) => ({ ...current, timeout: event.target.value }))}
              />
            </label>
            <label>
              <span>内容长度</span>
              <Input
                value={form.maxContentLength}
                onChange={(event) => setForm((current) => ({ ...current, maxContentLength: event.target.value }))}
              />
            </label>
          </div>
          <p className="inline-note">这些设置不会改变搜索提供方的结果上限。</p>
          <a className="secondary-button" href="/admin/search-provider">打开搜索提供方</a>
        </section>
      </div>
    </section>
  );
}

function SandboxStatusPanel() {
  const [agents, setAgents] = useState<AgentLifecycleRecord[]>([]);
  const [artifactCount, setArtifactCount] = useState(0);
  const [loadError, setLoadError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const sandboxEnabledCount = agents.filter((agent) =>
    agent.capabilityPolicy.includes("沙箱能力已启用"),
  ).length;

  useEffect(() => {
    let isCurrent = true;
    setIsLoading(true);
    setLoadError("");

    Promise.all([
      adminFetch<ApiAgent[]>("/api/admin/agents"),
      adminFetch<ApiRunAuditList>("/api/admin/run-audit"),
    ])
      .then(([agentResult, auditResult]) => {
        if (!isCurrent) {
          return;
        }
        setAgents(agentResult.map(mapAgent));
        setArtifactCount(auditResult.storage.artifact_count);
      })
      .catch(() => {
        if (!isCurrent) {
          return;
        }
        setAgents([]);
        setArtifactCount(0);
        setLoadError("无法加载沙箱能力状态，请检查管理员权限或后端服务。");
      })
      .finally(() => {
        if (isCurrent) {
          setIsLoading(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  return (
    <section className="route-panel" aria-label="沙箱状态">
      <div className="panel-head">
        <div>
          <p className="eyebrow">沙箱能力</p>
          <h2>沙箱运行时与策略</h2>
          <p>使用 OpenAI Agents SDK 沙箱支持；此页面不表示生产主机提供 Docker 沙箱。</p>
        </div>
        <a className="secondary-button" href="/admin/run-audit">打开运行审计</a>
      </div>
      {isLoading ? <p className="empty-state">正在加载沙箱能力状态...</p> : null}
      {loadError ? <p className="empty-state danger-state" role="alert">{loadError}</p> : null}
      <section className="detail-grid" aria-label="沙箱运行时状态">
        <InfoTile title="授权智能体" value={`${sandboxEnabledCount} 个`} tone={sandboxEnabledCount > 0 ? "success" : "pending"} icon={TerminalSquare} />
        <InfoTile title="策略来源" value="智能体能力策略" icon={ShieldCheck} />
        <InfoTile title="产物存储" value={`${artifactCount} 个产物`} tone={artifactCount > 0 ? "success" : undefined} icon={Database} />
        <InfoTile title="近期调用" value="见运行审计" icon={Activity} />
      </section>
      <div className="route-table-wrap">
        <table className="route-table" aria-label="智能体沙箱能力">
          <thead>
            <tr>
              <th>智能体</th>
              <th>能力状态</th>
              <th>产物捕获</th>
              <th>策略</th>
            </tr>
          </thead>
          <tbody>
            {agents.map((agent) => {
              const enabled = agent.capabilityPolicy.includes("沙箱能力已启用");
              return (
                <tr key={agent.id}>
                  <td>{agent.name}</td>
                  <td>{enabled ? "已启用" : "未启用"}</td>
                  <td>{enabled ? "由运行审计记录产物" : "不捕获沙箱产物"}</td>
                  <td>{agent.processVisibility}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!isLoading && agents.length === 0 ? (
          <p className="empty-state">暂无智能体能力策略。</p>
        ) : null}
      </div>
      <div className="admin-workbench-grid">
        <section className="sub-panel stack" aria-label="近期沙箱工具调用">
          <div>
            <p className="eyebrow">工具调用</p>
            <h3>近期沙箱工具调用</h3>
          </div>
          <div className="task-list">
            <article className="task-row">
              <div>
                <strong>暂无独立沙箱调用列表</strong>
                <p>请在运行审计中查看具体工具调用、产物和失败详情。</p>
              </div>
              <span className="audit-chip ready">审计入口</span>
            </article>
          </div>
        </section>
        <section className="sub-panel stack" aria-label="产物捕获摘要">
          <div>
            <p className="eyebrow">产物</p>
            <h3>产物捕获摘要</h3>
          </div>
          <p>已捕获 {artifactCount} 个产物</p>
          <p>产物数量来自运行审计存储汇总。</p>
          <p className="inline-note">捕获文件以产物引用存储，不以内联消息正文存储。</p>
        </section>
      </div>
    </section>
  );
}

function FullTracePanel() {
  const [traceRecord, setTraceRecord] = useState<FullTraceRecord | null>(null);
  const [loadError, setLoadError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isRawPayloadOpen, setIsRawPayloadOpen] = useState(false);

  useEffect(() => {
    let isCurrent = true;
    setIsLoading(true);
    setLoadError("");

    adminFetch<ApiRunAuditList>("/api/admin/run-audit")
      .then(async (list) => {
        const traceableRun = list.runs.find((run) => run.full_trace_available);
        if (!traceableRun) {
          return null;
        }
        const trace = await adminFetch<ApiFullTrace>(`/api/admin/run-audit/${traceableRun.id}/full-trace`);
        return mapFullTrace(mapRunSummary(traceableRun), trace);
      })
      .then((record) => {
        if (isCurrent) {
          setTraceRecord(record);
        }
      })
      .catch(() => {
        if (isCurrent) {
          setTraceRecord(null);
          setLoadError("无法加载完整追踪详情，请检查管理员权限、保留策略或后端服务。");
        }
      })
      .finally(() => {
        if (isCurrent) {
          setIsLoading(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  return (
    <section className="route-panel" aria-label="完整追踪详情">
      {traceRecord ? (
        <CopilotFullTraceBridge
          isRawPayloadOpen={isRawPayloadOpen}
          runId={traceRecord.runId}
          setIsRawPayloadOpen={setIsRawPayloadOpen}
          status={traceRecord.status}
          traceId={traceRecord.traceId}
        />
      ) : null}
      <div className="panel-head">
        <div>
          <p className="eyebrow">管理员诊断视图</p>
          <h2>完整追踪详情</h2>
          <p>仅管理员可见的诊断记录</p>
        </div>
        <a className="secondary-button" href="/admin/run-audit">返回运行审计</a>
      </div>
      {isLoading ? <p className="empty-state">正在加载完整追踪...</p> : null}
      {loadError ? <p className="empty-state danger-state" role="alert">{loadError}</p> : null}
      {!isLoading && !traceRecord && !loadError ? (
        <EmptyStateAction
          title="请先从运行审计选择一次运行"
          description="完整追踪是单次运行的诊断详情，不再作为独立一级入口展示。"
          href="/admin/run-audit"
          actionLabel="返回运行审计"
        />
      ) : null}
      {traceRecord ? (
        <>
          <section className="detail-grid" aria-label="追踪头信息">
            <InfoTile title="运行" value={traceRecord.runId} icon={Activity} />
            <InfoTile title="状态" value={runStatusLabel(traceRecord.status)} tone="warning" icon={ShieldCheck} />
            <InfoTile title="智能体" value={traceRecord.agent} icon={Bot} />
            <InfoTile title="模型" value={traceRecord.model} icon={Settings2} />
            <InfoTile title="用户" value={traceRecord.user} icon={UserCheck} />
            <InfoTile title="时间" value={traceRecord.timestamp} icon={ScrollText} />
          </section>
          <div className="route-table-wrap">
            <table className="route-table" aria-label="事件时间线">
              <thead>
                <tr>
                  <th>时间</th>
                  <th>事件</th>
                  <th>详情</th>
                </tr>
              </thead>
              <tbody>
                {traceRecord.events.map((event) => (
                  <tr key={event.join(":")}>
                    {event.map((cell) => <td key={cell}>{cell}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <details
            aria-label="原始诊断载荷"
            className="state-panel"
            open={isRawPayloadOpen}
            onToggle={(event) => setIsRawPayloadOpen(event.currentTarget.open)}
          >
            <summary>原始诊断载荷</summary>
            <pre>{traceRecord.rawPayload}</pre>
          </details>
          <section className="boundary-list" aria-label="产物引用">
            <h3>产物引用</h3>
            {traceRecord.artifacts.map((artifact) => <p key={artifact}>{artifact}</p>)}
          </section>
        </>
      ) : null}
    </section>
  );
}

function RunAuditPanel() {
  const [runs, setRuns] = useState<AgentRunAuditRecord[]>([]);
  const [retentionDays, setRetentionDays] = useState(90);
  const [storageArtifactCount, setStorageArtifactCount] = useState(0);
  const [loadError, setLoadError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<RunAuditStatusFilter>("all");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const filteredRuns = useMemo(
    () => {
      const normalizedQuery = query.trim().toLowerCase();
      const statusMatchedRuns = statusFilter === "all"
        ? runs
        : runs.filter((run) => run.status === statusFilter);
      if (!normalizedQuery) {
        return statusMatchedRuns;
      }
      return statusMatchedRuns.filter((run) =>
        [
          run.id,
          run.conversation,
          run.user,
          run.agent,
          run.model,
        ].some((value) => value.toLowerCase().includes(normalizedQuery)),
      );
    },
    [query, runs, statusFilter],
  );
  const selectedRun =
    filteredRuns.find((run) => run.id === selectedRunId) ?? filteredRuns[0] ?? null;

  useEffect(() => {
    let isCurrent = true;
    setIsLoading(true);
    setLoadError("");

    adminFetch<ApiRunAuditList>("/api/admin/run-audit")
      .then((result) => {
        if (!isCurrent) {
          return;
        }
        const mappedRuns = result.runs.map(mapRunSummary);
        setRuns(mappedRuns);
        setRetentionDays(result.retention.full_trace_retention_days);
        setStorageArtifactCount(result.storage.artifact_count);
        setSelectedRunId(mappedRuns[0]?.id ?? null);
      })
      .catch(() => {
        if (!isCurrent) {
          return;
        }
        setRuns([]);
        setSelectedRunId(null);
        setLoadError("无法加载运行审计列表，请检查管理员权限或后端服务。");
      })
      .finally(() => {
        if (isCurrent) {
          setIsLoading(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedRunId) {
      return;
    }

    let isCurrent = true;
    adminFetch<ApiRunAuditDetail>(`/api/admin/run-audit/${selectedRunId}`)
      .then((detail) => {
        if (!isCurrent) {
          return;
        }
        setRuns((currentRuns) =>
          currentRuns.map((run) =>
            run.id === selectedRunId ? mergeRunDetail(run, detail) : run,
          ),
        );
      })
      .catch(() => {
        if (isCurrent) {
          setLoadError("无法加载运行详情，请稍后重试。");
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [selectedRunId]);

  function switchStatusFilter(status: RunAuditStatusFilter) {
    setStatusFilter(status);
    setSelectedRunId(
      status === "all"
        ? runs[0]?.id ?? null
        : runs.find((run) => run.status === status)?.id ?? null,
    );
  }

  return (
    <section className="route-panel" aria-label="运行审计">
      <CopilotRunAuditBridge
        runs={runs}
        selectedRunId={selectedRun?.id ?? null}
        setSelectedRunId={setSelectedRunId}
        setStatusFilter={setStatusFilter}
        statusFilter={statusFilter}
      />
      <h2>运行审计</h2>
      <div className="audit-overview" aria-label="运行审计概览">
        <span>完整追踪保留 {retentionDays} 天</span>
        <span>存储：{storageArtifactCount} 个产物</span>
        <span>近期失败运行：{runs.filter((run) => run.status === "failed").length}</span>
      </div>
      {isLoading ? <p className="empty-state">正在加载运行审计...</p> : null}
      {loadError ? <p className="empty-state danger-state" role="alert">{loadError}</p> : null}
      <section className="state-panel" aria-label="运行审计筛选">
        <div className="audit-filter-grid">
          <label htmlFor="run-audit-status-filter">
            <span>状态</span>
            <Select
              value={statusFilter}
              onValueChange={(value) => switchStatusFilter(value as RunAuditStatusFilter)}
            >
              <SelectTrigger id="run-audit-status-filter">
                <SelectValue placeholder="全部" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部</SelectItem>
                <SelectItem value="running">运行中</SelectItem>
                <SelectItem value="completed">已完成</SelectItem>
                <SelectItem value="failed">已失败</SelectItem>
                <SelectItem value="cancelled">已取消</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label htmlFor="run-audit-query">
            <span>运行 / 用户 / 智能体</span>
            <Input
              id="run-audit-query"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="输入运行 ID、用户或智能体"
            />
          </label>
        </div>
      </section>
      <div className="admin-master-detail audit-master-detail">
        <div className="route-table-wrap">
          <table className="route-table" aria-label="智能体运行列表">
            <thead>
              <tr>
                <th>运行 ID</th>
                <th>会话</th>
                <th>用户</th>
                <th>智能体</th>
                <th>模型</th>
                <th>状态</th>
                <th>工具数</th>
                <th>产物数</th>
                <th>操作</th>
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
                  <td>{runStatusLabel(run.status)}</td>
                  <td>{run.toolCount}</td>
                  <td>{run.artifactCount}</td>
                  <td>
                    <Button className="secondary-button" type="button" onClick={() => setSelectedRunId(run.id)}>
                      详情
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredRuns.length === 0 ? (
            <EmptyStateAction
              title="没有符合筛选条件的智能体运行"
              description="清空检索条件，或完成一次智能体运行后再回来查看审计记录。"
              onAction={() => {
                setQuery("");
                switchStatusFilter("all");
              }}
              actionLabel="查看全部"
            />
          ) : null}
        </div>
        {selectedRun ? (
        <aside className="context-panel" aria-label="智能体运行详情" role="region">
          <div>
            <p className="eyebrow">智能体运行</p>
            <h2>{selectedRun.id}</h2>
            <p>{selectedRun.conversation} / {selectedRun.user} / {selectedRun.agent}</p>
          </div>
          <div className="detail-grid">
            <InfoTile title="状态" value={runStatusLabel(selectedRun.status)} icon={Activity} />
            <InfoTile title="模型" value={selectedRun.model} icon={Settings2} />
            <InfoTile title="开始时间" value={selectedRun.started} icon={ScrollText} />
            <InfoTile title="耗时" value={selectedRun.duration} icon={Gauge} />
          </div>
          <section className="boundary-list">
            <h3>状态时间线</h3>
            {selectedRun.statusTimeline.map((item) => <p key={item}>{item}</p>)}
          </section>
          <section className="boundary-list">
            <h3>会话消息引用</h3>
            {selectedRun.messageReferences.map((item) => <p key={item}>{item}</p>)}
          </section>
          <section className="boundary-list">
            <h3>过程摘要</h3>
            <p>{selectedRun.processSummary}</p>
          </section>
          <section className="boundary-list">
            <h3>工具调用序列</h3>
            {selectedRun.toolCallSequence.map((item) => <p key={item}>{item}</p>)}
          </section>
          <section className="boundary-list">
            <h3>运行能力快照</h3>
            {selectedRun.capabilitySnapshot.map((item) => <p key={item}>{item}</p>)}
          </section>
          <section className="boundary-list">
            <h3>产物</h3>
            {selectedRun.artifacts.map((item) => <p key={item}>{item}</p>)}
          </section>
          <section className="boundary-list">
            <h3>失败/取消详情</h3>
            <p>{selectedRun.failureDetail}</p>
          </section>
          <section className="boundary-list">
            <h3>完整追踪入口</h3>
            <p>仅管理员可见的诊断记录按 90 天策略保留。</p>
            <a className="secondary-button" href="/admin/full-trace">打开完整追踪详情</a>
          </section>
        </aside>
        ) : null}
      </div>
    </section>
  );
}

function InfoTile({
  icon: Icon,
  title,
  value,
  tone,
}: {
  icon?: ElementType;
  title: string;
  value: string;
  tone?: string;
}) {
  return (
    <Card className="info-tile">
      <CardContent className="flex flex-col gap-2 p-4">
        <div className="info-tile-top">
          <Badge variant={toneToBadgeVariant(tone)}>{title}</Badge>
          {Icon ? <Icon aria-hidden="true" strokeWidth={1.8} /> : null}
        </div>
        <strong>{value}</strong>
      </CardContent>
    </Card>
  );
}

function taskBadgeVariant(status: string) {
  switch (status) {
    case "pending":
      return "secondary";
    case "ready":
      return "outline";
    case "warning":
      return "destructive";
    default:
      return "secondary";
  }
}

function taskStatusLabel(status: string) {
  switch (status) {
    case "pending":
      return "待处理";
    case "ready":
      return "就绪";
    case "warning":
      return "需复核";
    default:
      return status;
  }
}

function lifecycleStatusLabel(status: AgentLifecycleStatus) {
  switch (status) {
    case "enabled":
      return "已启用";
    case "disabled":
      return "已停用";
    case "retired":
      return "已归档";
  }
}

function modelStatusLabel(status: ModelConfigurationStatus) {
  switch (status) {
    case "enabled":
      return "已启用";
    case "disabled":
      return "已停用";
  }
}

function runStatusLabel(status: RunAuditStatus | RunAuditStatusFilter) {
  switch (status) {
    case "all":
      return "全部";
    case "running":
      return "运行中";
    case "completed":
      return "已完成";
    case "failed":
      return "已失败";
    case "cancelled":
      return "已取消";
  }
}

function discoveryStatusLabel(status: McpServer["discoveryStatus"]) {
  switch (status) {
    case "Discovered":
      return "已发现";
    case "Pending discovery":
      return "待发现";
  }
}

function accountBadgeVariant(status: string) {
  switch (status) {
    case "enabled":
      return "default";
    case "pending":
      return "secondary";
    case "rejected":
    case "disabled":
    case "failed":
      return "destructive";
    case "running":
      return "outline";
    case "draft":
      return "outline";
    case "success":
      return "default";
    default:
      return "secondary";
  }
}

function toneToBadgeVariant(tone?: string) {
  switch (tone) {
    case "success":
      return "default";
    case "warning":
      return "destructive";
    case "pending":
      return "secondary";
    default:
      return "outline";
  }
}
