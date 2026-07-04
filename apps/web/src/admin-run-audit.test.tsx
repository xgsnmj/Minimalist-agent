import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { App } from "./app/app";

describe("Administrator Run Audit surface", () => {
  afterEach(() => {
    cleanup();
    window.history.pushState({}, "", "/");
  });

  it("filters Agent Runs and opens an Administrator-only audit detail", async () => {
    const user = userEvent.setup();
    window.history.pushState({}, "", "/admin/run-audit");
    render(<App />);

    const runAudit = screen.getByRole("region", { name: "运行审计" });

    expect(within(runAudit).getByRole("heading", { name: "运行审计" })).toBeInTheDocument();
    expect(within(runAudit).getByText("完整追踪保留 90 天")).toBeInTheDocument();

    const filters = within(runAudit).getByRole("region", { name: "运行审计筛选" });
    expect(within(filters).getByRole("combobox", { name: "状态" })).toHaveTextContent("全部");

    const runList = within(runAudit).getByRole("table", { name: "智能体运行列表" });
    expect(await within(runList).findByRole("row", { name: /2 会话 #118 用户 #4 智能体 #2 模型配置 #2 已失败 1 0 详情/ })).toBeInTheDocument();
    await user.click(within(runList).getAllByRole("button", { name: "详情" })[1]);

    const detail = within(runAudit).getByRole("region", { name: "智能体运行详情" });
    expect(within(detail).getByRole("heading", { name: "2" })).toBeInTheDocument();
    expect(within(detail).getByText("状态时间线")).toBeInTheDocument();
    expect(within(detail).getByText("会话消息引用")).toBeInTheDocument();
    expect(within(detail).getByText("过程摘要")).toBeInTheDocument();
    expect(within(detail).getByText("工具调用序列")).toBeInTheDocument();
    expect(within(detail).getByText("运行能力快照")).toBeInTheDocument();
    expect(within(detail).getByText("产物")).toBeInTheDocument();
    expect(within(detail).getByText("失败/取消详情")).toBeInTheDocument();
    expect(within(detail).getByText("完整追踪入口")).toBeInTheDocument();
    expect(within(detail).getByRole("link", { name: "打开完整追踪详情" }).getAttribute("href")).toBe("/admin/full-trace");
  });
});
