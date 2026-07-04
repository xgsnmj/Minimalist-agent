import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { App } from "./app/app";

describe("Administrator MCP Servers surface", () => {
  afterEach(() => {
    cleanup();
    window.history.pushState({}, "", "/");
  });

  it("lets an Administrator review remote MCP discovery and open a local server configuration panel", async () => {
    const user = userEvent.setup();
    window.history.pushState({}, "", "/admin/mcp-servers");
    render(<App />);

    expect(screen.getByRole("heading", { level: 1, name: "MCP 服务器" })).toBeInTheDocument();
    expect(screen.getByText("仅支持 SSE 或 Streamable HTTP；stdio MCP 服务器不在当前 MVP 范围内。")).toBeInTheDocument();

    const serverTable = screen.getByRole("table", { name: "MCP 服务器列表" });
    expect(await within(serverTable).findByRole("row", { name: /Document Tools SSE 密钥引用 已发现 按智能体策略授权 编辑/ })).toBeInTheDocument();
    expect(within(serverTable).getByRole("row", { name: /Data Reader Streamable HTTP 未配置 待发现 按智能体策略授权 配置/ })).toBeInTheDocument();

    const discoveryResult = screen.getByRole("region", { name: "工具发现结果" });
    expect(await within(discoveryResult).findByText("read_document")).toBeInTheDocument();
    expect(within(discoveryResult).getByText("extract_table")).toBeInTheDocument();

    const authorizationPanel = screen.getByRole("region", { name: "MCP 工具授权" });
    expect(within(authorizationPanel).getByRole("combobox", { name: "智能体" })).toHaveTextContent("Default Agent");
    expect(within(authorizationPanel).getByRole("button", { name: "保存授权草稿" })).toBeInTheDocument();
    expect(screen.getByText("智能体工具网关仍由后端持有；前端不会暴露 MCP 凭据明文。")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "创建 MCP 服务器" }));

    const configPanel = screen.getByRole("region", { name: "MCP 服务器配置草稿" });
    expect(within(configPanel).getByRole("heading", { name: "创建 MCP 服务器" })).toBeInTheDocument();
    expect(within(configPanel).getByRole("combobox", { name: "连接类型" })).toHaveTextContent("SSE");
    expect(within(configPanel).getByLabelText("凭据引用").getAttribute("placeholder")).toBe("secret/mcp-server");
  });
});
