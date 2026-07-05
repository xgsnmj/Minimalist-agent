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

    expect(await screen.findByRole("heading", { level: 1, name: "智能体生命周期" })).toBeInTheDocument();
    const lifecycle = screen.getByRole("region", { name: "智能体生命周期" });
    expect(await within(lifecycle).findByRole("row", { name: /Default Agent 已启用 模型配置 #1 2 搜索、沙箱、MCP 过程可见性：标准 详情/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "创建智能体" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "启用智能体" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "停用智能体" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "归档智能体" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "检查智能体就绪状态" })).toBeInTheDocument();
  });

  it("opens Agent detail and creates an Agent through the backend", async () => {
    const user = userEvent.setup();
    window.history.pushState({}, "", "/admin/agents");
    render(<App />);

    const lifecycle = await screen.findByRole("region", { name: "智能体生命周期" });
    const agentList = within(lifecycle).getByRole("table", { name: "智能体列表" });

    expect(await within(agentList).findByRole("row", { name: /Research Agent 已启用 模型配置 #2 2 搜索、页面读取 过程可见性：最小 详情/ })).toBeInTheDocument();
    await user.click(within(agentList).getAllByRole("button", { name: "详情" })[1]);

    const detail = within(lifecycle).getByRole("region", { name: "智能体详情" });
    expect(within(detail).getByRole("heading", { name: "Research Agent" })).toBeInTheDocument();
    expect(within(detail).getAllByText("过程可见性").length).toBeGreaterThan(0);
    expect(within(detail).getAllByText("默认模型").length).toBeGreaterThan(0);
    expect(within(detail).getAllByText("可选模型").length).toBeGreaterThan(0);
    expect(within(detail).getAllByText("能力策略").length).toBeGreaterThan(0);
    expect(within(detail).getByRole("form", { name: "编辑智能体策略" })).toBeInTheDocument();
    await user.click(within(detail).getByRole("button", { name: "检查智能体就绪状态" }));
    expect(await within(detail).findByRole("region", { name: "智能体就绪结果" })).toHaveTextContent("已就绪");

    await user.click(within(detail).getByRole("tab", { name: "说明" }));
    expect(within(detail).getByText("智能体说明")).toBeInTheDocument();
    expect(within(detail).getByRole("form", { name: "编辑智能体说明" })).toBeInTheDocument();

    await user.click(within(detail).getByRole("tab", { name: "MCP" }));
    expect(within(detail).getByText("MCP 工具授权")).toBeInTheDocument();

    await user.click(within(lifecycle).getByRole("button", { name: "创建智能体" }));
    const dialog = screen.getByRole("dialog", { name: "创建智能体" });
    const createForm = within(dialog).getByRole("form", { name: "创建智能体" });
    await user.type(within(createForm).getByLabelText("智能体名称"), "Support Agent");
    await user.type(within(createForm).getByLabelText("智能体说明"), "Handle support requests inside the approved backend capability policy.");
    await user.click(within(createForm).getByRole("button", { name: "保存智能体" }));

    expect(await within(agentList).findByRole("row", { name: /Support Agent 已启用 模型配置 #1 1 未启用能力 过程可见性：标准 详情/ })).toBeInTheDocument();
    expect(within(lifecycle).getByText("智能体已创建。")).toBeInTheDocument();
  });
});
