import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { App } from "./app/app";

describe("Administrator Sandbox Status surface", () => {
  afterEach(() => {
    cleanup();
    window.history.pushState({}, "", "/");
  });

  it("shows Sandbox Capability availability, Agent authorization, recent calls, and artifact capture", async () => {
    window.history.pushState({}, "", "/admin/sandbox");
    render(<App />);

    expect(screen.getByRole("heading", { level: 1, name: "沙箱状态" })).toBeInTheDocument();
    expect(screen.getByText("使用 OpenAI Agents SDK 沙箱支持；此页面不表示生产主机提供 Docker 沙箱。")).toBeInTheDocument();

    const runtimeStatus = screen.getByRole("region", { name: "沙箱运行时状态" });
    expect(await within(runtimeStatus).findByText("1 个")).toBeInTheDocument();
    expect(within(runtimeStatus).getByText("智能体能力策略")).toBeInTheDocument();
    expect(within(runtimeStatus).getByText("1 个产物")).toBeInTheDocument();

    const capabilityTable = screen.getByRole("table", { name: "智能体沙箱能力" });
    expect(await within(capabilityTable).findByRole("row", { name: /Default Agent 已启用 由运行审计记录产物 过程可见性：标准/ })).toBeInTheDocument();
    expect(within(capabilityTable).getByRole("row", { name: /Research Agent 未启用 不捕获沙箱产物 过程可见性：最小/ })).toBeInTheDocument();

    const recentCalls = screen.getByRole("region", { name: "近期沙箱工具调用" });
    expect(within(recentCalls).getByText("暂无独立沙箱调用列表")).toBeInTheDocument();
    expect(within(recentCalls).getByText("请在运行审计中查看具体工具调用、产物和失败详情。")).toBeInTheDocument();

    const artifactCapture = screen.getByRole("region", { name: "产物捕获摘要" });
    expect(within(artifactCapture).getByText("已捕获 1 个产物")).toBeInTheDocument();
    expect(within(artifactCapture).getByText("产物数量来自运行审计存储汇总。")).toBeInTheDocument();
    expect(within(artifactCapture).getByText("捕获文件以产物引用存储，不以内联消息正文存储。")).toBeInTheDocument();
  });
});
