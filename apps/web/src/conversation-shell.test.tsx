import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { App } from "./App";

describe("Agent Conversation workspace", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the WorkBuddy-like conversation shell as the primary workspace", () => {
    render(<App />);

    expect(screen.getByRole("button", { name: "新建对话" })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "搜索对话" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "市场调研" })).toBeInTheDocument();
    expect(within(screen.getByLabelText("最近对话")).getByText("默认智能体")).toBeInTheDocument();
    expect(within(screen.getByLabelText("运行配置")).getByLabelText("智能体选择")).toHaveDisplayValue("默认智能体");
    expect(within(screen.getByLabelText("运行配置")).getByLabelText("模型选择")).toHaveDisplayValue("OpenAI GPT-5");
    expect(screen.getByRole("region", { name: "CopilotKit 对话面板" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("向当前智能体发送任务")).toBeInTheDocument();
    expect(screen.getByText("当前会话由 CopilotKit 渲染。运行与权限由后端治理。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重命名" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "删除" })).toBeInTheDocument();
  });

  it("keeps the workspace seam visible through the sidebar, stream banner, CopilotKit chat, and preview rail", () => {
    render(<App />);

    expect(screen.getByLabelText("智能体会话")).toBeInTheDocument();
    expect(screen.getByLabelText("对话消息")).toBeInTheDocument();
    expect(screen.getByLabelText("运行配置")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "CopilotKit 对话面板" })).toBeInTheDocument();
    expect(screen.getByLabelText("检查面板")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "运行审计" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "管理员控制台" }).length).toBeGreaterThan(0);
    expect(screen.getByLabelText("搜索对话")).toBeInTheDocument();
    expect(screen.getByLabelText("运行附件")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "制品预览" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "运行上下文" })).toBeInTheDocument();
  });
});
