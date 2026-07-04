import { FormEvent, type ElementType, useEffect, useMemo, useRef, useState } from "react";

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
} from "../shared/copilotkit-adapter";
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

const authTokenStorageKey = "minimalist-agent:auth-token";

type ApiLocalAccount = {
  id: number;
  username: string;
  email: string | null;
  role: "admin" | "user";
  status: LocalAccountStatus;
};

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
  title: string;
  meta: string;
  status: "pending" | "ready" | "warning";
};

async function adminFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = window.localStorage.getItem(authTokenStorageKey);
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
    throw new Error(`管理员接口请求失败：${response.status}`);
  }
  return await response.json() as T;
}

function parseAdminInteger(value: string, fallback: number): number {
  const parsed = Number.parseInt(value.replace(/[^\d]/g, ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function mapLocalAccount(account: ApiLocalAccount): LocalAccount {
  return {
    id: account.id,
    username: account.username,
    email: account.email ?? "未填写",
    role: account.role,
    status: account.status,
    createdAt: "后端未记录",
    lastAction: accountStatusAction(account.status),
    riskNote: account.role === "admin"
      ? "管理员账号。当前页面不会禁用管理员账号。"
      : "后端暂未记录风险备注或登录失败历史。",
    history: [accountStatusAction(account.status), "后端暂未记录审批时间线"],
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
    defaultModel: agent.default_model_configuration_id ? `模型配置 #${agent.default_model_configuration_id}` : "未设置",
    allowedModels: allowedModels.length > 0 ? allowedModels : ["未设置"],
    capabilitySummary: capabilitySummary(agent.capability_policy),
    capabilityPolicy: capabilityPolicyLines(agent.capability_policy),
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
    provider: providerName,
    model: configuration.model_name,
    credentialReference: configuration.credential_reference,
    status: configuration.enabled ? "enabled" : "disabled",
    baseUrl: configuration.endpoint,
    defaultParameters: parameterText || "未设置",
    lastUpdated: "后端未记录",
    risk: configuration.credential_reference
      ? "凭据以引用方式保存，页面不会暴露密钥明文。"
      : "凭据引用缺失，请补齐后再启用。",
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
  onSubmit,
}: {
  error?: string;
  mode: "login" | "register";
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
            <a
              className="auth-switch"
              href={isLogin ? "/register" : "/login"}
              aria-label={isLogin ? "切换到申请" : "切换到登录"}
            >
              {isLogin ? "申请" : "登录"}
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
    window.dispatchEvent(new Event("minimalist-agent:auth-changed"));
    window.history.pushState({}, "", "/app/conversations");
    window.dispatchEvent(new Event("minimalist-agent:navigate"));
  }

  return <AuthEntryPage error={loginError} mode="login" onSubmit={login} />;
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

  return <AuthEntryPage mode="register" onSubmit={requestAccess} />;
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
  return (
    <main className="route-page" aria-labelledby="account-settings-title">
      <section className="route-panel">
        <p className="eyebrow">本地账号</p>
        <h1 id="account-settings-title">账号设置</h1>
        <div className="detail-grid">
          <InfoTile title="用户名" value="oil" />
          <InfoTile title="邮箱" value="oil@example.com" />
          <InfoTile title="角色" value="管理员" />
          <InfoTile title="状态" value="已启用" />
        </div>
        <Button className="danger-button" type="button">退出登录</Button>
      </section>
    </main>
  );
}

export function AdminPage({ route }: { route: AppRoute }) {
  const active = adminModules.find((module) => module.route === route) ?? adminModules[0];
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
            <p className="eyebrow">生产管理后台</p>
            <h1 id="admin-page-title">{active.title}</h1>
            <p>{adminIntro(route)}</p>
          </div>
          <a className="secondary-button" href="/app/conversations">返回工作区</a>
        </header>
        {adminContent(route)}
      </div>
    </main>
  );
}

function adminIntro(route: AppRoute) {
  switch (route) {
    case "admin-overview":
      return "聚合待处理事项、运行风险和配置边界，不替代业务分析看板。";
    case "account-approval":
      return "在账号进入工作区前完成本地账号的批准、拒绝或禁用。";
    case "agent-lifecycle":
      return "管理智能体说明、模型策略、过程可见性和能力授权边界。";
    case "model-configurations":
      return "维护模型提供商、凭据引用、端点和默认参数。";
    case "mcp-servers":
      return "登记远程 MCP 服务器、查看工具发现结果，并按智能体授权工具。";
    case "search-provider":
      return "配置搜索能力背后的提供方，并与页面读取能力保持边界清晰。";
    case "page-read-provider":
      return "配置已知 URL 的页面读取、抽取限制和域名策略。";
    case "sandbox-status":
      return "查看沙箱能力状态、智能体授权和近期沙箱调用。";
    case "run-audit":
      return "审计智能体运行状态、工具调用、产物、失败详情和保留策略。";
    case "full-trace":
      return "查看单次智能体运行的管理员诊断详情。";
    default:
      return "";
  }
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
      title: overview && overview.pendingAccounts > 0
        ? `审批 ${overview.pendingAccounts} 个待审批账号`
        : "没有待审批账号",
      meta: "账号审批",
      status: overview && overview.pendingAccounts > 0 ? "pending" : "ready",
    },
    {
      title: providerReady ? "搜索与页面读取提供方可用" : "检查能力提供方配置",
      meta: "搜索提供方 / 页面读取提供方",
      status: providerReady ? "ready" : "warning",
    },
    {
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
  return (
    <Card className="route-panel">
      <CardHeader>
        <CardDescription>治理待办</CardDescription>
        <CardTitle>需要处理</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {tasks.map((task) => (
          <TaskRow key={`${task.meta}-${task.title}`} title={task.title} meta={task.meta} status={task.status} />
        ))}
      </CardContent>
    </Card>
  );
}

function TaskRow({ title, meta, status }: { title: string; meta: string; status: string }) {
  return (
    <Card className="task-row">
      <div>
        <strong>{title}</strong>
        <p>{meta}</p>
      </div>
      <Badge variant={taskBadgeVariant(status)}>{taskStatusLabel(status)}</Badge>
    </Card>
  );
}

function AccountApprovalPanel() {
  const [accounts, setAccounts] = useState<LocalAccount[]>([]);
  const [loadError, setLoadError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<LocalAccountStatus>("pending");
  const [selectedUsername, setSelectedUsername] = useState<string | null>(null);

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

  async function changeStatus(account: LocalAccount, status: LocalAccountStatus) {
    const actionPath = {
      disabled: "disable",
      enabled: "approve",
      pending: "",
      rejected: "reject",
    }[status];
    if (!actionPath) {
      return;
    }

    setLoadError("");
    try {
      const updated = await adminFetch<ApiLocalAccount>(`/api/admin/accounts/${account.id}/${actionPath}`, {
        method: "POST",
      });
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
    } catch {
      setLoadError("账号状态更新失败，请稍后重试。");
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
      {isLoading ? <p className="empty-state">正在加载本地账号...</p> : null}
      {loadError ? <p className="empty-state danger-state" role="alert">{loadError}</p> : null}
      <div className="account-approval-layout">
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
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredAccounts.length === 0 ? (
            <p className="empty-state">此状态下暂无本地账号。</p>
          ) : null}
        </div>
        <Card className="account-detail-panel" aria-label="本地账号详情">
          {selectedAccount ? (
            <CardContent className="flex flex-col gap-4">
              <div>
                <p className="eyebrow">本地账号</p>
                <h2>{selectedAccount.username}</h2>
                <p>{selectedAccount.email}</p>
              </div>
              <Badge variant={accountBadgeVariant(selectedAccount.status)}>{statusLabel(selectedAccount.status)}</Badge>
              <p>{selectedAccount.riskNote}</p>
              <div className="stack">
                <h3>审批记录</h3>
                <ul className="plain-list">
                  {selectedAccount.history.map((entry) => (
                    <li key={entry}>{entry}</li>
                  ))}
                </ul>
              </div>
              <label>
                <span>管理员备注</span>
                <Textarea placeholder="仅管理员可见" />
              </label>
            </CardContent>
          ) : (
            <CardContent>
              <p className="empty-state">选择一个本地账号查看详情。</p>
            </CardContent>
          )}
        </Card>
      </div>
    </section>
  );
}

function accountStatusAction(status: LocalAccountStatus) {
  switch (status) {
    case "enabled":
      return "管理员已批准";
    case "rejected":
      return "管理员已拒绝";
    case "disabled":
      return "管理员已禁用";
    case "pending":
      return "等待管理员审核";
  }
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

function AgentLifecyclePanel() {
  const [agents, setAgents] = useState<AgentLifecycleRecord[]>([]);
  const [loadError, setLoadError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [isCreateDraftOpen, setIsCreateDraftOpen] = useState(false);
  const selectedAgent =
    agents.find((agent) => agent.id === selectedAgentId) ?? agents[0] ?? null;

  useEffect(() => {
    let isCurrent = true;
    setIsLoading(true);
    setLoadError("");

    adminFetch<ApiAgent[]>("/api/admin/agents")
      .then((result) => {
        if (!isCurrent) {
          return;
        }
        const mappedAgents = result.map(mapAgent);
        setAgents(mappedAgents);
        setSelectedAgentId(mappedAgents[0]?.id ?? "");
      })
      .catch(() => {
        if (!isCurrent) {
          return;
        }
        setAgents([]);
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

  return (
    <section className="route-panel" aria-label="智能体生命周期">
      <CopilotAgentLifecycleBridge
        agents={agents}
        isCreateDraftOpen={isCreateDraftOpen}
        selectedAgentId={selectedAgent?.id ?? null}
        setIsCreateDraftOpen={setIsCreateDraftOpen}
        setSelectedAgentId={setSelectedAgentId}
      />
      <div className="button-row">
        <Button className="primary-button" type="button" onClick={() => setIsCreateDraftOpen(true)}>创建智能体</Button>
        <Button className="secondary-button" type="button" disabled={!selectedAgent || selectedAgent.status !== "disabled"} onClick={() => setAgentStatus("enable")}>
          启用智能体
        </Button>
        <Button className="secondary-button" type="button" disabled={!selectedAgent || selectedAgent.status !== "enabled"} onClick={() => setAgentStatus("disable")}>
          停用智能体
        </Button>
        <Button className="secondary-button" type="button" disabled={!selectedAgent || selectedAgent.status === "retired"} onClick={() => setAgentStatus("retire")}>
          归档智能体
        </Button>
      </div>
      {isLoading ? <p className="empty-state">正在加载智能体...</p> : null}
      {loadError ? <p className="empty-state danger-state" role="alert">{loadError}</p> : null}
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
          <p className="empty-state">暂无智能体。</p>
        ) : null}
      </div>
      {selectedAgent ? (
        <section className="state-panel" aria-label="智能体详情">
          <div className="panel-head">
            <div>
              <p className="eyebrow">智能体 {selectedAgent.avatar}</p>
              <h2>{selectedAgent.name}</h2>
              <p>{selectedAgent.description}</p>
            </div>
            <Badge variant={accountBadgeVariant(selectedAgent.status)}>{lifecycleStatusLabel(selectedAgent.status)}</Badge>
          </div>
          <section className="boundary-list">
            <h3>智能体说明</h3>
            <p>{selectedAgent.instruction}</p>
            <p>新智能体运行会记录当前说明快照。</p>
          </section>
          <section className="detail-grid">
            <InfoTile title="过程可见性策略" value={selectedAgent.processVisibility} icon={FileSearch} />
            <InfoTile title="默认模型配置" value={selectedAgent.defaultModel} icon={Settings2} />
            <InfoTile title="可选模型" value={selectedAgent.allowedModels.join(", ")} icon={Bot} />
            <InfoTile title="能力规则数" value={selectedAgent.capabilityPolicy.length.toString()} icon={ShieldCheck} />
          </section>
          <section className="boundary-list">
            <h3>智能体能力策略</h3>
            {selectedAgent.capabilityPolicy.map((policy) => <p key={policy}>{policy}</p>)}
          </section>
          <section className="boundary-list">
            <h3>MCP 工具授权</h3>
            {selectedAgent.mcpToolAuthorization.map((tool) => <p key={tool}>{tool}</p>)}
          </section>
        </section>
      ) : null}
      {isCreateDraftOpen ? (
        <section className="state-panel" aria-label="创建智能体草稿">
          <p className="eyebrow">本地草稿</p>
          <h2>创建智能体</h2>
          <p>仅创建本地草稿，真正的智能体必须由后端治理流程创建。</p>
          <div className="form-grid">
            <label>
              智能体名称
              <Input placeholder="支持智能体" />
            </label>
            <label>
              描述
              <Input placeholder="说明这个智能体的职责边界" />
            </label>
            <label>
              智能体说明
              <Textarea placeholder="草拟智能体说明" />
            </label>
          </div>
        </section>
      ) : null}
    </section>
  );
}

function ModelConfigurationsPanel() {
  const [providerCatalog, setProviderCatalog] = useState<string[]>([]);
  const [configurations, setConfigurations] = useState<ModelConfigurationRecord[]>([]);
  const [selectedConfigurationId, setSelectedConfigurationId] = useState("");
  const [loadError, setLoadError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateDraftOpen, setIsCreateDraftOpen] = useState(false);
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
        setProviderCatalog(providers.map((provider) => provider.name));
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

  return (
    <section className="route-panel" aria-label="模型配置">
      <CopilotModelConfigurationsBridge
        configurations={configurations}
        isCreateDraftOpen={isCreateDraftOpen}
        providerCatalog={providerCatalog}
        selectedConfigurationId={selectedConfiguration?.id ?? null}
        setIsCreateDraftOpen={setIsCreateDraftOpen}
        setSelectedConfigurationId={setSelectedConfigurationId}
      />
      <div className="button-row">
        <Button className="primary-button" type="button" onClick={() => setIsCreateDraftOpen(true)}>
          创建模型配置
        </Button>
      </div>
      <section className="state-panel" aria-label="模型提供商目录">
        <h2>模型提供商目录</h2>
        <p>提供商目录只是创建入口，不代表该提供商已经配置或可用。</p>
        <div className="provider-grid">
          {providerCatalog.map((provider) => <span className="provider-chip" key={provider}>{provider}</span>)}
        </div>
        {!isLoading && providerCatalog.length === 0 ? (
          <p className="empty-state">后端暂未返回模型提供商目录。</p>
        ) : null}
      </section>
      {isLoading ? <p className="empty-state">正在加载模型配置...</p> : null}
      {loadError ? <p className="empty-state danger-state" role="alert">{loadError}</p> : null}
      <div className="route-table-wrap">
        <table className="route-table" aria-label="模型配置列表">
          <thead>
            <tr>
              <th>提供商</th>
              <th>模型</th>
              <th>凭据引用</th>
              <th>状态</th>
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
                <td>{configuration.credentialReference}</td>
                <td>{modelStatusLabel(configuration.status)}</td>
                <td>{configuration.defaultParameters}</td>
                <td>{configuration.lastUpdated}</td>
                <td>
                  <Button className="secondary-button" type="button" onClick={() => setSelectedConfigurationId(configuration.id)}>
                    详情
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!isLoading && configurations.length === 0 ? (
          <p className="empty-state">暂无模型配置。</p>
        ) : null}
      </div>
      {selectedConfiguration ? (
        <section className="state-panel" aria-label="模型配置详情">
          <div className="panel-head">
            <div>
              <p className="eyebrow">{selectedConfiguration.provider}</p>
              <h2>{selectedConfiguration.model}</h2>
              <p>{selectedConfiguration.baseUrl}</p>
            </div>
            <Badge variant={accountBadgeVariant(selectedConfiguration.status)}>{modelStatusLabel(selectedConfiguration.status)}</Badge>
          </div>
          <section className="detail-grid">
            <InfoTile title="凭据引用" value={selectedConfiguration.credentialReference} icon={LockKeyhole} />
            <InfoTile title="默认参数" value={selectedConfiguration.defaultParameters} icon={Settings2} />
            <InfoTile title="更新时间" value={selectedConfiguration.lastUpdated} icon={Activity} />
            <InfoTile title="配置状态" value={modelStatusLabel(selectedConfiguration.status)} icon={ShieldCheck} />
          </section>
          <section className="boundary-list">
            <h3>配置风险</h3>
            <p>{selectedConfiguration.risk}</p>
          </section>
        </section>
      ) : null}
      {isCreateDraftOpen ? (
        <section className="state-panel" aria-label="创建模型配置草稿">
          <p className="eyebrow">本地草稿</p>
          <h2>创建模型配置</h2>
          <div className="form-grid">
            <label>
              提供商
              <Select defaultValue={providerCatalog[0] ?? "OpenAI"}>
                <SelectTrigger>
                  <SelectValue placeholder="OpenAI" />
                </SelectTrigger>
                <SelectContent>
                  {(providerCatalog.length > 0 ? providerCatalog : ["OpenAI"]).map((provider) => (
                    <SelectItem key={provider} value={provider}>
                      {provider}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label>
              基础 URL
              <Input placeholder="https://provider.example/v1" />
            </label>
            <label>
              模型名称
              <Input placeholder="model-name" />
            </label>
            <label>
              凭据引用
              <Input placeholder="credential-reference" />
            </label>
            <label>
              温度
              <Input defaultValue="0.3" inputMode="decimal" />
            </label>
          </div>
        </section>
      ) : null}
    </section>
  );
}

function McpServersPanel() {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [tools, setTools] = useState<McpToolDiscovery[]>([]);
  const [selectedServerName, setSelectedServerName] = useState<string | null>(null);
  const [authorizationAgent, setAuthorizationAgent] = useState("Default Agent");
  const [loadError, setLoadError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isConfigurationDraftOpen, setIsConfigurationDraftOpen] = useState(false);
  const selectedServer = servers.find((server) => server.name === selectedServerName) ?? null;

  useEffect(() => {
    let isCurrent = true;
    setIsLoading(true);
    setLoadError("");

    adminFetch<ApiMcpServer[]>("/api/admin/mcp-servers")
      .then((result) => {
        if (!isCurrent) {
          return;
        }
        const mappedServers = result.map(mapMcpServer);
        setServers(mappedServers);
        setSelectedServerName(mappedServers[0]?.name ?? null);
      })
      .catch(() => {
        if (!isCurrent) {
          return;
        }
        setServers([]);
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
      <div className="route-table-wrap">
        <table className="route-table" aria-label="MCP 服务器列表">
          <thead>
            <tr>
              <th>名称</th>
              <th>连接类型</th>
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
                <td>{server.credentialReference}</td>
                <td>{discoveryStatusLabel(server.discoveryStatus)}</td>
                <td>{server.authorization}</td>
                <td>
                  <Button
                    className="secondary-button"
                    type="button"
                    onClick={() => openConfigurationDraft(server.name)}
                  >
                    {server.discoveryStatus === "Discovered" ? "编辑" : "配置"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!isLoading && servers.length === 0 ? (
          <p className="empty-state">暂无 MCP 服务器。请创建远程 SSE 或 Streamable HTTP 服务器配置。</p>
        ) : null}
      </div>
      <div className="admin-workbench-grid">
        <section className="sub-panel stack" aria-labelledby="mcp-discovery-title">
          <div>
            <p className="eyebrow">工具发现</p>
            <h3 id="mcp-discovery-title">工具发现结果</h3>
          </div>
          <div className="task-list">
            {tools.map((tool) => (
              <article className="task-row" key={tool.name}>
                <div>
                  <strong>{tool.name}</strong>
                  <p>{tool.description}</p>
                </div>
                <span className="audit-chip">{tool.schemaSummary}</span>
              </article>
            ))}
          </div>
          {tools.length === 0 ? (
            <p className="empty-state">当前服务器暂无已发现工具。</p>
          ) : null}
          <p className="inline-note">
            最近一次发现由后端智能体工具网关执行，不由此前端面板直接执行。
          </p>
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
                <SelectValue placeholder="Default Agent" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Default Agent">Default Agent</SelectItem>
                <SelectItem value="Research Agent">Research Agent</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <div className="card-field-list" aria-label="已授权工具">
            {tools.length > 0 ? tools.map((tool) => (
              <span className="card-field" key={tool.name}>{tool.name}</span>
            )) : <span className="card-field">暂无已发现工具</span>}
          </div>
          <p>智能体工具网关仍由后端持有；前端不会暴露 MCP 凭据明文。</p>
          <Button className="secondary-button" type="button">保存授权草稿</Button>
        </section>
      </div>
      {isConfigurationDraftOpen ? (
        <section className="sub-panel stack" aria-label="MCP 服务器配置草稿">
          <div className="panel-head">
            <div>
              <p className="eyebrow">配置草稿</p>
              <h3>{selectedServer ? selectedServer.name : "创建 MCP 服务器"}</h3>
            </div>
            <Button
              className="secondary-button"
              type="button"
              onClick={() => setIsConfigurationDraftOpen(false)}
            >
              关闭
            </Button>
          </div>
          <div className="form-grid">
            <label>
              <span>名称</span>
              <Input defaultValue={selectedServer?.name ?? ""} placeholder="MCP 服务器名称" />
            </label>
            <label>
              <span>连接类型</span>
              <Select defaultValue={selectedServer?.connectionType ?? "SSE"}>
                <SelectTrigger>
                  <SelectValue placeholder="SSE" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SSE">SSE</SelectItem>
                  <SelectItem value="Streamable HTTP">Streamable HTTP</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <label>
              <span>凭据引用</span>
              <Input
                defaultValue={selectedServer?.credentialReference ?? ""}
                placeholder="secret/mcp-server"
              />
            </label>
            <label>
              <span>超时</span>
              <Input placeholder="30s" />
            </label>
          </div>
          <p className="inline-note">
            保存草稿后，仍需后端授权流程完成 MCP 服务器登记。
          </p>
        </section>
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
  const [scenario, setScenario] = useState<SearchProviderScenario>("success");

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
      <CopilotSearchProviderBridge scenario={scenario} setScenario={setScenario} />
      <div className="panel-head">
        <div>
          <p className="eyebrow">能力配置</p>
          <h2>{provider?.name ?? "搜索提供方"}</h2>
          <p>搜索能力负责查找候选 URL 和摘要；页面读取能力只读取已知 URL。</p>
        </div>
        <Button className="secondary-button" type="button">健康检查</Button>
      </div>
      {isLoading ? <p className="empty-state">正在加载搜索提供方...</p> : null}
      {loadError ? <p className="empty-state danger-state" role="alert">{loadError}</p> : null}
      <section className="detail-grid" aria-label="搜索提供方状态">
        <InfoTile title="提供方" value={provider?.enabled ? "已启用" : "已停用"} tone={provider?.enabled ? "success" : "warning"} icon={Search} />
        <InfoTile title="凭据" value={provider?.credential_reference ?? "未配置"} icon={LockKeyhole} />
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
      <section className="sub-panel stack">
        <div className="panel-head">
          <div>
            <p className="eyebrow">运行时状态</p>
            <h3>提供方运行预览</h3>
          </div>
          <div className="tab-list" role="tablist" aria-label="搜索提供方运行状态">
            <Button
              aria-selected={scenario === "success"}
              className={scenario === "success" ? "tab-button active" : "tab-button"}
              role="tab"
              type="button"
              onClick={() => setScenario("success")}
            >
              成功
            </Button>
            <Button
              aria-selected={scenario === "empty"}
              className={scenario === "empty" ? "tab-button active" : "tab-button"}
              role="tab"
              type="button"
              onClick={() => setScenario("empty")}
            >
              无结果
            </Button>
            <Button
              aria-selected={scenario === "error"}
              className={scenario === "error" ? "tab-button active" : "tab-button"}
              role="tab"
              type="button"
              onClick={() => setScenario("error")}
            >
              提供方错误
            </Button>
          </div>
        </div>
        {scenario === "success" ? (
          <div className="state-panel" role="tabpanel" aria-label="成功">
            <h3>候选摘要可用</h3>
            <p>智能体运行可以把选中的已知 URL 传给页面读取提供方获取全文。</p>
            <TableBlock
              columns={["标题", "URL", "摘要", "下一步"]}
              rows={[
                ["Minimalist Agent MVP", "docs/internal/mvp", "会话优先的平台范围。", "允许页面读取"],
                ["搜索能力", "docs/capability/search", "候选 URL 与摘要提供方。", "允许页面读取"],
              ]}
            />
          </div>
        ) : null}
        {scenario === "empty" ? (
          <div className="state-panel" role="tabpanel" aria-label="无结果">
            <h3>没有候选 URL</h3>
            <p>请用户细化查询，或检查提供方限制。</p>
          </div>
        ) : null}
        {scenario === "error" ? (
          <div className="state-panel danger-state" role="tabpanel" aria-label="提供方错误">
            <h3>搜索提供方不可用</h3>
            <p>凭据和内部端点详情仅管理员可见。</p>
          </div>
        ) : null}
      </section>
    </section>
  );
}

function PageReadProviderPanel() {
  const [provider, setProvider] = useState<ApiPageReadProvider | null>(null);
  const [form, setForm] = useState({
    allowedDomains: "",
    maxContentLength: "",
    timeout: "",
  });
  const [loadError, setLoadError] = useState("");
  const [saveStatus, setSaveStatus] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [scenario, setScenario] = useState<PageReadScenario>("success");

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
              maxContentLength: `${nextProvider.max_content_length} 字符`,
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
            enabled: provider.enabled,
            max_content_length: maxContentLength,
            timeout_seconds: timeoutSeconds,
          }),
        },
      );
      setProvider(updated);
      setForm({
        allowedDomains: updated.allowed_domains.join("\n"),
        maxContentLength: `${updated.max_content_length} 字符`,
        timeout: `${updated.timeout_seconds}s`,
      });
      setSaveStatus("页面读取提供方配置已保存。");
    } catch {
      setSaveStatus("页面读取提供方配置保存失败。");
    }
  }

  return (
    <section className="route-panel" aria-label="页面读取提供方配置">
      <CopilotPageReadProviderBridge scenario={scenario} setScenario={setScenario} />
      <div className="panel-head">
        <div>
          <p className="eyebrow">能力配置</p>
          <h2>{provider?.name ?? "页面读取提供方"}</h2>
          <p>页面读取能力读取已知 URL 的全文；搜索能力只查找候选 URL 和摘要。</p>
        </div>
        <Button className="secondary-button" type="button">健康检查</Button>
      </div>
      {isLoading ? <p className="empty-state">正在加载页面读取提供方...</p> : null}
      {loadError ? <p className="empty-state danger-state" role="alert">{loadError}</p> : null}
      <section className="detail-grid" aria-label="页面读取提供方状态">
        <InfoTile title="提供方" value={provider?.enabled ? "已启用" : "已停用"} tone={provider?.enabled ? "success" : "warning"} icon={FileText} />
        <InfoTile title="凭据" value={provider?.credential_reference ?? "未配置"} icon={LockKeyhole} />
        <InfoTile title="内容上限" value={provider ? `${provider.max_content_length} 字符` : "未配置"} icon={FileSearch} />
        <InfoTile title="允许域名数" value={provider ? String(provider.allowed_domains.length) : "未配置"} icon={ShieldCheck} />
      </section>
      <div className="admin-workbench-grid">
        <section className="sub-panel stack" aria-label="域名策略编辑器">
          <div>
            <p className="eyebrow">域名策略</p>
            <h3>已知 URL 访问</h3>
          </div>
          <p>在页面读取抽取可读文本前，对已知 URL 执行允许或拒绝策略。</p>
          <label>
            <span>允许域名</span>
            <Textarea
              value={form.allowedDomains}
              onChange={(event) => setForm((current) => ({ ...current, allowedDomains: event.target.value }))}
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
          <label>
            <span>抽取模式</span>
            <Select defaultValue="可读文本">
              <SelectTrigger>
                <SelectValue placeholder="可读文本" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="可读文本">可读文本</SelectItem>
                <SelectItem value="保留结构">保留结构</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <div className="form-grid">
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
      <section className="sub-panel stack" aria-label="页面读取健康检查结果">
        <div className="panel-head">
          <div>
            <p className="eyebrow">健康检查</p>
            <h3>已知 URL 读取预览</h3>
          </div>
          <div className="tab-list" role="tablist" aria-label="页面读取健康检查状态">
            <Button
              aria-selected={scenario === "success"}
              className={scenario === "success" ? "tab-button active" : "tab-button"}
              role="tab"
              type="button"
              onClick={() => setScenario("success")}
            >
              成功
            </Button>
            <Button
              aria-selected={scenario === "policy-violation"}
              className={scenario === "policy-violation" ? "tab-button active" : "tab-button"}
              role="tab"
              type="button"
              onClick={() => setScenario("policy-violation")}
            >
              策略违规
            </Button>
          </div>
        </div>
        {scenario === "success" ? (
          <div className="state-panel" role="tabpanel" aria-label="成功">
            <h3>已抽取可读内容</h3>
            <p>已知 URL 通过域名策略和内容长度限制。</p>
            <p>页面读取未发起搜索查询。</p>
          </div>
        ) : null}
        {scenario === "policy-violation" ? (
          <div className="state-panel danger-state" role="tabpanel" aria-label="策略违规">
            <h3>已知 URL 被域名策略拦截</h3>
            <p>管理员域名策略在抽取前拒绝了请求 URL。</p>
            <p>页面读取未发起搜索查询。</p>
          </div>
        ) : null}
      </section>
    </section>
  );
}

function SandboxStatusPanel() {
  const [agents, setAgents] = useState<AgentLifecycleRecord[]>([]);
  const [artifactCount, setArtifactCount] = useState(0);
  const [loadError, setLoadError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [scenario, setScenario] = useState<SandboxScenario>("completed");
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
      <CopilotSandboxStatusBridge scenario={scenario} setScenario={setScenario} />
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
      <section className="sub-panel stack">
        <div className="panel-head">
          <div>
            <p className="eyebrow">策略预览</p>
            <h3>近期调用结果</h3>
          </div>
          <div className="tab-list" role="tablist" aria-label="沙箱近期调用结果">
            <Button
              aria-selected={scenario === "completed"}
              className={scenario === "completed" ? "tab-button active" : "tab-button"}
              role="tab"
              type="button"
              onClick={() => setScenario("completed")}
            >
              已完成调用
            </Button>
            <Button
              aria-selected={scenario === "rejected"}
              className={scenario === "rejected" ? "tab-button active" : "tab-button"}
              role="tab"
              type="button"
              onClick={() => setScenario("rejected")}
            >
              已拒绝调用
            </Button>
          </div>
        </div>
        {scenario === "completed" ? (
          <div className="state-panel" role="tabpanel" aria-label="已完成调用">
            <h3>沙箱工具调用已完成</h3>
            <p>输出已通过后端产物存储策略捕获。</p>
          </div>
        ) : null}
        {scenario === "rejected" ? (
          <div className="state-panel danger-state" role="tabpanel" aria-label="已拒绝调用">
            <h3>智能体能力策略拒绝了沙箱能力</h3>
            <p>前端没有执行代码，也没有绕过后端策略。</p>
          </div>
        ) : null}
      </section>
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
        <p className="empty-state">暂无可用完整追踪记录。</p>
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
  const filteredRuns = useMemo(
    () =>
      statusFilter === "all"
        ? runs
        : runs.filter((run) => run.status === statusFilter),
    [runs, statusFilter],
  );
  const selectedRun =
    runs.find((run) => run.id === selectedRunId) ?? filteredRuns[0] ?? null;

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
        <label htmlFor="run-audit-status-filter">状态</label>
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
      </section>
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
          <p className="empty-state">没有符合筛选条件的智能体运行。</p>
        ) : null}
      </div>
      {selectedRun ? (
        <section className="state-panel" aria-label="智能体运行详情">
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
        </section>
      ) : null}
    </section>
  );
}

function TableBlock({ columns, rows }: { columns: string[]; rows: string[][] }) {
  return (
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
    case "draft":
      return "草稿";
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
