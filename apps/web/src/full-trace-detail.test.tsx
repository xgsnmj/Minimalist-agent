import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { App } from "./app/app";

describe("Administrator Full Trace Detail surface", () => {
  afterEach(() => {
    cleanup();
    window.history.pushState({}, "", "/");
  });

  it("shows a diagnostic trace with raw payload collapsed by default", async () => {
    const user = userEvent.setup();
    window.history.pushState({}, "", "/admin/full-trace");
    render(<App />);

    const fullTrace = screen.getByRole("region", { name: "完整追踪详情" });

    expect(within(fullTrace).getByRole("heading", { name: "完整追踪详情" })).toBeInTheDocument();
    expect(within(fullTrace).getByText("仅管理员可见的诊断记录")).toBeInTheDocument();
    expect(await within(fullTrace).findByText("1")).toBeInTheDocument();
    expect(within(fullTrace).getByText("模型配置 #1")).toBeInTheDocument();
    expect(within(fullTrace).getByText("用户 #3")).toBeInTheDocument();

    const timeline = within(fullTrace).getByRole("table", { name: "事件时间线" });
    expect(within(timeline).getByRole("row", { name: /后端追踪 workflow_name Agent workflow/ })).toBeInTheDocument();
    expect(within(timeline).getByRole("row", { name: /后端追踪 model_name gpt-5\.5/ })).toBeInTheDocument();
    expect(within(timeline).getByRole("row", { name: /后端追踪 tool_name sandbox\.exec/ })).toBeInTheDocument();

    const rawPayload = within(fullTrace).getByLabelText("原始诊断载荷");
    expect(rawPayload.hasAttribute("open")).toBe(false);
    await user.click(within(rawPayload).getByText("原始诊断载荷"));
    expect(rawPayload.hasAttribute("open")).toBe(true);
    expect(within(rawPayload).getByText(/Agent workflow/)).toBeInTheDocument();
    expect(within(rawPayload).getByText(/sandbox\.exec/)).toBeInTheDocument();

    const artifacts = within(fullTrace).getByRole("region", { name: "产物引用" });
    expect(within(artifacts).getByText("选择运行后加载产物引用")).toBeInTheDocument();
    expect(within(fullTrace).getByRole("link", { name: "返回运行审计" }).getAttribute("href")).toBe("/admin/run-audit");
  });
});
