import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { App } from "./app/app";

describe("Administrator Agent Configuration surface", () => {
  afterEach(() => {
    cleanup();
    window.history.pushState({}, "", "/");
  });

  it("shows Agents SDK runtime controls for the Default Agent", async () => {
    window.history.pushState({}, "", "/admin/agents");
    render(<App />);

    expect(await screen.findByRole("heading", { level: 1, name: "Agent 配置" })).toBeInTheDocument();
    const panel = screen.getByRole("region", { name: "智能体配置" });
    expect(await within(panel).findByRole("heading", { name: "Agent 定义与运行策略" })).toBeInTheDocument();
    expect(within(panel).getByRole("complementary", { name: "Agent 列表" })).toHaveTextContent("Default Agent");
    expect(within(panel).getByRole("form", { name: "编辑 Agent 配置" })).toBeInTheDocument();
    expect(within(panel).getByLabelText("Max turns")).toHaveValue("10");
    expect(within(panel).getByRole("combobox", { name: "Tool use behavior" })).toHaveTextContent("run_llm_again");
    expect(within(panel).getByLabelText("reset_tool_choice")).toBeChecked();
    expect(within(panel).getByLabelText("能力策略")).toHaveTextContent("搜索");
    expect(within(panel).getByLabelText("MCP 服务器")).toHaveTextContent("Document Tools");
  });

  it("selects an Agent, checks readiness, and creates an Agent through the backend", async () => {
    const user = userEvent.setup();
    window.history.pushState({}, "", "/admin/agents");
    render(<App />);

    const panel = await screen.findByRole("region", { name: "智能体配置" });
    await user.click(within(panel).getByRole("button", { name: /Research Agent/ }));

    const editor = within(panel).getByRole("form", { name: "编辑 Agent 配置" });
    expect(within(editor).getByRole("heading", { name: "Research Agent" })).toBeInTheDocument();
    expect(within(editor).getByLabelText("Max turns")).toHaveValue("8");

    await user.click(within(editor).getByRole("button", { name: "检查智能体就绪状态" }));
    expect(await within(editor).findByRole("region", { name: "智能体就绪结果" })).toHaveTextContent("已就绪");

    await user.click(within(panel).getByRole("button", { name: "创建 Agent" }));
    const dialog = screen.getByRole("dialog", { name: "创建 Agent" });
    const createForm = within(dialog).getByRole("form", { name: "创建 Agent" });
    await user.type(within(createForm).getByLabelText("Agent 名称"), "Support Agent");
    await user.type(within(createForm).getByLabelText("Instructions"), "Handle support requests inside the approved backend capability policy.");
    await user.click(within(createForm).getByRole("button", { name: "保存 Agent" }));

    expect(await within(panel).findByRole("button", { name: /Support Agent/ })).toBeInTheDocument();
    expect(within(panel).getByText("Agent 已创建。")).toBeInTheDocument();
  });
});
