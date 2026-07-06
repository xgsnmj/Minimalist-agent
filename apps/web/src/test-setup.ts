/// <reference types="@testing-library/jest-dom/vitest" />
import * as matchers from "@testing-library/jest-dom/matchers";
import type { ReactNode } from "react";
import { beforeEach, expect, vi } from "vitest";

import { resetWorkspaceUiStore } from "./features/workspace/workspace-ui-store";

expect.extend(matchers);

if (!window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      addEventListener: vi.fn(),
      addListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches: false,
      media: query,
      onchange: null,
      removeEventListener: vi.fn(),
      removeListener: vi.fn(),
    })),
  });
}

type TestAgent = {
  id: number;
  name: string;
  description: string;
  icon: string;
  status: string;
  is_default: boolean;
  instruction: string;
  process_visibility: string;
  default_model_configuration_id: number | null;
  allowed_model_configuration_ids: number[];
  capability_policy: {
    mcp_server_ids: number[];
    sandbox_enabled: boolean;
    search_enabled: boolean;
    page_read_enabled: boolean;
  };
};

type TestModelConfiguration = {
  id: number;
  provider_id: string;
  name: string;
  model_name: string;
  endpoint: string;
  credential_reference: string;
  default_parameters: Record<string, unknown>;
  enabled: boolean;
  health_status: "not_checked" | "healthy" | "unhealthy";
  last_checked_at: string | null;
  last_error: string | null;
};

type TestMcpServer = {
  id: number;
  name: string;
  connection_type: string;
  url: string;
  header_secret_refs: Record<string, string>;
  timeout_seconds: number;
  enabled: boolean;
  last_discovery_status: string;
};

type TestMcpTool = {
  id: number;
  server_id: number;
  tool_name: string;
  description: string;
  input_schema: Record<string, string>;
};

type TestWorkspaceRun = {
  id: number;
  conversation_id: number;
  owner_user_id: number;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  user_message: string;
  assistant_message: string | null;
  process_summaries: string[];
  error: string | null;
  worker_enqueued: boolean;
  status_events: string[];
};

type TestCurrentUser = {
  id: number;
  username: string;
  email: string | null;
  role: "admin" | "user";
  status: "pending" | "enabled" | "rejected" | "disabled";
  note: string;
  status_reason: string;
  created_at: string;
  updated_at: string;
};

beforeEach(() => {
  resetWorkspaceUiStore();
  window.localStorage.setItem("minimalist-agent:auth-token", "local-test-token");
  let currentUser: TestCurrentUser = {
    id: 3,
    username: "wang.user",
    email: "wang.user@example.com",
    role: "admin",
    status: "enabled",
    note: "",
    status_reason: "",
    created_at: "2026-07-05T08:00:00+00:00",
    updated_at: "2026-07-05T08:00:00+00:00",
  };
  const accounts: TestCurrentUser[] = [
    {
      id: 1,
      username: "lin.request",
      email: "lin.request@example.com",
      role: "user",
      status: "pending",
      note: "来自市场团队。",
      status_reason: "",
      created_at: "2026-07-05T08:10:00+00:00",
      updated_at: "2026-07-05T08:10:00+00:00",
    },
    {
      id: 2,
      username: "mei.request",
      email: "mei.request@example.com",
      role: "user",
      status: "pending",
      note: "",
      status_reason: "",
      created_at: "2026-07-05T08:15:00+00:00",
      updated_at: "2026-07-05T08:15:00+00:00",
    },
    {
      id: 3,
      username: "wang.user",
      email: "wang.user@example.com",
      role: "admin",
      status: "enabled",
      note: "",
      status_reason: "",
      created_at: "2026-07-05T08:00:00+00:00",
      updated_at: "2026-07-05T08:00:00+00:00",
    },
    {
      id: 4,
      username: "old.contractor",
      email: "old.contractor@example.com",
      role: "user",
      status: "disabled",
      note: "合同到期。",
      status_reason: "Access no longer required.",
      created_at: "2026-07-04T08:10:00+00:00",
      updated_at: "2026-07-05T07:12:00+00:00",
    },
    {
      id: 5,
      username: "unknown.vendor",
      email: "unknown.vendor@example.com",
      role: "user",
      status: "rejected",
      note: "",
      status_reason: "Unable to verify requester.",
      created_at: "2026-07-04T09:30:00+00:00",
      updated_at: "2026-07-05T06:20:00+00:00",
    },
  ];
  const accountAuditEvents: Record<number, Array<Record<string, unknown>>> = {
    1: [
      { id: 1, account_id: 1, actor_id: null, action: "registered", reason: "", note: "", created_at: "2026-07-05T08:10:00+00:00" },
    ],
    4: [
      { id: 2, account_id: 4, actor_id: null, action: "registered", reason: "", note: "", created_at: "2026-07-04T08:10:00+00:00" },
      { id: 3, account_id: 4, actor_id: 3, action: "disabled", reason: "Access no longer required.", note: "", created_at: "2026-07-05T07:12:00+00:00" },
    ],
    5: [
      { id: 4, account_id: 5, actor_id: null, action: "registered", reason: "", note: "", created_at: "2026-07-04T09:30:00+00:00" },
      { id: 5, account_id: 5, actor_id: 3, action: "rejected", reason: "Unable to verify requester.", note: "", created_at: "2026-07-05T06:20:00+00:00" },
    ],
  };
  const agents: TestAgent[] = [
    {
      id: 1,
      name: "Default Agent",
      description: "用于通用智能体会话的默认智能体。",
      icon: "DA",
      status: "enabled",
      is_default: true,
      instruction: "在遵守已授权能力边界的前提下，帮助用户完成工作区任务。",
      process_visibility: "standard",
      default_model_configuration_id: 1,
      allowed_model_configuration_ids: [1, 2],
      capability_policy: {
        mcp_server_ids: [1],
        sandbox_enabled: true,
        search_enabled: true,
        page_read_enabled: false,
      },
    },
    {
      id: 2,
      name: "Research Agent",
      description: "面向资料发现与访谈归纳的研究智能体。",
      icon: "RA",
      status: "enabled",
      is_default: false,
      instruction: "收集候选资料、读取已批准页面，并产出简明研究笔记。",
      process_visibility: "minimal",
      default_model_configuration_id: 2,
      allowed_model_configuration_ids: [2, 1],
      capability_policy: {
        mcp_server_ids: [],
        sandbox_enabled: false,
        search_enabled: true,
        page_read_enabled: true,
      },
    },
  ];
  const runAuditList = {
    runs: [
      {
        id: 1,
        conversation_id: 201,
        owner_user_id: 3,
        agent_id: 1,
        status: "running",
        selected_model_configuration_id: 1,
        updated_at: "10:40",
        full_trace_available: true,
        tool_call_count: 3,
        artifact_count: 1,
      },
      {
        id: 2,
        conversation_id: 118,
        owner_user_id: 4,
        agent_id: 2,
        status: "failed",
        selected_model_configuration_id: 2,
        updated_at: "09:18",
        full_trace_available: true,
        tool_call_count: 1,
        artifact_count: 0,
      },
    ],
    retention: {
      full_trace_retention_days: 90,
      policy: "Full Trace records are retained for 90 days by default.",
    },
    storage: {
      artifact_count: 1,
      artifact_bytes: 1024,
      retained_full_trace_count: 2,
    },
  };
  const modelProviders = [
    { id: "openai", name: "OpenAI", endpoint_template: "https://api.openai.com/v1", recommended_models: ["gpt-5.5"] },
    { id: "deepseek", name: "DeepSeek", endpoint_template: "https://api.deepseek.com", recommended_models: ["deepseek-reasoner"] },
    { id: "minimax", name: "MiniMax", endpoint_template: "https://api.minimax.io/v1", recommended_models: ["MiniMax-M1"] },
    { id: "custom-openai-compatible", name: "Custom OpenAI-compatible endpoint", endpoint_template: "https://gateway.example/v1", recommended_models: [] },
  ];
  const modelConfigurations: TestModelConfiguration[] = [
    {
      id: 1,
      provider_id: "openai",
      name: "gpt-5.5",
      model_name: "gpt-5.5",
      endpoint: "https://api.openai.com/v1",
      credential_reference: "sk-openai-primary",
      default_parameters: { temperature: 0.3 },
      enabled: true,
      health_status: "healthy",
      last_checked_at: "2026-07-05T08:30:00+00:00",
      last_error: null,
    },
    {
      id: 2,
      provider_id: "deepseek",
      name: "Reasoner",
      model_name: "deepseek-reasoner",
      endpoint: "https://api.deepseek.com",
      credential_reference: "sk-deepseek-main",
      default_parameters: { temperature: 0.2 },
      enabled: true,
      health_status: "not_checked",
      last_checked_at: null,
      last_error: null,
    },
    {
      id: 3,
      provider_id: "custom-openai-compatible",
      name: "Gateway",
      model_name: "gateway-default",
      endpoint: "https://models.internal.example/v1",
      credential_reference: "",
      default_parameters: { temperature: 0.4 },
      enabled: false,
      health_status: "unhealthy",
      last_checked_at: "2026-07-05T08:20:00+00:00",
      last_error: "Model credential is not configured.",
    },
  ];
  const mcpServers: TestMcpServer[] = [
    {
      id: 1,
      name: "Document Tools",
      connection_type: "sse",
      url: "https://mcp.example/sse",
      header_secret_refs: { Authorization: "secret://mcp/document-tools" },
      timeout_seconds: 30,
      enabled: true,
      last_discovery_status: "succeeded",
    },
    {
      id: 2,
      name: "Data Reader",
      connection_type: "streamable_http",
      url: "https://mcp.example/http",
      header_secret_refs: {},
      timeout_seconds: 30,
      enabled: true,
      last_discovery_status: "not_run",
    },
  ];
  const mcpTools: TestMcpTool[] = [
    {
      id: 1,
      server_id: 1,
      tool_name: "read_document",
      description: "为智能体运行读取已批准的文档内容。",
      input_schema: { path: "string", format: "string" },
    },
    {
      id: 2,
      server_id: 1,
      tool_name: "extract_table",
      description: "从已批准文档中提取结构化表格。",
      input_schema: { path: "string", range: "string" },
    },
  ];
  const searchProviders = [
    {
      id: 1,
      provider_id: "doubao",
      name: "Doubao Search Provider",
      endpoint: "https://api.doubao.example/search",
      credential_reference: "secret:doubao-search",
      timeout_seconds: 20,
      max_results: 5,
      enabled: true,
    },
  ];
  const pageReadProviders = [
    {
      id: 1,
      provider_id: "jina_reader",
      name: "Jina Reader Provider",
      endpoint: "https://r.jina.ai/http://example.com",
      credential_reference: "secret:jina-reader",
      timeout_seconds: 20,
      max_content_length: 4000,
      allowed_domains: ["docs.example.com", "help.example.com"],
      enabled: true,
    },
  ];
  let workspaceConversations = [
    {
      id: 1,
      title: "市场调研",
      agent: agents[0],
      selected_model_configuration_id: 1,
      status: "idle",
      updated_at: "刚刚",
      deleted: false,
      messages: [
        { role: "user", content: "调研生产级 AI 工作台的会话、运行和制品设计逻辑。" },
        {
          role: "assistant",
          content: "运行过程：拆解会话、运行、工具调用和制品预览的关系。",
          run_id: 1,
          event_sequence: 3,
          event_type: "process.summary",
          process_summary: "拆解会话、运行、工具调用和制品预览的关系。",
        },
        {
          role: "assistant",
          content: "工具调用：search.web（completed）",
          run_id: 1,
          event_sequence: 4,
          event_type: "tool.call",
          tool_call: {
            id: 1,
            run_id: 1,
            conversation_id: 1,
            tool_name: "search.web",
            capability: "search",
            status: "completed",
            started_at: "10:00",
            ended_at: "10:01",
            safe_input: { query: "AI workspace conversation artifacts" },
            safe_output: { summary: "找到 3 条候选资料。" },
            provenance: { gateway: "openai_agents_sdk", provider: "doubao" },
            error_summary: null,
          },
        },
        { role: "assistant", content: "已建立调研范围：会话线程、运行状态、工具调用、附件和制品预览。" },
        { role: "assistant", content: "制品已生成：brief.md", artifact_reference: { artifact_id: 1, filename: "brief.md", preview_type: "markdown" } },
        { role: "assistant", content: "制品已生成：metrics.json", artifact_reference: { artifact_id: 2, filename: "metrics.json", preview_type: "json" } },
        { role: "assistant", content: "制品已生成：analysis.ts", artifact_reference: { artifact_id: 5, filename: "analysis.ts", preview_type: "code" } },
        { role: "assistant", content: "制品已生成：demo.html", artifact_reference: { artifact_id: 6, filename: "demo.html", preview_type: "html" } },
        { role: "assistant", content: "制品已生成：notes.txt", artifact_reference: { artifact_id: 7, filename: "notes.txt", preview_type: "plaintext" } },
        { role: "assistant", content: "制品已生成：diagram.png", artifact_reference: { artifact_id: 8, filename: "diagram.png", preview_type: "image" } },
        { role: "assistant", content: "制品已生成：report.pdf", artifact_reference: { artifact_id: 9, filename: "report.pdf", preview_type: "pdf" } },
        { role: "assistant", content: "制品卡片：artifact_card", card: { schema: "artifact_card", payload: { artifact_id: 1, filename: "brief.md", preview_type: "markdown" } } },
      ],
    },
    {
      id: 2,
      title: "竞品分析",
      agent: agents[0],
      selected_model_configuration_id: 1,
      status: "running",
      updated_at: "2 分钟前",
      deleted: false,
      messages: [
        { role: "user", content: "对比三个同类产品的对话工作台信息架构。" },
        { role: "assistant", content: "正在整理竞品的会话导航、运行状态和制品预览差异。" },
      ],
    },
    {
      id: 3,
      title: "行业报告",
      agent: agents[0],
      selected_model_configuration_id: 1,
      status: "idle",
      updated_at: "5 分钟前",
      deleted: false,
      messages: [
        { role: "user", content: "生成一份行业报告结构和关键数据清单。" },
        { role: "assistant", content: "模型网关超时，运行未完成。可重新运行或调整输入。" },
      ],
    },
    {
      id: 4,
      title: "品牌简报",
      agent: agents[0],
      selected_model_configuration_id: 1,
      status: "idle",
      updated_at: "12 分钟前",
      deleted: false,
      messages: [
        { role: "user", content: "整理品牌定位简报，输出 Markdown 文档。" },
        { role: "assistant", content: "已完成品牌定位简报，并生成可预览制品。" },
        { role: "assistant", content: "制品已生成：brand-brief.md", artifact_reference: { artifact_id: 3, filename: "brand-brief.md", preview_type: "markdown" } },
      ],
    },
    {
      id: 5,
      title: "资料整理",
      agent: agents[0],
      selected_model_configuration_id: 1,
      status: "idle",
      updated_at: "8 分钟前",
      deleted: false,
      messages: [
        { role: "user", content: "整理上传材料，先输出可复用的中间笔记。" },
        { role: "assistant", content: "运行已停止，已有输出已保留。" },
        { role: "assistant", content: "制品已保留：partial-notes.md", artifact_reference: { artifact_id: 4, filename: "partial-notes.md", preview_type: "markdown" } },
      ],
    },
    {
      id: 6,
      title: "归档研究",
      agent: agents[0],
      selected_model_configuration_id: 1,
      status: "idle",
      updated_at: "30 分钟前",
      deleted: false,
      messages: [
        { role: "user", content: "归档旧研究材料。" },
        { role: "assistant", content: "已归档旧材料。" },
      ],
    },
  ];
  const workspaceRuns: TestWorkspaceRun[] = [
    { id: 2, conversation_id: 2, owner_user_id: 1, status: "running", user_message: "对比三个同类产品的对话工作台信息架构。", assistant_message: null, process_summaries: [], error: null, worker_enqueued: true, status_events: ["queued", "worker_enqueued"] },
    { id: 3, conversation_id: 3, owner_user_id: 1, status: "failed", user_message: "生成一份行业报告结构和关键数据清单。", assistant_message: null, process_summaries: [], error: "模型网关超时，运行未完成。可重新运行或调整输入。", worker_enqueued: true, status_events: ["failed"] },
    { id: 4, conversation_id: 4, owner_user_id: 1, status: "completed", user_message: "整理品牌定位简报，输出 Markdown 文档。", assistant_message: "已完成品牌定位简报，并生成可预览制品。", process_summaries: [], error: null, worker_enqueued: true, status_events: ["completed"] },
    { id: 5, conversation_id: 5, owner_user_id: 1, status: "cancelled", user_message: "整理上传材料，先输出可复用的中间笔记。", assistant_message: "运行已停止，已有输出已保留。", process_summaries: [], error: null, worker_enqueued: true, status_events: ["cancelled"] },
  ];
  const artifactPreviews: Record<number, unknown> = {
    1: { artifact_id: 1, filename: "brief.md", content_type: "text/markdown", preview_type: "markdown", download_url: "/artifacts/1/download", text: "# 简报\n\nalpha" },
    2: { artifact_id: 2, filename: "metrics.json", content_type: "application/json", preview_type: "json", download_url: "/artifacts/2/download", text: JSON.stringify({ coverage: 82, latency_ms: 184, sources: 4 }, null, 2) },
    3: { artifact_id: 3, filename: "brand-brief.md", content_type: "text/markdown", preview_type: "markdown", download_url: "/artifacts/3/download", text: "# 品牌简报\n\n定位：面向团队的 Agent 对话工作台。" },
    4: { artifact_id: 4, filename: "partial-notes.md", content_type: "text/markdown", preview_type: "markdown", download_url: "/artifacts/4/download", text: "# 中间笔记\n\n已保留的中间输出：材料索引、摘要和待确认问题。" },
    5: { artifact_id: 5, filename: "analysis.ts", content_type: "text/x-typescript", preview_type: "code", download_url: "/artifacts/5/download", text: "export function summarize(items: string[]) {\n  return items.length;\n}\n" },
    6: { artifact_id: 6, filename: "demo.html", content_type: "text/html", preview_type: "html", download_url: "/artifacts/6/download", text: "<!doctype html><html><body><main><h1>Agent Workspace Demo</h1><p>Sandboxed preview.</p></main></body></html>" },
    7: { artifact_id: 7, filename: "notes.txt", content_type: "text/plain", preview_type: "plaintext", download_url: "/artifacts/7/download", text: "调研笔记\n\n保留给下一轮追问的上下文。" },
    8: { artifact_id: 8, filename: "diagram.png", content_type: "image/png", preview_type: "image", download_url: "/artifacts/8/download", data_url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=" },
    9: { artifact_id: 9, filename: "report.pdf", content_type: "application/pdf", preview_type: "pdf", download_url: "/artifacts/9/download", data_url: "data:application/pdf;base64,JVBERi0xLjEKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCAyMDAgMjAwXSA+PgplbmRvYmoKeHJlZgowIDQKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDA5IDAwMDAwIG4gCjAwMDAwMDAwNTggMDAwMDAgbiAKMDAwMDAwMDExNSAwMDAwMCBuIAp0cmFpbGVyCjw8IC9TaXplIDQgL1Jvb3QgMSAwIFIgPj4Kc3RhcnR4cmVmCjE4OQolJUVPRgo=" },
  };

  function jsonResponse(body: unknown, init: ResponseInit = {}) {
    return Promise.resolve({
      ok: init.status === undefined || init.status < 400,
      status: init.status ?? 200,
      json: async () => body,
    });
  }

  function sseResponse(events: Record<string, unknown>[], init: ResponseInit = {}) {
    const headers = new Headers(init.headers);
    headers.set("Content-Type", "text/event-stream");
    const body = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("");
    return Promise.resolve(new Response(body, {
      ...init,
      headers,
      status: init.status ?? 200,
    }));
  }

  function requestJson(init?: RequestInit) {
    return init?.body && typeof init.body === "string"
      ? JSON.parse(init.body) as Record<string, unknown>
      : {};
  }

  function requestRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
  }

  function requestNumberArray(value: unknown): number[] {
    return Array.isArray(value)
      ? value.filter((item): item is number => typeof item === "number")
      : [];
  }

  function updateAccount(
    accountId: number,
    patch: Partial<TestCurrentUser>,
    auditAction?: string,
    reason = "",
  ) {
    const index = accounts.findIndex((account) => account.id === accountId);
    if (index === -1) {
      return null;
    }
    const cleanPatch = Object.fromEntries(
      Object.entries(patch).filter(([, value]) => value !== undefined),
    ) as Partial<TestCurrentUser>;
    accounts[index] = {
      ...accounts[index],
      ...cleanPatch,
      updated_at: "2026-07-05T09:00:00+00:00",
    };
    if (auditAction) {
      const events = accountAuditEvents[accountId] ?? [];
      events.push({
        id: events.length + 100,
        account_id: accountId,
        actor_id: 3,
        action: auditAction,
        reason,
        note: auditAction === "updated" ? "note" : "",
        created_at: "2026-07-05T09:00:00+00:00",
      });
      accountAuditEvents[accountId] = events;
    }
    return accounts[index];
  }

  function agentReadinessIssues(agent: TestAgent) {
    const issues: string[] = [];
    if (agent.default_model_configuration_id === null) {
      issues.push("Default Model Configuration is required.");
    }
    if (agent.default_model_configuration_id !== null && !agent.allowed_model_configuration_ids.includes(agent.default_model_configuration_id)) {
      issues.push("Default Model Configuration must be in allowed Model Configuration ids.");
    }
    for (const configurationId of agent.allowed_model_configuration_ids) {
      const configuration = modelConfigurations.find((item) => item.id === configurationId);
      if (!configuration) {
        issues.push(`Allowed Model Configuration #${configurationId} does not exist.`);
      } else if (!configuration.enabled) {
        issues.push(`Allowed Model Configuration #${configurationId} is disabled.`);
      }
    }
    return [...new Set(issues)];
  }

  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url === "/api/auth/me" && method === "GET") {
        return jsonResponse(currentUser);
      }
      if (url === "/api/auth/me" && method === "PATCH") {
        const body = requestJson(init);
        currentUser = {
          ...currentUser,
          username: String(body.username ?? currentUser.username),
          email: body.email == null ? null : String(body.email),
        };
        return jsonResponse(currentUser);
      }
      if (url === "/api/admin/accounts" && method === "GET") {
        return jsonResponse(accounts);
      }
      if (url.startsWith("/api/admin/accounts/") && url.endsWith("/audit-events") && method === "GET") {
        const accountId = Number(url.split("/")[4]);
        return jsonResponse(accountAuditEvents[accountId] ?? []);
      }
      if (url.startsWith("/api/admin/accounts/") && method === "PATCH") {
        const accountId = Number(url.split("/")[4]);
        const body = requestJson(init);
        const updated = updateAccount(
          accountId,
          {
            note: typeof body.note === "string" ? body.note : undefined,
            role: body.role === "admin" || body.role === "user" ? body.role : undefined,
          },
          "updated",
        );
        return updated ? jsonResponse(updated) : jsonResponse({}, { status: 404 });
      }
      if (url.startsWith("/api/admin/accounts/") && method === "POST") {
        const [, , , , accountIdText, action] = url.split("/");
        const accountId = Number(accountIdText);
        const body = requestJson(init);
        const reason = typeof body.reason === "string" ? body.reason : "";
        const statusByAction = {
          approve: "enabled",
          enable: "enabled",
          reject: "rejected",
          disable: "disabled",
        } as const;
        if (action in statusByAction) {
          const updated = updateAccount(
            accountId,
            {
              status: statusByAction[action as keyof typeof statusByAction],
              status_reason: reason,
            },
            action === "approve" ? "approved" : action,
            reason,
          );
          return updated ? jsonResponse(updated) : jsonResponse({}, { status: 404 });
        }
      }
      if (url === "/api/admin/agents" && method === "GET") {
        return jsonResponse(agents);
      }
      if (url === "/api/admin/agents" && method === "POST") {
        const body = requestJson(init);
        const created = {
          id: agents.length + 1,
          name: String(body.name),
          description: String(body.description ?? ""),
          icon: String(body.icon ?? "agent"),
          status: "enabled",
          is_default: false,
          instruction: String(body.instruction),
          process_visibility: String(body.process_visibility ?? "standard"),
          default_model_configuration_id: typeof body.default_model_configuration_id === "number"
            ? body.default_model_configuration_id
            : null,
          allowed_model_configuration_ids: requestNumberArray(body.allowed_model_configuration_ids),
          capability_policy: {
            mcp_server_ids: [],
            sandbox_enabled: false,
            search_enabled: false,
            page_read_enabled: false,
            ...requestRecord(body.capability_policy),
          },
        };
        agents.push(created);
        return jsonResponse(created, { status: 201 });
      }
      if (url === "/api/admin/agents/1/disable" && method === "POST") {
        agents[0] = { ...agents[0], status: "disabled" };
        return jsonResponse(agents[0]);
      }
      if (url === "/api/admin/agents/1/enable" && method === "POST") {
        agents[0] = { ...agents[0], status: "enabled" };
        return jsonResponse(agents[0]);
      }
      if (url === "/api/admin/agents/1/retire" && method === "POST") {
        agents[0] = { ...agents[0], status: "retired" };
        return jsonResponse(agents[0]);
      }
      if (url.startsWith("/api/admin/agents/") && url.endsWith("/readiness-check") && method === "POST") {
        const agentId = Number(url.split("/")[4]);
        const agent = agents.find((item) => item.id === agentId);
        if (!agent) {
          return jsonResponse({}, { status: 404 });
        }
        const issues = agentReadinessIssues(agent);
        return jsonResponse({ agent_id: agent.id, ready: issues.length === 0, issues });
      }
      if (url.startsWith("/api/admin/agents/") && method === "PATCH") {
        const agentId = Number(url.split("/")[4]);
        const body = requestJson(init);
        const index = agents.findIndex((agent) => agent.id === agentId);
        if (index === -1) {
          return jsonResponse({}, { status: 404 });
        }
        agents[index] = {
          ...agents[index],
          ...body,
          capability_policy: {
            ...agents[index].capability_policy,
            ...requestRecord(body.capability_policy),
          },
        } as TestAgent;
        return jsonResponse(agents[index]);
      }
      if (url === "/api/admin/model-providers" && method === "GET") {
        return jsonResponse(modelProviders);
      }
      if (url === "/api/admin/model-configurations" && method === "GET") {
        return jsonResponse(modelConfigurations);
      }
      if (url === "/api/admin/model-configurations" && method === "POST") {
        const body = requestJson(init);
        const name = String(body.name);
        const providerId = String(body.provider_id);
        const credentialReference = String(body.credential_reference ?? body.api_key ?? "");
        const created = {
          id: modelConfigurations.length + 1,
          provider_id: providerId,
          name,
          model_name: String(body.model_name),
          endpoint: String(body.endpoint),
          credential_reference: credentialReference,
          default_parameters: requestRecord(body.default_parameters),
          enabled: typeof body.enabled === "boolean" ? body.enabled : true,
          health_status: "not_checked" as const,
          last_checked_at: null,
          last_error: null,
        };
        modelConfigurations.push(created);
        return jsonResponse(created, { status: 201 });
      }
      if (url.startsWith("/api/admin/model-configurations/") && method === "PATCH") {
        const configurationId = Number(url.split("/")[4]);
        const body = requestJson(init);
        const index = modelConfigurations.findIndex((configuration) => configuration.id === configurationId);
        if (index === -1) {
          return jsonResponse({}, { status: 404 });
        }
        const patch = { ...body };
        delete patch.api_key;
        modelConfigurations[index] = {
          ...modelConfigurations[index],
          ...patch,
          credential_reference: String(body.credential_reference ?? body.api_key ?? modelConfigurations[index].credential_reference),
          default_parameters: patch.default_parameters
            ? requestRecord(patch.default_parameters)
            : modelConfigurations[index].default_parameters,
        } as TestModelConfiguration;
        return jsonResponse(modelConfigurations[index]);
      }
      if (url.startsWith("/api/admin/model-configurations/") && method === "DELETE") {
        const configurationId = Number(url.split("/")[4]);
        const index = modelConfigurations.findIndex((configuration) => configuration.id === configurationId);
        if (index === -1) {
          return jsonResponse({}, { status: 404 });
        }
        const referencingAgents = agents.filter((agent) =>
          agent.default_model_configuration_id === configurationId ||
          agent.allowed_model_configuration_ids.includes(configurationId),
        );
        if (referencingAgents.length > 0) {
          return jsonResponse({
            detail: {
              message: "Model Configuration is used by Agents.",
              agents: referencingAgents.map((agent) => agent.name),
            },
          }, { status: 409 });
        }
        const [deletedConfiguration] = modelConfigurations.splice(index, 1);
        return jsonResponse(deletedConfiguration);
      }
      if (url.startsWith("/api/admin/model-configurations/") && url.endsWith("/health-check") && method === "POST") {
        const configurationId = Number(url.split("/")[4]);
        const index = modelConfigurations.findIndex((configuration) => configuration.id === configurationId);
        if (index === -1) {
          return jsonResponse({}, { status: 404 });
        }
        const hasCredential = modelConfigurations[index].credential_reference.trim().length > 0;
        modelConfigurations[index] = {
          ...modelConfigurations[index],
          health_status: hasCredential ? "healthy" : "unhealthy",
          last_checked_at: "2026-07-05T09:05:00+00:00",
          last_error: hasCredential ? null : "Model credential is not configured.",
        };
        return jsonResponse({
          configuration: modelConfigurations[index],
          status: modelConfigurations[index].health_status,
          checked_at: modelConfigurations[index].last_checked_at,
          message: modelConfigurations[index].last_error ?? "Model Configuration health check passed.",
        });
      }
      if (url === "/api/admin/mcp-servers" && method === "GET") {
        return jsonResponse(mcpServers);
      }
      if (url === "/api/admin/mcp-servers" && method === "POST") {
        const body = requestJson(init);
        const created = {
          id: mcpServers.length + 1,
          name: String(body.name),
          connection_type: String(body.connection_type ?? "sse"),
          url: String(body.url),
          header_secret_refs: Object.fromEntries(
            Object.entries(requestRecord(body.header_secret_refs))
              .map(([key, value]) => [key, String(value)]),
          ),
          timeout_seconds: typeof body.timeout_seconds === "number" ? body.timeout_seconds : 30,
          enabled: typeof body.enabled === "boolean" ? body.enabled : true,
          last_discovery_status: "not_run",
        };
        mcpServers.push(created);
        return jsonResponse(created, { status: 201 });
      }
      if (url === "/api/admin/mcp-servers/1/discover" && method === "POST") {
        mcpServers[0] = { ...mcpServers[0], last_discovery_status: "succeeded" };
        return jsonResponse(mcpServers[0]);
      }
      if (url === "/api/admin/mcp-servers/2/discover" && method === "POST") {
        mcpServers[1] = { ...mcpServers[1], last_discovery_status: "succeeded" };
        if (!mcpTools.some((tool) => tool.server_id === 2)) {
          mcpTools.push({
            id: 3,
            server_id: 2,
            tool_name: "query_dataset",
            description: "查询已登记数据集。",
            input_schema: { dataset: "string" },
          });
        }
        return jsonResponse(mcpServers[1]);
      }
      if (url === "/api/admin/mcp-servers/1/tools" && method === "GET") {
        return jsonResponse(mcpTools.filter((tool) => tool.server_id === 1));
      }
      if (url === "/api/admin/mcp-servers/2/tools" && method === "GET") {
        return jsonResponse(mcpTools.filter((tool) => tool.server_id === 2));
      }
      if (url === "/api/admin/agents/1/mcp-tool-authorizations" && method === "POST") {
        const body = requestJson(init);
        return jsonResponse({
          id: 1,
          agent_id: 1,
          server_id: body.server_id,
          tool_name: body.tool_name,
          enabled: body.enabled ?? true,
        }, { status: 201 });
      }
      if (url === "/api/admin/search-provider-configurations" && method === "GET") {
        return jsonResponse(searchProviders);
      }
      if (url === "/api/admin/search-provider-configurations/1" && method === "PATCH") {
        searchProviders[0] = { ...searchProviders[0], ...requestJson(init) };
        return jsonResponse(searchProviders[0]);
      }
      if (url === "/api/admin/page-read-provider-configurations" && method === "GET") {
        return jsonResponse(pageReadProviders);
      }
      if (url === "/api/admin/page-read-provider-configurations/1" && method === "PATCH") {
        pageReadProviders[0] = { ...pageReadProviders[0], ...requestJson(init) };
        return jsonResponse(pageReadProviders[0]);
      }
      if (url === "/api/workspace/agents" && method === "GET") {
        return jsonResponse(agents.map((agent) => ({
          agent,
          allowed_model_configurations: modelConfigurations.filter((configuration) =>
            agent.allowed_model_configuration_ids.includes(configuration.id),
          ),
        })));
      }
      if (url === "/api/conversations" && method === "GET") {
        return jsonResponse(workspaceConversations);
      }
      if (url === "/api/runs" && method === "GET") {
        return jsonResponse(workspaceRuns);
      }
      if (/^\/api\/conversations\/\d+\/run-attachments$/.test(url) && method === "POST") {
        const file = init?.body instanceof FormData ? init.body.get("file") : null;
        const filename = file instanceof File ? file.name : "attachment.md";
        const conversationId = Number(url.split("/")[3]);
        return jsonResponse({ id: 1, conversation_id: conversationId, filename, content_type: "text/markdown", size: 5, preview_type: "markdown" }, { status: 201 });
      }
      if (url === "/api/conversations/1" && method === "PATCH") {
        workspaceConversations = workspaceConversations.map((conversation) =>
          conversation.id === 1 ? { ...conversation, ...requestJson(init), updated_at: "刚刚" } : conversation,
        );
        return jsonResponse(workspaceConversations[0]);
      }
      if (url === "/api/conversations/1" && method === "DELETE") {
        const deleted = { ...workspaceConversations[0], deleted: true };
        workspaceConversations = workspaceConversations.filter((conversation) => conversation.id !== 1);
        return jsonResponse(deleted);
      }
      if (url === "/api/conversations/drafts" && method === "POST") {
        const body = requestJson(init);
        const conversationId = Math.max(...workspaceConversations.map((conversation) => conversation.id), 0) + 1;
        const created = {
          id: conversationId,
          title: String(body.title),
          agent: agents[0],
          selected_model_configuration_id: typeof body.selected_model_configuration_id === "number"
            ? body.selected_model_configuration_id
            : 1,
          status: "idle",
          updated_at: "刚刚",
          deleted: false,
          messages: [],
        };
        workspaceConversations = [created, ...workspaceConversations];
        return jsonResponse(created, { status: 201 });
      }
      if (/^\/api\/conversations\/\d+\/runs$/.test(url) && method === "POST") {
        const body = requestJson(init);
        const conversationId = Number(url.split("/")[3]);
        workspaceConversations = workspaceConversations.map((conversation) =>
          conversation.id === conversationId
            ? { ...conversation, status: "running", messages: [{ role: "user", content: String(body.message) }] }
            : conversation,
        );
        return jsonResponse({ id: conversationId, conversation_id: conversationId, owner_user_id: 1, status: "queued", user_message: String(body.message), assistant_message: null, process_summaries: [], error: null, worker_enqueued: true, status_events: ["queued"] }, { status: 201 });
      }
      if (url.startsWith("/api/copilotkit/agent/") && url.endsWith("/run") && method === "POST") {
        const body = requestJson(init);
        const forwardedProps = requestRecord(body.forwardedProps);
        const messages = Array.isArray(body.messages) ? body.messages : [];
        const latestUserMessage = [...messages].reverse().find((message) =>
          requestRecord(message).role === "user",
        );
        const content = requestRecord(latestUserMessage).content;
        const text = typeof content === "string"
          ? content
          : Array.isArray(content)
            ? content.map((part) => requestRecord(part).text).filter(Boolean).join("\n")
            : "";
        const selectedModelConfigurationId = typeof forwardedProps.selected_model_configuration_id === "number"
          ? forwardedProps.selected_model_configuration_id
          : 1;
        const forwardedConversationId = typeof forwardedProps.conversation_id === "number"
          ? forwardedProps.conversation_id
          : null;
        const conversationId = forwardedConversationId ?? Math.max(...workspaceConversations.map((conversation) => conversation.id), 0) + 1;
        const assistantMessage = `openai:gpt-5 handled ${text}`;
        const failedAssistantMessage = "运行未完成：Mock Agent Runtime failed.";
        const agentId = typeof forwardedProps.agent_id === "number" ? forwardedProps.agent_id : 1;
        const agent = agents.find((item) => item.id === agentId) ?? agents[0];

        const persistRunResult = (status: "completed" | "failed" = "completed") => {
          const persistedAssistantMessage = status === "failed" ? failedAssistantMessage : assistantMessage;
          const runError = status === "failed" ? "Mock Agent Runtime failed." : null;
          if (forwardedConversationId) {
            workspaceConversations = workspaceConversations.map((conversation) =>
              conversation.id === forwardedConversationId
                ? {
                    ...conversation,
                    status: "idle",
                    title: conversation.title === "新对话"
                      ? text.slice(0, 48) || "新对话"
                      : conversation.title,
                    updated_at: "刚刚",
                    messages: [
                      ...conversation.messages,
                      { role: "user", content: text },
                      { role: "assistant", content: persistedAssistantMessage },
                    ],
                  }
                : conversation,
            );
          } else {
            workspaceConversations = [
              {
                id: conversationId,
                title: text.slice(0, 48) || "新对话",
                agent,
                selected_model_configuration_id: selectedModelConfigurationId,
                status: "idle",
                updated_at: "刚刚",
                deleted: false,
                messages: [
                  { role: "user", content: text },
                  { role: "assistant", content: persistedAssistantMessage },
                ],
              },
              ...workspaceConversations,
            ];
          }
          workspaceRuns.unshift({
            id: Math.max(...workspaceRuns.map((run) => run.id), 0) + 1,
            conversation_id: conversationId,
            owner_user_id: 1,
            status,
            user_message: text,
            assistant_message: persistedAssistantMessage,
            process_summaries: [],
            error: runError,
            worker_enqueued: true,
            status_events: [status],
          });
        };

        if (text.includes("模拟运行失败")) {
          persistRunResult("failed");
          return sseResponse([
            { type: "RUN_STARTED", threadId: body.threadId, runId: body.runId, input: body },
            { type: "TEXT_MESSAGE_START", messageId: `test-run-${conversationId}-assistant-error`, role: "assistant" },
            { type: "TEXT_MESSAGE_CONTENT", messageId: `test-run-${conversationId}-assistant-error`, delta: failedAssistantMessage },
            { type: "TEXT_MESSAGE_END", messageId: `test-run-${conversationId}-assistant-error` },
            { type: "RUN_ERROR", message: "Mock Agent Runtime failed.", code: "AGENT_RUN_FAILED" },
          ]);
        }
        persistRunResult();
        return sseResponse([
          { type: "RUN_STARTED", threadId: body.threadId, runId: body.runId, input: body },
          { type: "TEXT_MESSAGE_START", messageId: `test-run-${conversationId}-assistant`, role: "assistant" },
          { type: "TEXT_MESSAGE_CONTENT", messageId: `test-run-${conversationId}-assistant`, delta: assistantMessage.slice(0, 14) },
          { type: "TEXT_MESSAGE_CONTENT", messageId: `test-run-${conversationId}-assistant`, delta: assistantMessage.slice(14) },
          { type: "TEXT_MESSAGE_END", messageId: `test-run-${conversationId}-assistant` },
          {
            type: "RUN_FINISHED",
            threadId: body.threadId,
            runId: body.runId,
            result: { conversationId, status: "completed" },
            outcome: { type: "success" },
          },
        ], { status: 200 });
      }
      if (url === "/api/runs/2/cancel" && method === "POST") {
        workspaceRuns[0] = { ...workspaceRuns[0], status: "cancelled", status_events: ["cancelled"] };
        workspaceConversations = workspaceConversations.map((conversation) =>
          conversation.id === 2 ? { ...conversation, status: "idle", updated_at: "刚刚" } : conversation,
        );
        return jsonResponse(workspaceRuns[0]);
      }
      if (url.startsWith("/api/artifacts/") && url.endsWith("/preview") && method === "GET") {
        const artifactId = Number(url.split("/")[3]);
        return jsonResponse(artifactPreviews[artifactId] ?? {}, artifactPreviews[artifactId] ? {} : { status: 404 });
      }
      if (url === "/api/admin/run-audit" && method === "GET") {
        return jsonResponse(runAuditList);
      }
      if (url === "/api/admin/run-audit/1" && method === "GET") {
        return jsonResponse({
          id: 1,
          conversation_id: 201,
          owner_user_id: 3,
          status: "running",
          error: null,
          user_message: "Start this conversation.",
          assistant_message: "正在处理。",
          process_summaries: ["智能体运行仍绑定在当前活跃会话中。"],
          capability_snapshot: {
            agent_id: 1,
            agent_instruction_snapshot: "Help the user complete work inside Minimalist Agent.",
            process_visibility: "standard",
            selected_model_configuration_id: 1,
            default_model_configuration_id: 1,
            allowed_model_configuration_ids: [1, 2],
            capability_policy: agents[0].capability_policy,
          },
          tool_calls: [
            { id: 1, tool_name: "search.web", status: "completed", error: null },
            { id: 2, tool_name: "page.read", status: "completed", error: null },
            { id: 3, tool_name: "sandbox.exec", status: "running", error: null },
          ],
          artifacts: [{ id: 1, filename: "brief.md", size: 128 }],
          events: [
            { sequence: 1, event_type: "run.status", data: { status: "running" } },
          ],
          full_trace_available: true,
          full_trace_retention_days: 90,
        });
      }
      if (url === "/api/admin/run-audit/2" && method === "GET") {
        return jsonResponse({
          id: 2,
          conversation_id: 118,
          owner_user_id: 4,
          status: "failed",
          error: "provider_error",
          user_message: "客户访谈提示词",
          assistant_message: null,
          process_summaries: ["搜索能力在写入产物前返回上游提供商错误。"],
          capability_snapshot: {
            agent_id: 2,
            agent_instruction_snapshot: "Research task.",
            process_visibility: "minimal",
            selected_model_configuration_id: 2,
            default_model_configuration_id: 2,
            allowed_model_configuration_ids: [2, 1],
            capability_policy: agents[1].capability_policy,
          },
          tool_calls: [
            { id: 4, tool_name: "search.web", status: "failed", error: "provider_error" },
          ],
          artifacts: [],
          events: [
            { sequence: 1, event_type: "run.status", data: { status: "created" } },
            { sequence: 2, event_type: "run.status", data: { status: "failed" } },
          ],
          full_trace_available: true,
          full_trace_retention_days: 90,
        });
      }
      if (url === "/api/admin/run-audit/1/full-trace" && method === "GET") {
        return jsonResponse({
          run_id: 1,
          retention_days: 90,
          trace: {
            workflow_name: "Agent workflow",
            model_name: "gpt-5.5",
            tool_name: "sandbox.exec",
          },
        });
      }
      if (url === "/api/admin/run-audit/2/full-trace" && method === "GET") {
        return jsonResponse({
          run_id: 2,
          retention_days: 90,
          trace: {
            error: "provider_error",
            provider: "Doubao Search Provider",
          },
        });
      }
      return jsonResponse({}, { status: 404 });
    }),
  );
});

vi.mock("@copilotkit/react-core/v2", async () => {
  const React = await import("react");
  const RenderCustomMessagesContext = React.createContext<any[]>([]);

  function contentText(content: unknown) {
    if (typeof content === "string") {
      return content;
    }
    if (Array.isArray(content)) {
      return content
        .map((part) => {
          if (part && typeof part === "object" && "text" in part) {
            return String((part as { text?: unknown }).text ?? "");
          }
          return "";
        })
        .filter(Boolean)
        .join("\n");
    }
    return "";
  }

  function parseSseEvents(text: string): Record<string, unknown>[] {
    return text
      .split(/\n\n/)
      .map((frame) =>
        frame
          .split(/\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n"),
      )
      .filter(Boolean)
      .map((data) => JSON.parse(data) as Record<string, unknown>);
  }

  function applyAgUiEvent(agent: any, event: Record<string, unknown>) {
    if (event.type === "RUN_STARTED") {
      const input = event.input && typeof event.input === "object"
        ? event.input as { messages?: unknown }
        : {};
      if (Array.isArray(input.messages)) {
        const existingIds = new Set(agent.messages.map((message: any) => message.id));
        const missingMessages = input.messages.filter((message: any) =>
          message && typeof message === "object" && typeof message.id === "string" && !existingIds.has(message.id),
        );
        if (missingMessages.length > 0) {
          agent.setMessages([...agent.messages, ...missingMessages]);
        }
      }
      return undefined;
    }

    if (event.type === "TEXT_MESSAGE_START") {
      const messageId = String(event.messageId);
      if (!agent.messages.some((message: any) => message.id === messageId)) {
        agent.setMessages([
          ...agent.messages,
          { id: messageId, role: event.role === "reasoning" ? "reasoning" : "assistant", content: "" },
        ]);
      }
      return undefined;
    }

    if (event.type === "TEXT_MESSAGE_CONTENT") {
      const messageId = String(event.messageId);
      const delta = typeof event.delta === "string" ? event.delta : "";
      agent.setMessages(agent.messages.map((message: any) =>
        message.id === messageId
          ? { ...message, content: `${typeof message.content === "string" ? message.content : ""}${delta}` }
          : message,
      ));
      return undefined;
    }

    if (event.type === "REASONING_MESSAGE_START") {
      const messageId = String(event.messageId);
      if (!agent.messages.some((message: any) => message.id === messageId)) {
        agent.setMessages([...agent.messages, { id: messageId, role: "reasoning", content: "" }]);
      }
      return undefined;
    }

    if (event.type === "REASONING_MESSAGE_CONTENT") {
      const messageId = String(event.messageId);
      const delta = typeof event.delta === "string" ? event.delta : "";
      agent.setMessages(agent.messages.map((message: any) =>
        message.id === messageId
          ? { ...message, content: `${typeof message.content === "string" ? message.content : ""}${delta}` }
          : message,
      ));
      return undefined;
    }

    if (event.type === "TOOL_CALL_START") {
      const toolCallId = String(event.toolCallId);
      const toolCallName = String(event.toolCallName ?? "tool");
      const hasToolCall = agent.messages.some((message: any) =>
        message.role === "assistant" && message.toolCalls?.some((toolCall: any) => toolCall.id === toolCallId),
      );
      if (!hasToolCall) {
        agent.setMessages([
          ...agent.messages,
          {
            id: toolCallId,
            role: "assistant",
            content: "",
            toolCalls: [{ id: toolCallId, type: "function", function: { name: toolCallName, arguments: "" } }],
          },
        ]);
      }
      return undefined;
    }

    if (event.type === "TOOL_CALL_ARGS") {
      const toolCallId = String(event.toolCallId);
      const delta = typeof event.delta === "string" ? event.delta : "";
      agent.setMessages(agent.messages.map((message: any) =>
        message.role === "assistant" && Array.isArray(message.toolCalls)
          ? {
              ...message,
              toolCalls: message.toolCalls.map((toolCall: any) =>
                toolCall.id === toolCallId
                  ? {
                      ...toolCall,
                      function: {
                        ...toolCall.function,
                        arguments: `${toolCall.function?.arguments ?? ""}${delta}`,
                      },
                    }
                  : toolCall,
              ),
            }
          : message,
      ));
      return undefined;
    }

    if (event.type === "TOOL_CALL_RESULT") {
      const messageId = String(event.messageId);
      if (!agent.messages.some((message: any) => message.id === messageId)) {
        agent.setMessages([
          ...agent.messages,
          {
            id: messageId,
            role: "tool",
            toolCallId: String(event.toolCallId),
            content: typeof event.content === "string" ? event.content : "",
          },
        ]);
      }
      return undefined;
    }

    return event.type === "RUN_FINISHED" ? event.result : undefined;
  }

  function attachmentType(file: File) {
    if (file.type.startsWith("image/")) {
      return "image";
    }
    if (file.type.startsWith("audio/")) {
      return "audio";
    }
    if (file.type.startsWith("video/")) {
      return "video";
    }
    return "document";
  }

  function isAcceptedFile(file: File, accept?: string) {
    if (!accept) {
      return true;
    }
    const fileName = file.name.toLowerCase();
    const fileType = file.type.toLowerCase();
    return accept.split(",").map((item) => item.trim().toLowerCase()).some((rule) => {
      if (!rule) {
        return false;
      }
      if (rule.startsWith(".")) {
        return fileName.endsWith(rule);
      }
      if (rule.endsWith("/*")) {
        return fileType.startsWith(rule.slice(0, -1));
      }
      return fileType === rule;
    });
  }

  return {
    CopilotKit: ({ children, credentials, headers, renderCustomMessages, runtimeUrl, useSingleEndpoint }: any) =>
      React.createElement(
        RenderCustomMessagesContext.Provider,
        { value: renderCustomMessages ?? [] },
        React.createElement(
          "div",
          {
            "data-authorization": headers?.Authorization ?? "",
            "data-credentials": credentials ?? "",
            "data-runtime-url": runtimeUrl ?? "",
            "data-testid": "copilotkit-provider",
            "data-use-single-endpoint": String(useSingleEndpoint),
          },
          children,
        ),
      ),
    CopilotChat: ({ attachments, className, labels }: any) =>
      React.createElement(
        "section",
        { "aria-label": "CopilotKit 对话面板", className },
        React.createElement("p", null, labels?.welcomeMessageText ?? "CopilotKit Chat"),
        React.createElement("textarea", {
          "aria-label": "消息",
          placeholder: labels?.chatInputPlaceholder ?? "询问当前工作台",
        }),
        attachments?.enabled
          ? React.createElement("input", {
              "aria-label": "运行附件",
              type: "file",
              onChange: async (event: any) => {
                const file = event.currentTarget.files?.[0];
                if (file && attachments.onUpload) {
                  await attachments.onUpload(file);
                }
              },
            })
          : null,
        React.createElement("button", { type: "button" }, "发送"),
      ),
    CopilotChatView: ({
      attachments,
      children,
      className,
      inputValue,
      isRunning,
      messages = [],
      onAddFile,
      onInputChange,
      onRemoveAttachment,
      onSelectSuggestion,
      onStop,
      onSubmitMessage,
      suggestions = [],
    }: any) => {
      const [localValue, setLocalValue] = React.useState("");
      const renderCustomMessages = React.useContext(RenderCustomMessagesContext);
      const value = inputValue ?? localValue;
      const setValue = onInputChange ?? setLocalValue;
      function renderCustomMessage(message: any, position: "before" | "after", index: number) {
        for (const renderer of renderCustomMessages) {
          const Component = renderer?.render;
          if (!Component) {
            continue;
          }
          const element = React.createElement(Component, {
            agentId: "default",
            message,
            messageIndex: index,
            messageIndexInRun: index,
            numberOfMessagesInRun: messages.length,
            position,
            runId: "test-copilot-run",
            stateSnapshot: undefined,
          });
          if (element) {
            return element;
          }
        }
        return null;
      }
      const messageView = React.createElement(
        "section",
        { "aria-label": "CopilotKit 消息列表" },
        messages.map((message: any, index: number) =>
          React.createElement(
            React.Fragment,
            { key: message.id },
            renderCustomMessage(message, "before", index),
            React.createElement(
              "article",
              { className: `message-row ${message.role}` },
              React.createElement("span", { className: "message-role" }, message.role === "user" ? "你" : "Assistant"),
              React.createElement("p", { className: "message-content" }, contentText(message.content)),
            ),
            renderCustomMessage(message, "after", index),
          ),
        ),
      );
      const suggestionView = React.createElement(
        "div",
        { "aria-label": "CopilotKit 建议" },
        suggestions.map((suggestion: any, index: number) =>
          React.createElement(
            "button",
            {
              key: `${suggestion.title}-${index}`,
              type: "button",
              onClick: () => onSelectSuggestion?.(suggestion, index),
            },
            suggestion.title,
          ),
        ),
      );
      const input = React.createElement(
        "form",
        {
          "aria-label": "CopilotKit 对话输入",
          onSubmit: (event: any) => {
            event.preventDefault();
            onSubmitMessage?.(value);
          },
        },
        attachments?.length
          ? React.createElement(
              "section",
              { "aria-label": "已添加上下文附件", className: "composer-attachment-list" },
              attachments.map((attachment: any) =>
                React.createElement(
                  "div",
                  { className: "composer-attachment-chip", key: attachment.id },
                  React.createElement("span", { className: "composer-attachment-meta" },
                    React.createElement("strong", null, attachment.filename),
                    React.createElement("span", null, attachment.metadata?.preview_type ?? attachment.type),
                  ),
                  React.createElement(
                    "button",
                    {
                      "aria-label": `移除附件 ${attachment.filename}`,
                      type: "button",
                      onClick: () => onRemoveAttachment?.(attachment.id),
                    },
                    "移除",
                  ),
                ),
              ),
            )
          : null,
        React.createElement("textarea", {
          "aria-label": "消息",
          placeholder: "询问当前工作台",
          value,
          onChange: (event: any) => setValue(event.currentTarget.value),
        }),
        React.createElement(
          "div",
          { className: "copilot-chat-actions" },
          React.createElement("button", { type: "button", onClick: onAddFile }, "添加上下文"),
          isRunning
            ? React.createElement("button", { type: "button", onClick: onStop }, "停止")
            : React.createElement("button", { disabled: !String(value).trim(), type: "submit" }, "发送"),
        ),
      );

      return React.createElement(
        "section",
        { "aria-label": "CopilotKit 对话面板", className },
        typeof children === "function"
          ? children({ input, messageView, suggestionView })
          : React.createElement(React.Fragment, null, messageView, suggestionView, input),
      );
    },
    UseAgentUpdate: {
      OnMessagesChanged: "OnMessagesChanged",
      OnRunStatusChanged: "OnRunStatusChanged",
      OnStateChanged: "OnStateChanged",
    },
    useAgent: ({ agentId = "default" } = {}) => {
      const [messages, setMessages] = React.useState<any[]>([]);
      const [isRunning, setIsRunning] = React.useState(false);
      const agentRef = React.useRef<any>(null);
      if (!agentRef.current) {
        const setAgentMessages = (nextMessages: any[] | ((currentMessages: any[]) => any[])) => {
          const currentAgentMessages = agentRef.current?.messages ?? [];
          const resolvedMessages = typeof nextMessages === "function"
            ? nextMessages(currentAgentMessages)
            : nextMessages;
          if (JSON.stringify(currentAgentMessages) === JSON.stringify(resolvedMessages)) {
            setMessages((currentMessages) => currentMessages);
            return;
          }
          agentRef.current.messages = resolvedMessages;
          setMessages((currentMessages) => {
            if (JSON.stringify(currentMessages) === JSON.stringify(resolvedMessages)) {
              return currentMessages;
            }
            return resolvedMessages;
          });
        };
        agentRef.current = {
          abortRun: () => setIsRunning(false),
          addMessage: (message: any) => setAgentMessages((currentMessages) => [...currentMessages, message]),
          agentId,
          messages: [],
          setMessages: setAgentMessages,
        };
      }
      agentRef.current.agentId = agentId;
      agentRef.current.isRunning = isRunning;
      agentRef.current.messages = messages;
      agentRef.current.__setIsRunning = setIsRunning;
      return { agent: agentRef.current };
    },
    useAttachments: ({ config }: any = {}) => {
      const [attachments, setAttachments] = React.useState<any[]>([]);
      const fileInputRef = React.useRef<HTMLInputElement | null>(null);
      const containerRef = React.useRef<HTMLDivElement | null>(null);
      async function processFiles(files: File[]) {
        for (const file of files) {
          if (!isAcceptedFile(file, config?.accept)) {
            config?.onUploadFailed?.({
              file,
              message: "附件类型不受支持。",
              reason: "file-invalid-type",
            });
            continue;
          }
          if (typeof config?.maxSize === "number" && file.size > config.maxSize) {
            config?.onUploadFailed?.({
              file,
              message: "附件超过大小限制。",
              reason: "file-too-large",
            });
            continue;
          }
          try {
            const source = config?.onUpload
              ? await config.onUpload(file)
              : { type: "data", value: "", mimeType: file.type || "application/octet-stream" };
            setAttachments((currentAttachments) => [
              ...currentAttachments,
              {
                id: `${file.name}-${currentAttachments.length + 1}`,
                filename: file.name,
                metadata: source.metadata,
                size: file.size,
                source,
                status: "ready",
                type: attachmentType(file),
              },
            ]);
          } catch (error) {
            config?.onUploadFailed?.({
              file,
              message: error instanceof Error ? error.message : "附件上传失败。",
              reason: "upload-failed",
            });
          }
        }
      }
      return {
        attachments,
        consumeAttachments: () => {
          const readyAttachments = attachments.filter((attachment) => attachment.status === "ready");
          setAttachments([]);
          return readyAttachments;
        },
        containerRef,
        dragOver: false,
        enabled: Boolean(config?.enabled),
        fileInputRef,
        handleDragLeave: vi.fn(),
        handleDragOver: vi.fn(),
        handleDrop: async (event: any) => {
          const files = Array.from(event.dataTransfer?.files ?? []) as File[];
          await processFiles(files);
        },
        handleFileUpload: async (event: any) => {
          const input = event.currentTarget;
          const files = Array.from(input.files ?? []) as File[];
          await processFiles(files);
          input.value = "";
        },
        processFiles,
        removeAttachment: (id: string) => {
          setAttachments((currentAttachments) => currentAttachments.filter((attachment) => attachment.id !== id));
        },
      };
    },
    useConfigureSuggestions: () => undefined,
    useCopilotKit: () => ({
      copilotkit: {
        runAgent: async ({ agent, forwardedProps }: any) => {
          agent.__setIsRunning?.(true);
          let result: unknown;
          try {
            const response = await fetch(`/api/copilotkit/agent/${agent.agentId ?? "default"}/run`, {
              method: "POST",
              body: JSON.stringify({
                context: [],
                forwardedProps,
                messages: agent.messages,
                runId: "test-copilot-run",
                state: {},
                threadId: agent.threadId ?? forwardedProps?.thread_id ?? "test-thread",
                tools: [],
              }),
            });
            if (!response.ok) {
              throw new Error("CopilotKit run failed.");
            }
            const events = parseSseEvents(await response.text());
            for (const event of events) {
              const eventResult = applyAgUiEvent(agent, event);
              if (event.type === "RUN_FINISHED") {
                result = eventResult;
              }
              await new Promise((resolve) => window.setTimeout(resolve, 0));
            }
            return { result, newMessages: [] };
          } finally {
            agent.__setIsRunning?.(false);
          }
        },
      },
    }),
    useDefaultRenderTool: () => undefined,
    useAgentContext: () => undefined,
    useFrontendTool: () => undefined,
    useSuggestions: () => ({
      clearSuggestions: vi.fn(),
      isLoading: false,
      reloadSuggestions: vi.fn(),
      suggestions: [
        { isLoading: false, message: "总结当前对话的结论和下一步。", title: "总结当前对话" },
        { isLoading: false, message: "基于当前上下文继续推进下一步。", title: "继续推进" },
      ],
    }),
  };
});
