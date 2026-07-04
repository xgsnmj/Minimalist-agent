import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach } from "vitest";
import { describe, expect, it } from "vitest";

import { App } from "./app/app";

describe("App", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the Agent Platform shell", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "Minimalist Agent" })).toBeInTheDocument();
    expect(screen.getByText("对话工作台")).toBeInTheDocument();
  });

  it("uploads a run attachment through the embedded CopilotKit chat", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getAllByRole("button", { name: "新建对话" })[0]);
    await user.upload(screen.getByLabelText("运行附件"), new File(["hello"], "brief.md", { type: "text/markdown" }));

    expect(await screen.findByText("hello")).toBeInTheDocument();
    expect(screen.getByText("brief.md")).toBeInTheDocument();
    expect(screen.getByText("markdown")).toBeInTheDocument();
  });

  it("delegates the center conversation surface to CopilotKit", () => {
    render(<App />);
    const messageStream = screen.getByLabelText("对话消息");

    expect(within(messageStream).getByRole("region", { name: "CopilotKit 对话面板" })).toBeInTheDocument();
    expect(within(messageStream).getByText("当前会话由 CopilotKit 渲染。运行与权限由后端治理。")).toBeInTheDocument();
    expect(within(messageStream).getByPlaceholderText("向当前智能体发送任务")).toBeInTheDocument();
  });

  it("keeps tool authority out of the embedded chat controls", () => {
    render(<App />);
    const runtimeControls = screen.getByLabelText("运行配置");

    expect(within(runtimeControls).getByText("能力由管理员策略决定")).toBeInTheDocument();
    expect(screen.queryByLabelText("Enable Search Capability")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Enable Sandbox Capability")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Enable MCP Tools")).not.toBeInTheDocument();
  });
});
