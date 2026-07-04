/// <reference types="@testing-library/jest-dom/vitest" />
import * as matchers from "@testing-library/jest-dom/matchers";
import type { ReactNode } from "react";
import { beforeEach, expect, vi } from "vitest";

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

beforeEach(() => {
  window.localStorage.setItem("minimalist-agent:auth-token", "local-test-token");
  const accounts = [
    {
      id: 1,
      username: "lin.request",
      email: "lin.request@example.com",
      role: "user",
      status: "pending",
    },
    {
      id: 2,
      username: "mei.request",
      email: "mei.request@example.com",
      role: "user",
      status: "pending",
    },
    {
      id: 3,
      username: "wang.user",
      email: "wang.user@example.com",
      role: "admin",
      status: "enabled",
    },
    {
      id: 4,
      username: "old.contractor",
      email: "old.contractor@example.com",
      role: "user",
      status: "disabled",
    },
    {
      id: 5,
      username: "unknown.vendor",
      email: "unknown.vendor@example.com",
      role: "user",
      status: "rejected",
    },
  ];
  const agents = [
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
    { id: "openai", name: "OpenAI", endpoint_template: "https://api.openai.com/v1", recommended_models: ["gpt-5"] },
    { id: "deepseek", name: "DeepSeek", endpoint_template: "https://api.deepseek.com", recommended_models: ["deepseek-reasoner"] },
    { id: "minimax", name: "MiniMax", endpoint_template: "https://api.minimax.io/v1", recommended_models: ["MiniMax-M1"] },
    { id: "custom-openai-compatible", name: "Custom OpenAI-compatible endpoint", endpoint_template: "https://gateway.example/v1", recommended_models: [] },
  ];
  const modelConfigurations = [
    {
      id: 1,
      provider_id: "openai",
      name: "Primary",
      model_name: "gpt-5",
      endpoint: "https://api.openai.com/v1",
      credential_reference: "secret://models/openai-primary",
      default_parameters: { temperature: 0.3 },
      enabled: true,
    },
    {
      id: 2,
      provider_id: "deepseek",
      name: "Reasoner",
      model_name: "deepseek-reasoner",
      endpoint: "https://api.deepseek.com",
      credential_reference: "secret://models/deepseek-main",
      default_parameters: { temperature: 0.2 },
      enabled: true,
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
    },
  ];
  const mcpServers = [
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
  const mcpTools = [
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

  function jsonResponse(body: unknown, init: ResponseInit = {}) {
    return Promise.resolve({
      ok: init.status === undefined || init.status < 400,
      status: init.status ?? 200,
      json: async () => body,
    });
  }

  function requestJson(init?: RequestInit) {
    return init?.body && typeof init.body === "string"
      ? JSON.parse(init.body) as Record<string, unknown>
      : {};
  }

  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url === "/api/auth/me") {
        return jsonResponse({
          id: 1,
          username: "test",
          email: "test@example.com",
          role: "admin",
          status: "enabled",
        });
      }
      if (url === "/api/admin/accounts" && method === "GET") {
        return jsonResponse(accounts);
      }
      if (url === "/api/admin/accounts/1/approve" && method === "POST") {
        return jsonResponse({ ...accounts[0], status: "enabled" });
      }
      if (url === "/api/admin/accounts/1/reject" && method === "POST") {
        return jsonResponse({ ...accounts[0], status: "rejected" });
      }
      if (url === "/api/admin/accounts/1/disable" && method === "POST") {
        return jsonResponse({ ...accounts[0], status: "disabled" });
      }
      if (url === "/api/admin/agents" && method === "GET") {
        return jsonResponse(agents);
      }
      if (url === "/api/admin/agents/1/disable" && method === "POST") {
        return jsonResponse({ ...agents[0], status: "disabled" });
      }
      if (url === "/api/admin/agents/1/enable" && method === "POST") {
        return jsonResponse({ ...agents[0], status: "enabled" });
      }
      if (url === "/api/admin/agents/1/retire" && method === "POST") {
        return jsonResponse({ ...agents[0], status: "retired" });
      }
      if (url === "/api/admin/model-providers" && method === "GET") {
        return jsonResponse(modelProviders);
      }
      if (url === "/api/admin/model-configurations" && method === "GET") {
        return jsonResponse(modelConfigurations);
      }
      if (url === "/api/admin/mcp-servers" && method === "GET") {
        return jsonResponse(mcpServers);
      }
      if (url === "/api/admin/mcp-servers/1/tools" && method === "GET") {
        return jsonResponse(mcpTools);
      }
      if (url === "/api/admin/mcp-servers/2/tools" && method === "GET") {
        return jsonResponse([]);
      }
      if (url === "/api/admin/search-provider-configurations" && method === "GET") {
        return jsonResponse(searchProviders);
      }
      if (url === "/api/admin/search-provider-configurations/1" && method === "PATCH") {
        return jsonResponse({ ...searchProviders[0], ...requestJson(init) });
      }
      if (url === "/api/admin/page-read-provider-configurations" && method === "GET") {
        return jsonResponse(pageReadProviders);
      }
      if (url === "/api/admin/page-read-provider-configurations/1" && method === "PATCH") {
        return jsonResponse({ ...pageReadProviders[0], ...requestJson(init) });
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
            model_name: "gpt-5",
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

  return {
    CopilotKit: ({ children }: { children: ReactNode }) =>
      React.createElement(React.Fragment, null, children),
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
    useAgentContext: () => undefined,
    useFrontendTool: () => undefined,
  };
});
