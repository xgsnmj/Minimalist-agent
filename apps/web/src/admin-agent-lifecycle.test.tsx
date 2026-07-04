import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { App } from "./app/app";

describe("Administrator Agent Lifecycle surface", () => {
  afterEach(() => {
    cleanup();
    window.history.pushState({}, "", "/");
  });

  it("shows the Default Agent and lifecycle actions", async () => {
    window.history.pushState({}, "", "/admin/agents");
    render(<App />);

    expect(screen.getByRole("heading", { level: 1, name: "智能体生命周期" })).toBeInTheDocument();
    const lifecycle = screen.getByRole("region", { name: "智能体生命周期" });
    expect(await within(lifecycle).findByRole("row", { name: /Default Agent 已启用 模型配置 #1 2 搜索、沙箱、MCP 过程可见性：标准 详情/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "创建智能体" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "启用智能体" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "停用智能体" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "归档智能体" })).toBeInTheDocument();
  });

  it("opens Agent detail and a local Create Agent draft", async () => {
    const user = userEvent.setup();
    window.history.pushState({}, "", "/admin/agents");
    render(<App />);

    const lifecycle = screen.getByRole("region", { name: "智能体生命周期" });
    const agentList = within(lifecycle).getByRole("table", { name: "智能体列表" });

    expect(await within(agentList).findByRole("row", { name: /Research Agent 已启用 模型配置 #2 2 搜索、页面读取 过程可见性：最小 详情/ })).toBeInTheDocument();
    await user.click(within(agentList).getAllByRole("button", { name: "详情" })[1]);

    const detail = within(lifecycle).getByRole("region", { name: "智能体详情" });
    expect(within(detail).getByRole("heading", { name: "Research Agent" })).toBeInTheDocument();
    expect(within(detail).getByText("智能体说明")).toBeInTheDocument();
    expect(within(detail).getByText("过程可见性策略")).toBeInTheDocument();
    expect(within(detail).getByText("默认模型配置")).toBeInTheDocument();
    expect(within(detail).getByText("可选模型")).toBeInTheDocument();
    expect(within(detail).getByText("智能体能力策略")).toBeInTheDocument();
    expect(within(detail).getByText("MCP 工具授权")).toBeInTheDocument();
    expect(within(detail).getByText("新智能体运行会记录当前说明快照。")).toBeInTheDocument();

    await user.click(within(lifecycle).getByRole("button", { name: "创建智能体" }));
    const draft = within(lifecycle).getByRole("region", { name: "创建智能体草稿" });
    expect(within(draft).getByLabelText("智能体名称")).toBeInTheDocument();
    expect(within(draft).getByLabelText("描述")).toBeInTheDocument();
    expect(within(draft).getByLabelText("智能体说明")).toBeInTheDocument();
    expect(within(draft).getByText("仅创建本地草稿，真正的智能体必须由后端治理流程创建。")).toBeInTheDocument();
  });
});
