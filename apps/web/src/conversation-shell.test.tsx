import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "./app/app";

async function renderLoadedWorkspace() {
  render(<App />);
  await screen.findByRole("heading", { name: "市场调研" });
}

function getContextFileInput(): HTMLInputElement {
  const input = screen.getAllByLabelText("添加上下文").find((element): element is HTMLInputElement =>
    element instanceof HTMLInputElement && element.type === "file",
  );
  if (!input) {
    throw new Error("Context file input not found.");
  }
  return input;
}

describe("Agent Conversation workspace", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    window.history.pushState({}, "", "/");
  });

  it("renders the WorkBuddy-like conversation shell as the primary workspace", async () => {
    await renderLoadedWorkspace();

    expect(screen.getByRole("button", { name: "新建对话" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "收起侧边栏" })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "搜索对话" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "市场调研" })).toBeInTheDocument();
    expect(
      within(screen.getByLabelText("最近对话")).getByRole("button", { name: /市场调研.*Default Agent.*空闲/ }),
    ).toBeInTheDocument();
    expect(screen.queryByText("新任务")).not.toBeInTheDocument();
    expect(screen.queryByText("新办公任务")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("运行配置")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "智能体选择" })).not.toBeInTheDocument();
    expect(
      within(screen.getByLabelText("对话输入区")).getByRole("combobox", { name: "模型选择" }),
    ).toBeInTheDocument();
    expect(screen.getAllByLabelText("CopilotKit 对话面板").length).toBeGreaterThan(0);
    expect(screen.getByRole("form", { name: "CopilotKit 对话输入" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("询问当前工作台")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重命名" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "删除" })).toBeInTheDocument();
    expect(screen.queryByLabelText("文件预览")).not.toBeInTheDocument();
  });

  it("keeps the default workspace focused on the sidebar and conversation", async () => {
    await renderLoadedWorkspace();

    expect(screen.getByLabelText("智能体会话")).toBeInTheDocument();
    expect(screen.getByLabelText("对话消息")).toBeInTheDocument();
    expect(screen.getByLabelText("对话输入区")).toBeInTheDocument();
    expect(screen.getByRole("form", { name: "CopilotKit 对话输入" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "打开账号菜单" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /消息通知/ })).toBeInTheDocument();
    expect(screen.getByLabelText("搜索对话")).toBeInTheDocument();
    expect(within(screen.getByLabelText("对话输入区")).getByLabelText("添加上下文")).toBeInTheDocument();
    expect(screen.queryByLabelText("文件预览")).not.toBeInTheDocument();
  });

  it("shows the bootstrapped gpt-5.5 model and uses it for new conversations", async () => {
    const user = userEvent.setup();
    await renderLoadedWorkspace();

    await user.click(screen.getByRole("button", { name: "新建对话" }));
    const composer = screen.getByLabelText("对话输入区");
    expect(within(composer).getByRole("combobox", { name: "模型选择" })).toHaveTextContent("gpt-5.5 / gpt-5.5");

    await user.type(within(screen.getByRole("form", { name: "CopilotKit 对话输入" })).getByLabelText("消息"), "验证默认模型。");
    await user.click(within(screen.getByRole("form", { name: "CopilotKit 对话输入" })).getByRole("button", { name: "发送" }));

    expect(await screen.findByRole("heading", { name: "验证默认模型。" })).toBeInTheDocument();
    expect(within(screen.getByLabelText("对话输入区")).getByRole("combobox", { name: "模型选择" })).toHaveTextContent("gpt-5.5 / gpt-5.5");
  });

  it("shows the authenticated account and groups account actions in the avatar menu", async () => {
    const user = userEvent.setup();
    await renderLoadedWorkspace();

    const accountCenter = screen.getByLabelText("账号中心");
    await user.click(within(accountCenter).getByRole("button", { name: "打开账号菜单" }));
    const accountMenu = within(accountCenter).getByRole("dialog", { name: "账号菜单" });

    expect(within(accountMenu).getByText("wang.user")).toBeInTheDocument();
    expect(within(accountMenu).getByText("wang.user@example.com")).toBeInTheDocument();
    expect(within(accountMenu).getByRole("link", { name: "个人信息维护" })).toHaveAttribute("href", "/account-settings");
    expect(within(accountMenu).getByRole("link", { name: "运行审计" })).toHaveAttribute("href", "/admin/run-audit");
    expect(within(accountMenu).getByRole("link", { name: "管理控制台" })).toHaveAttribute("href", "/admin");
    expect(within(accountMenu).getByRole("button", { name: "退出登录" })).toBeInTheDocument();
    expect(screen.queryByText("oil")).not.toBeInTheDocument();
  });

  it("hides administrator entry points for non-admin accounts", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        if (url === "/api/auth/me") {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              id: 8,
              username: "product.user",
              email: "product.user@example.com",
              role: "user",
              status: "enabled",
            }),
          });
        }
        if (url === "/api/workspace/agents" && method === "GET") {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => [
              {
                agent: {
                  id: 1,
                  name: "Default Agent",
                  description: "默认智能体。",
                  icon: "DA",
                  status: "enabled",
                  is_default: true,
                  instruction: "Help.",
                  process_visibility: "standard",
                  default_model_configuration_id: null,
                  allowed_model_configuration_ids: [],
                  capability_policy: {
                    mcp_server_ids: [],
                    sandbox_enabled: false,
                    search_enabled: false,
                    page_read_enabled: false,
                  },
                },
                allowed_model_configurations: [],
              },
            ],
          });
        }
        if (url === "/api/conversations" && method === "GET") {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => [],
          });
        }
        if (url === "/api/runs" && method === "GET") {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => [],
          });
        }
        return Promise.resolve({
          ok: false,
          status: 404,
          json: async () => ({ detail: "Not found." }),
        });
      }),
    );

    render(<App />);

    const user = userEvent.setup();
    const accountCenter = await screen.findByLabelText("账号中心");
    await user.click(within(accountCenter).getByRole("button", { name: "打开账号菜单" }));
    const accountMenu = within(accountCenter).getByRole("dialog", { name: "账号菜单" });

    expect(within(accountMenu).getByText("product.user")).toBeInTheDocument();
    expect(within(accountMenu).getByRole("link", { name: "个人信息维护" })).toBeInTheDocument();
    expect(within(accountMenu).queryByRole("link", { name: "运行审计" })).not.toBeInTheDocument();
    expect(within(accountMenu).queryByRole("link", { name: "管理控制台" })).not.toBeInTheDocument();
  });

  it("logs out from the grouped account actions", async () => {
    const user = userEvent.setup();
    await renderLoadedWorkspace();

    await user.click(within(screen.getByLabelText("账号中心")).getByRole("button", { name: "打开账号菜单" }));
    await user.click(within(screen.getByLabelText("账号中心")).getByRole("button", { name: "退出登录" }));

    expect(window.localStorage.getItem("minimalist-agent:auth-token")).toBeNull();
    expect(window.location.pathname).toBe("/login");
    expect(await screen.findByRole("heading", { name: "登录" })).toBeInTheDocument();
  });

  it("collapses and restores the sidebar without leaving the conversation", async () => {
    const user = userEvent.setup();
    await renderLoadedWorkspace();

    await user.click(screen.getByRole("button", { name: "收起侧边栏" }));

    expect(screen.getByRole("button", { name: "展开侧边栏" })).toBeInTheDocument();
    expect(screen.getByLabelText("智能体会话")).toHaveAttribute("data-collapsed", "true");
    expect(screen.getByLabelText("对话消息")).toBeInTheDocument();
    expect(screen.getByLabelText("对话输入区")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "展开侧边栏" }));

    expect(screen.getByRole("button", { name: "收起侧边栏" })).toBeInTheDocument();
    expect(screen.getByLabelText("智能体会话")).toHaveAttribute("data-collapsed", "false");
  });

  it("opens generated artifact cards in the file preview rail while keeping the conversation active", async () => {
    const user = userEvent.setup();
    await renderLoadedWorkspace();

    expect(screen.queryByLabelText("文件预览")).not.toBeInTheDocument();

    await user.click(within(screen.getByLabelText("对话消息")).getAllByRole("button", { name: "打开制品 brief.md" })[0]);

    const artifactPreview = screen.getByLabelText("文件预览");
    expect(within(artifactPreview).getByRole("heading", { name: "brief.md" })).toBeInTheDocument();
    expect(within(artifactPreview).getByRole("heading", { name: "简报" })).toBeInTheDocument();
    expect(within(artifactPreview).getByText("alpha")).toBeInTheDocument();
    expect(within(artifactPreview).getByText("生成时间：刚刚")).toBeInTheDocument();
    const artifactToolbar = within(artifactPreview).getByRole("toolbar", { name: "制品操作" });
    expect(within(artifactToolbar).getByRole("button", { name: "复制 brief.md" })).toBeInTheDocument();
    expect(within(artifactToolbar).getByRole("link", { name: "下载 brief.md" })).toBeInTheDocument();
    expect(within(artifactToolbar).getByRole("link", { name: "打开独立预览 brief.md" })).toBeInTheDocument();
    expect(screen.getByRole("form", { name: "CopilotKit 对话输入" })).toBeInTheDocument();
    expect(screen.getByLabelText("对话输入区")).toBeInTheDocument();

    await user.click(within(artifactPreview).getByRole("button", { name: "关闭文件预览" }));
    expect(screen.queryByLabelText("文件预览")).not.toBeInTheDocument();
  });

  it("switches artifact preview between readable content and metadata", async () => {
    const user = userEvent.setup();
    await renderLoadedWorkspace();

    await user.click(within(screen.getByLabelText("对话消息")).getAllByRole("button", { name: "打开制品 brief.md" })[0]);
    const artifactPreview = screen.getByLabelText("文件预览");

    await user.click(within(artifactPreview).getByRole("button", { name: "元数据" }));

    expect(within(artifactPreview).getByText("文件名")).toBeInTheDocument();
    expect(within(artifactPreview).getByText("brief.md")).toBeInTheDocument();
    expect(within(artifactPreview).getByText("类型")).toBeInTheDocument();
    expect(within(artifactPreview).getByText("markdown")).toBeInTheDocument();
    expect(within(artifactPreview).getByText("大小")).toBeInTheDocument();
    expect(within(artifactPreview).getByText("15 B")).toBeInTheDocument();
    expect(within(artifactPreview).getByText("创建时间")).toBeInTheDocument();
    expect(within(artifactPreview).getByText("刚刚")).toBeInTheDocument();
    expect(within(artifactPreview).getByText("来源对话")).toBeInTheDocument();
    expect(within(artifactPreview).getByText("市场调研")).toBeInTheDocument();

    await user.click(within(artifactPreview).getByRole("button", { name: "预览" }));

    expect(within(artifactPreview).getByRole("heading", { name: "简报" })).toBeInTheDocument();
    expect(within(artifactPreview).getByText("alpha")).toBeInTheDocument();
  });

  it("renders JSON artifacts as table-like previews", async () => {
    const user = userEvent.setup();
    await renderLoadedWorkspace();

    await user.click(within(screen.getByLabelText("对话消息")).getByRole("button", { name: "打开制品 metrics.json" }));

    const artifactPreview = screen.getByLabelText("文件预览");
    expect(within(artifactPreview).getByRole("heading", { name: "metrics.json" })).toBeInTheDocument();
    const jsonTable = within(artifactPreview).getByRole("table", { name: "JSON 制品预览" });
    expect(within(jsonTable).getByText("coverage")).toBeInTheDocument();
    expect(within(jsonTable).getByText("82")).toBeInTheDocument();
    expect(within(jsonTable).getByText("latency_ms")).toBeInTheDocument();
    expect(within(jsonTable).getByText("184")).toBeInTheDocument();
    expect(artifactPreview).not.toHaveTextContent("{");
  });

  it("renders code artifacts in a dedicated code preview", async () => {
    const user = userEvent.setup();
    await renderLoadedWorkspace();

    await user.click(within(screen.getByLabelText("对话消息")).getByRole("button", { name: "打开制品 analysis.ts" }));

    const artifactPreview = screen.getByLabelText("文件预览");
    expect(within(artifactPreview).getByRole("heading", { name: "analysis.ts" })).toBeInTheDocument();
    const codePreview = within(artifactPreview).getByRole("region", { name: "代码制品预览" });
    expect(codePreview).toHaveTextContent("export function summarize");
    expect(codePreview).toHaveTextContent("return items.length");
  });

  it("renders HTML artifacts in a sandboxed preview frame", async () => {
    const user = userEvent.setup();
    await renderLoadedWorkspace();

    await user.click(within(screen.getByLabelText("对话消息")).getByRole("button", { name: "打开制品 demo.html" }));

    const artifactPreview = screen.getByLabelText("文件预览");
    expect(within(artifactPreview).getByRole("heading", { name: "demo.html" })).toBeInTheDocument();
    const htmlPreview = within(artifactPreview).getByTitle("HTML 制品预览");
    expect(htmlPreview).toHaveAttribute("sandbox");
    expect(htmlPreview).toHaveAttribute("srcDoc", expect.stringContaining("Agent Workspace Demo"));
  });

  it("renders plain text artifacts in a readable text preview", async () => {
    const user = userEvent.setup();
    await renderLoadedWorkspace();

    await user.click(within(screen.getByLabelText("对话消息")).getByRole("button", { name: "打开制品 notes.txt" }));

    const artifactPreview = screen.getByLabelText("文件预览");
    expect(within(artifactPreview).getByRole("heading", { name: "notes.txt" })).toBeInTheDocument();
    const textPreview = within(artifactPreview).getByRole("region", { name: "纯文本制品预览" });
    expect(textPreview).toHaveTextContent("调研笔记");
    expect(textPreview).toHaveTextContent("保留给下一轮追问的上下文。");
  });

  it("renders image artifacts as inline media previews", async () => {
    const user = userEvent.setup();
    await renderLoadedWorkspace();

    await user.click(within(screen.getByLabelText("对话消息")).getByRole("button", { name: "打开制品 diagram.png" }));

    const artifactPreview = screen.getByLabelText("文件预览");
    expect(within(artifactPreview).getByRole("heading", { name: "diagram.png" })).toBeInTheDocument();
    const imagePreview = within(artifactPreview).getByRole("img", { name: "图像制品预览：diagram.png" });
    expect(imagePreview).toHaveAttribute("src", expect.stringContaining("data:image/png;base64,"));
  });

  it("renders PDF artifacts in an inline document preview frame", async () => {
    const user = userEvent.setup();
    await renderLoadedWorkspace();

    await user.click(within(screen.getByLabelText("对话消息")).getByRole("button", { name: "打开制品 report.pdf" }));

    const artifactPreview = screen.getByLabelText("文件预览");
    expect(within(artifactPreview).getByRole("heading", { name: "report.pdf" })).toBeInTheDocument();
    const pdfPreview = within(artifactPreview).getByTitle("PDF 制品预览：report.pdf");
    expect(pdfPreview).toHaveAttribute("src", expect.stringContaining("data:application/pdf;base64,"));
  });

  it("shows uploaded run attachments as removable composer context chips", async () => {
    const user = userEvent.setup();
    await renderLoadedWorkspace();

    await user.upload(
      getContextFileInput(),
      new File(["# notes"], "notes.md", { type: "text/markdown" }),
    );

    const composer = screen.getByLabelText("对话输入区");
    const attachmentList = await within(composer).findByLabelText("已添加上下文附件");
    expect(within(attachmentList).getByText("notes.md")).toBeInTheDocument();
    expect(within(attachmentList).getByText("markdown")).toBeInTheDocument();
    expect(
      within(attachmentList).getByRole("button", { name: "移除附件 notes.md" }),
    ).toBeInTheDocument();

    await user.click(within(attachmentList).getByRole("button", { name: "移除附件 notes.md" }));

    expect(within(composer).queryByLabelText("已添加上下文附件")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("文件预览")).not.toBeInTheDocument();
  });

  it("fills the composer when a CopilotKit suggestion is selected", async () => {
    const user = userEvent.setup();
    await renderLoadedWorkspace();

    await user.click(within(screen.getByLabelText("CopilotKit 建议")).getByRole("button", { name: "继续推进" }));

    expect(within(screen.getByRole("form", { name: "CopilotKit 对话输入" })).getByLabelText("消息")).toHaveValue(
      "基于当前上下文继续推进下一步。",
    );
  });

  it("surfaces upload failure when draft conversations do not yet have backend storage", async () => {
    const user = userEvent.setup();
    await renderLoadedWorkspace();

    await user.click(screen.getByRole("button", { name: "新建对话" }));
    await user.upload(
      getContextFileInput(),
      new File(["# notes"], "draft-notes.md", { type: "text/markdown" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("请先发送第一条消息创建对话，再添加上下文附件。");
    expect(within(screen.getByLabelText("对话输入区")).queryByLabelText("已添加上下文附件")).not.toBeInTheDocument();
  });

  it("rejects unsupported CopilotKit attachment types before backend upload", async () => {
    await renderLoadedWorkspace();

    fireEvent.change(getContextFileInput(), {
      target: {
        files: [new File(["zip"], "archive.zip", { type: "application/zip" })],
      },
    });

    expect(await screen.findByRole("alert")).toHaveTextContent("附件类型不受支持。");
    expect(within(screen.getByLabelText("对话输入区")).queryByLabelText("已添加上下文附件")).not.toBeInTheDocument();
  });

  it("rejects oversized CopilotKit attachments before backend upload", async () => {
    const user = userEvent.setup();
    await renderLoadedWorkspace();

    await user.upload(
      getContextFileInput(),
      new File([new Uint8Array(20 * 1024 * 1024 + 1)], "large.md", { type: "text/markdown" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("附件超过大小限制。");
    expect(within(screen.getByLabelText("对话输入区")).queryByLabelText("已添加上下文附件")).not.toBeInTheDocument();
  });

  it("exposes CopilotKit stop control for active backend runs", async () => {
    const user = userEvent.setup();
    await renderLoadedWorkspace();

    await user.click(within(screen.getByLabelText("最近对话")).getByRole("button", { name: /竞品分析.*运行中/ }));
    await user.click(within(screen.getByRole("form", { name: "CopilotKit 对话输入" })).getByRole("button", { name: "停止" }));

    expect(await screen.findByText("运行：已停止")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "停止运行" })).toBeDisabled();
  });

  it("opens a command palette for quick creation and recent artifacts", async () => {
    const user = userEvent.setup();
    await renderLoadedWorkspace();

    await user.click(screen.getByRole("button", { name: "搜索对话、运行或制品 ⌘ K" }));

    const commandPalette = screen.getByRole("dialog", { name: "命令面板" });
    expect(within(commandPalette).getByRole("searchbox", { name: "命令面板搜索" })).toBeInTheDocument();
    expect(within(commandPalette).getByText("快捷创建")).toBeInTheDocument();
    expect(within(commandPalette).getByText("最近对话")).toBeInTheDocument();
    expect(within(commandPalette).getByText("最近制品")).toBeInTheDocument();

    await user.click(within(commandPalette).getByRole("button", { name: "新建对话" }));
    expect(screen.getByRole("heading", { name: "新对话" })).toBeInTheDocument();

    await user.keyboard("{Control>}k{/Control}");
    const reopenedPalette = screen.getByRole("dialog", { name: "命令面板" });
    await user.click(within(reopenedPalette).getByRole("button", { name: "打开制品 brief.md" }));

    expect(screen.getByRole("heading", { name: "市场调研" })).toBeInTheDocument();
    expect(within(screen.getByLabelText("文件预览")).getByRole("heading", { name: "brief.md" })).toBeInTheDocument();
  });

  it("opens recent runs from the command palette", async () => {
    const user = userEvent.setup();
    await renderLoadedWorkspace();

    await user.click(screen.getByRole("button", { name: "搜索对话、运行或制品 ⌘ K" }));

    const commandPalette = screen.getByRole("dialog", { name: "命令面板" });
    expect(within(commandPalette).getByText("最近运行")).toBeInTheDocument();

    await user.click(within(commandPalette).getByRole("button", { name: "打开运行 Run 2" }));

    expect(screen.getByRole("heading", { name: "竞品分析" })).toBeInTheDocument();
    expect(screen.queryByLabelText("文件预览")).not.toBeInTheDocument();
  });

  it("surfaces running conversations with an enabled stop action and matching run context", async () => {
    const user = userEvent.setup();
    await renderLoadedWorkspace();

    await user.click(within(screen.getByLabelText("最近对话")).getByRole("button", { name: /竞品分析.*运行中/ }));

    expect(screen.getByRole("heading", { name: "竞品分析" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "停止运行" })).toBeEnabled();
    expect(within(screen.getByLabelText("最近对话")).getByText("运行中")).toBeInTheDocument();

    expect(screen.queryByLabelText("文件预览")).not.toBeInTheDocument();
  });

  it("surfaces failed conversations with recovery guidance in the run context", async () => {
    const user = userEvent.setup();
    await renderLoadedWorkspace();

    await user.click(within(screen.getByLabelText("最近对话")).getByRole("button", { name: /行业报告.*失败/ }));

    expect(screen.getByRole("heading", { name: "行业报告" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "停止运行" })).toBeDisabled();
    expect(screen.getByText("运行：失败")).toBeInTheDocument();

    expect(screen.getByText("模型网关超时，运行未完成。可重新运行或调整输入。")).toBeInTheDocument();
  });

  it("surfaces completed conversations with completion time and artifact shortcut", async () => {
    const user = userEvent.setup();
    await renderLoadedWorkspace();

    await user.click(within(screen.getByLabelText("最近对话")).getByRole("button", { name: /品牌简报.*已完成/ }));

    expect(screen.getByRole("heading", { name: "品牌简报", level: 2 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "停止运行" })).toBeDisabled();
    expect(screen.getByText("运行：已完成")).toBeInTheDocument();

    await user.click(within(screen.getByLabelText("对话消息")).getByRole("button", { name: "打开制品 brand-brief.md" }));

    expect(within(screen.getByLabelText("文件预览")).getByRole("heading", { name: "brand-brief.md" })).toBeInTheDocument();
    expect(within(screen.getByLabelText("文件预览")).getByRole("heading", { name: "品牌简报" })).toBeInTheDocument();
  });

  it("surfaces cancelled conversations while preserving existing outputs", async () => {
    const user = userEvent.setup();
    await renderLoadedWorkspace();

    await user.click(within(screen.getByLabelText("最近对话")).getByRole("button", { name: /资料整理.*已停止/ }));

    expect(screen.getByRole("heading", { name: "资料整理" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "停止运行" })).toBeDisabled();
    expect(screen.getByText("运行：已停止")).toBeInTheDocument();
    expect(within(screen.getByLabelText("对话消息")).getByRole("button", { name: "打开制品 partial-notes.md" })).toBeInTheDocument();

    await user.click(within(screen.getByLabelText("对话消息")).getByRole("button", { name: "打开制品 partial-notes.md" }));

    expect(within(screen.getByLabelText("文件预览")).getByRole("heading", { name: "partial-notes.md" })).toBeInTheDocument();
    expect(within(screen.getByLabelText("文件预览")).getByText("已保留的中间输出：材料索引、摘要和待确认问题。")).toBeInTheDocument();
  });
});
