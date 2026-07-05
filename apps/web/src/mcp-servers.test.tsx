import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { App } from "./app/app";

describe("Administrator MCP Servers surface", () => {
  afterEach(() => {
    cleanup();
    window.history.pushState({}, "", "/");
  });

  it("lets an Administrator create servers, discover tools, and save authorization through backend APIs", async () => {
    const user = userEvent.setup();
    window.history.pushState({}, "", "/admin/mcp-servers");
    render(<App />);

    expect(await screen.findByRole("heading", { level: 1, name: "MCP 服务器" })).toBeInTheDocument();
    expect(screen.getByText("仅支持 SSE 或 Streamable HTTP；stdio MCP 服务器不在当前 MVP 范围内。")).toBeInTheDocument();

    const serverTable = screen.getByRole("table", { name: "MCP 服务器列表" });
    expect(await within(serverTable).findByRole("row", { name: /Document Tools SSE https:\/\/mcp\.example\/sse 已配置 已发现 按智能体策略授权 详情 发现工具/ })).toBeInTheDocument();
    expect(within(serverTable).getByRole("row", { name: /Data Reader Streamable HTTP https:\/\/mcp\.example\/http 已配置 待发现 按智能体策略授权 详情 发现工具/ })).toBeInTheDocument();

    const discoveryResult = screen.getByRole("region", { name: "工具发现结果" });
    expect(await within(discoveryResult).findByText("read_document")).toBeInTheDocument();
    expect(within(discoveryResult).getByText("extract_table")).toBeInTheDocument();

    const authorizationPanel = screen.getByRole("region", { name: "MCP 工具授权" });
    expect(within(authorizationPanel).getByRole("combobox", { name: "智能体" })).toHaveTextContent("Default Agent");
    expect(within(authorizationPanel).getByRole("button", { name: "保存授权" })).toBeInTheDocument();
    expect(screen.getByText("授权只保存工具选择，不暴露 MCP 凭据明文。")).toBeInTheDocument();

    await user.click(within(authorizationPanel).getByRole("button", { name: "保存授权" }));
    expect(await screen.findByText("MCP 工具授权已保存。")).toBeInTheDocument();

    await user.click(within(serverTable).getAllByRole("button", { name: "发现工具" })[1]);
    expect(await within(discoveryResult).findByText("query_dataset")).toBeInTheDocument();
    expect(await screen.findByText("工具发现已完成。")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "创建 MCP 服务器" }));

    const dialog = screen.getByRole("dialog", { name: "创建 MCP 服务器" });
    const createForm = within(dialog).getByRole("form", { name: "创建 MCP 服务器" });
    await user.type(within(createForm).getByLabelText("名称"), "Analytics MCP");
    await user.type(within(createForm).getByLabelText("URL"), "https://mcp.example/analytics");
    await user.type(within(createForm).getByLabelText("凭据引用"), "secret://mcp/analytics");
    await user.click(within(createForm).getByRole("button", { name: "保存 MCP 服务器" }));

    expect(await within(serverTable).findByRole("row", { name: /Analytics MCP SSE https:\/\/mcp\.example\/analytics 已配置 待发现 按智能体策略授权 详情 发现工具/ })).toBeInTheDocument();
    expect(await screen.findByText("MCP 服务器已创建。")).toBeInTheDocument();
  });
});
