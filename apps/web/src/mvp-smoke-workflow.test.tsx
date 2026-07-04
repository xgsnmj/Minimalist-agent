import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { App } from "./App";

describe("MVP smoke workflow surface", () => {
  it("keeps the primary conversation, artifact, cancellation, and admin audit entry points visible", () => {
    render(<App />);

    const conversationSidebar = screen.getByLabelText("智能体会话");
    const messageStream = screen.getByLabelText("对话消息");

    expect(within(conversationSidebar).getByRole("button", { name: "新建对话" })).toBeInTheDocument();
    expect(within(conversationSidebar).getByRole("link", { name: "运行审计" })).toBeInTheDocument();
    expect(within(conversationSidebar).getAllByRole("link", { name: "管理员控制台" }).length).toBeGreaterThan(0);
    expect(screen.getByLabelText("智能体选择")).toHaveDisplayValue("默认智能体");
    expect(screen.getByLabelText("模型选择")).toHaveDisplayValue("OpenAI GPT-5");
    expect(screen.getByRole("button", { name: "发送" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "删除" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "停止运行" })).toBeDisabled();

    expect(within(messageStream).getByText("AG-UI：空闲")).toBeInTheDocument();
    expect(within(messageStream).getByText("事件 0")).toBeInTheDocument();
    expect(within(messageStream).getByRole("region", { name: "CopilotKit 对话面板" })).toBeInTheDocument();
    expect(within(messageStream).getByPlaceholderText("向当前智能体发送任务")).toBeInTheDocument();

    expect(screen.getByRole("heading", { name: "制品" })).toBeInTheDocument();
    expect(screen.getByText(/# 简报\s+alpha/)).toBeInTheDocument();
  });
});
