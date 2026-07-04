import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { App } from "./app/app";

describe("Administrator Page Read Provider surface", () => {
  afterEach(() => {
    cleanup();
    window.history.pushState({}, "", "/");
  });

  it("configures known-URL page reading without collapsing it into Search or browser mode", async () => {
    const user = userEvent.setup();
    window.history.pushState({}, "", "/admin/page-read-provider");
    render(<App />);

    expect(screen.getByRole("heading", { level: 1, name: "页面读取提供方" })).toBeInTheDocument();
    expect(screen.getByText("页面读取能力读取已知 URL 的全文；搜索能力只查找候选 URL 和摘要。")).toBeInTheDocument();

    const status = screen.getByRole("region", { name: "页面读取提供方状态" });
    expect(await within(status).findByText("已启用")).toBeInTheDocument();
    expect(within(status).getByText("secret:jina-reader")).toBeInTheDocument();
    expect(within(status).getByText("4000 字符")).toBeInTheDocument();

    const domainPolicy = screen.getByRole("region", { name: "域名策略编辑器" });
    expect(within(domainPolicy).getByLabelText("允许域名")).toHaveDisplayValue("docs.example.com\nhelp.example.com");
    expect(within(domainPolicy).getByRole("button", { name: "保存策略" })).toBeInTheDocument();

    const runtimeSettings = screen.getByRole("region", { name: "页面读取运行设置" });
    expect(within(runtimeSettings).getByRole("combobox", { name: "抽取模式" })).toHaveTextContent("可读文本");
    expect(within(runtimeSettings).getByLabelText("超时")).toHaveDisplayValue("20s");
    expect(within(runtimeSettings).getByLabelText("内容长度")).toHaveDisplayValue("4000 字符");

    await user.clear(within(runtimeSettings).getByLabelText("内容长度"));
    await user.type(within(runtimeSettings).getByLabelText("内容长度"), "5000 字符");
    await user.click(within(domainPolicy).getByRole("button", { name: "保存策略" }));
    expect(await within(domainPolicy).findByText("页面读取提供方配置已保存。")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "策略违规" }));

    const healthCheck = screen.getByRole("tabpanel", { name: "策略违规" });
    expect(within(healthCheck).getByText("已知 URL 被域名策略拦截")).toBeInTheDocument();
    expect(within(healthCheck).getByText("页面读取未发起搜索查询。")).toBeInTheDocument();
  });
});
