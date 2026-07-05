import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { App } from "./app/app";

describe("MVP smoke workflow surface", () => {
  it("keeps the primary conversation, artifact, cancellation, and admin audit entry points visible", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: "市场调研" });

    const conversationSidebar = screen.getByLabelText("智能体会话");
    const messageStream = screen.getByLabelText("对话消息");

    expect(within(conversationSidebar).getByRole("button", { name: "新建对话" })).toBeInTheDocument();
    await user.click(within(conversationSidebar).getByRole("button", { name: "打开账号菜单" }));
    expect(within(conversationSidebar).getByRole("link", { name: "运行审计" })).toBeInTheDocument();
    expect(within(conversationSidebar).getByRole("link", { name: "管理控制台" })).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "智能体选择" })).not.toBeInTheDocument();
    expect(within(screen.getByLabelText("对话输入区")).getByRole("combobox", { name: "模型选择" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "发送" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "删除" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "停止运行" })).toBeDisabled();

    expect(within(messageStream).getByText("AG-UI：空闲")).toBeInTheDocument();
    expect(within(messageStream).getByText("运行进度：暂无新活动")).toBeInTheDocument();
    expect(within(messageStream).queryByText("事件 0")).not.toBeInTheDocument();
    expect(within(messageStream).getAllByLabelText("CopilotKit 对话面板").length).toBeGreaterThan(0);
    expect(within(messageStream).getByRole("form", { name: "CopilotKit 对话输入" })).toBeInTheDocument();
    expect(within(messageStream).getByPlaceholderText("询问当前工作台")).toBeInTheDocument();

    expect(screen.queryByLabelText("文件预览")).not.toBeInTheDocument();

    await user.click(within(messageStream).getAllByRole("button", { name: "打开制品 brief.md" })[0]);

    const filePreview = screen.getByLabelText("文件预览");
    expect(within(filePreview).getByRole("heading", { name: "brief.md" })).toBeInTheDocument();
    expect(within(filePreview).getByRole("heading", { name: "简报" })).toBeInTheDocument();
    expect(within(filePreview).getByText("alpha")).toBeInTheDocument();
  });
});
