import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach } from "vitest";
import { describe, expect, it } from "vitest";

import { App } from "./app/app";

describe("App", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    window.history.pushState({}, "", "/");
  });

  it("renders the Agent Platform shell", () => {
    window.history.pushState({}, "", "/app/conversations");
    render(<App />);

    expect(screen.getByRole("heading", { name: "Minimalist Agent" })).toBeInTheDocument();
    expect(screen.getByText("对话工作台")).toBeInTheDocument();
  });

  it("uploads a run attachment through the embedded CopilotKit chat", async () => {
    const user = userEvent.setup();
    window.history.pushState({}, "", "/app/conversations");
    render(<App />);

    await user.click(screen.getAllByRole("button", { name: "新建对话" })[0]);
    await user.upload(
      within(screen.getByLabelText("对话输入区")).getByLabelText("添加上下文"),
      new File(["hello"], "brief.md", { type: "text/markdown" }),
    );

    expect(await screen.findByText("hello")).toBeInTheDocument();
    expect(within(screen.getByLabelText("已添加上下文附件")).getByText("brief.md")).toBeInTheDocument();
    expect(within(screen.getByLabelText("制品预览")).getByText("brief.md")).toBeInTheDocument();
    expect(within(screen.getByLabelText("制品预览")).getByText("markdown")).toBeInTheDocument();
  });

  it("delegates the center conversation surface to CopilotKit", () => {
    window.history.pushState({}, "", "/app/conversations");
    render(<App />);
    const messageStream = screen.getByLabelText("对话消息");

    expect(within(messageStream).getByRole("region", { name: "CopilotKit 对话面板" })).toBeInTheDocument();
    expect(within(messageStream).getByText("当前会话由 CopilotKit 渲染。运行与权限由后端治理。")).toBeInTheDocument();
    expect(within(messageStream).getByPlaceholderText("向当前智能体发送消息")).toBeInTheDocument();
  });

  it("keeps model selection in the composer and tool authority out of user controls", () => {
    window.history.pushState({}, "", "/app/conversations");
    render(<App />);
    const composer = screen.getByLabelText("对话输入区");

    expect(within(composer).getByRole("combobox", { name: "模型选择" })).toBeInTheDocument();
    expect(within(composer).getByText("能力边界由管理员策略决定")).toBeInTheDocument();
    expect(screen.queryByLabelText("运行配置")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "智能体选择" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Enable Search Capability")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Enable Sandbox Capability")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Enable MCP Tools")).not.toBeInTheDocument();
  });
});
