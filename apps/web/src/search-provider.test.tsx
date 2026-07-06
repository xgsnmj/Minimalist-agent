import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { App } from "./app/app";

describe("Administrator Search Provider surface", () => {
  afterEach(() => {
    cleanup();
    window.history.pushState({}, "", "/");
  });

  it("keeps Search Capability configuration separate from Page Read and saves backend settings", async () => {
    const user = userEvent.setup();
    window.history.pushState({}, "", "/admin/search-provider");
    render(<App />);

    expect(await screen.findByRole("heading", { level: 1, name: "搜索提供方" })).toBeInTheDocument();
    expect(screen.getByText("搜索能力负责查找候选 URL 和摘要；页面读取能力只读取已知 URL。")).toBeInTheDocument();

    const status = screen.getByRole("region", { name: "搜索提供方状态" });
    expect(await within(status).findByText("已启用")).toBeInTheDocument();
    expect(within(status).getByText("已配置")).toBeInTheDocument();
    expect(within(status).getByText("5 个候选结果")).toBeInTheDocument();
    expect(within(status).getByText("20s")).toBeInTheDocument();

    const editPanel = screen.getByRole("region", { name: "搜索提供方编辑面板" });
    expect(within(editPanel).getByLabelText("端点")).toHaveDisplayValue("https://api.doubao.example/search");
    expect(within(editPanel).getByRole("combobox", { name: "结果上限" })).toHaveTextContent("5 个候选结果");
    expect(within(editPanel).getByText("此设置不会改变页面读取的内容长度限制。")).toBeInTheDocument();

    const boundary = screen.getByRole("region", { name: "能力边界" });
    expect(within(boundary).getByText("搜索：候选 URL、标题和摘要。")).toBeInTheDocument();
    expect(within(boundary).getByText("页面读取：从已知 URL 提取全文。")).toBeInTheDocument();
    expect(within(boundary).getByText("不要把任一能力合并进浏览器模式。")).toBeInTheDocument();

    await user.clear(within(editPanel).getByLabelText("超时"));
    await user.type(within(editPanel).getByLabelText("超时"), "30s");
    await user.click(within(editPanel).getByRole("button", { name: "保存配置" }));
    expect(await screen.findByText("搜索提供方配置已保存。")).toBeInTheDocument();
  });
});
