import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach } from "vitest";
import { describe, expect, it } from "vitest";

import { App } from "./app/app";

async function renderConversationRoute() {
  window.history.pushState({}, "", "/app/conversations");
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

describe("App", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    window.history.pushState({}, "", "/");
  });

  it("renders the Agent Platform shell", async () => {
    window.history.pushState({}, "", "/app/conversations");
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Minimalist Agent" })).toBeInTheDocument();
    });
    expect(screen.getByText("对话工作台")).toBeInTheDocument();
  });

  it("uploads a run attachment through the CopilotKit conversation composer", async () => {
    const user = userEvent.setup();
    await renderConversationRoute();

    await user.upload(
      getContextFileInput(),
      new File(["hello"], "brief.md", { type: "text/markdown" }),
    );

    const attachmentList = await screen.findByLabelText("已添加上下文附件");
    expect(within(attachmentList).getByText("brief.md")).toBeInTheDocument();
    expect(within(attachmentList).getByText("markdown")).toBeInTheDocument();
    expect(screen.queryByLabelText("文件预览")).not.toBeInTheDocument();
  });

  it("renders the CopilotKit conversation input surface", async () => {
    await renderConversationRoute();
    const messageStream = screen.getByLabelText("对话消息");

    expect(within(messageStream).getAllByLabelText("CopilotKit 对话面板").length).toBeGreaterThan(0);
    expect(within(messageStream).getByRole("form", { name: "CopilotKit 对话输入" })).toBeInTheDocument();
    expect(within(messageStream).getByPlaceholderText("询问当前工作台")).toBeInTheDocument();
  });

  it("keeps model selection in the composer and tool authority out of user controls", async () => {
    window.history.pushState({}, "", "/app/conversations");
    render(<App />);

    await waitFor(() => {
      const composer = screen.getByLabelText("对话输入区");
      expect(within(composer).getByText("模型选择")).toBeInTheDocument();
      expect(within(composer).getByRole("combobox")).toBeInTheDocument();
      expect(within(composer).queryByText("能力边界由管理员策略决定")).not.toBeInTheDocument();
    });
    expect(screen.queryByLabelText("运行配置")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "智能体选择" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Enable Search Capability")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Enable Sandbox Capability")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Enable MCP Tools")).not.toBeInTheDocument();
  });
});
