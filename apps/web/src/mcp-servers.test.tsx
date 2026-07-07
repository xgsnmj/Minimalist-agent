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

    expect(await screen.findByRole("heading", { level: 1, name: "工具与 MCP" })).toBeInTheDocument();
    const mcp = screen.getByRole("region", { name: "工具与 MCP" });
    expect(await within(mcp).findByRole("heading", { name: "工具与 MCP" })).toBeInTheDocument();
    expect(within(mcp).getByRole("complementary", { name: "MCP 服务器列表" })).toHaveTextContent("Document Tools");
    expect(within(mcp).getByRole("complementary", { name: "MCP 服务器列表" })).toHaveTextContent("Data Reader");

    const discoveryResult = within(mcp).getByLabelText("工具发现结果");
    expect(await within(discoveryResult).findByText("read_document")).toBeInTheDocument();
    expect(within(discoveryResult).getByText("extract_table")).toBeInTheDocument();

    const authorizationForm = within(mcp).getByRole("form", { name: "MCP 工具授权" });
    expect(within(authorizationForm).getByRole("combobox", { name: "智能体" })).toHaveTextContent("Default Agent");
    expect(within(authorizationForm).getByLabelText("read_document")).toBeInTheDocument();

    await user.click(within(authorizationForm).getByRole("button", { name: "保存授权" }));
    expect(await within(mcp).findByText("MCP 工具授权已保存。")).toBeInTheDocument();

    const serverList = within(mcp).getByRole("complementary", { name: "MCP 服务器列表" });
    await user.click(within(serverList).getByRole("button", { name: /Data Reader/ }));
    await user.click(within(mcp).getAllByRole("button", { name: "发现工具" })[0]);
    const refreshedDiscoveryResult = within(mcp).getByLabelText("工具发现结果");
    expect(await within(refreshedDiscoveryResult).findByText("query_dataset")).toBeInTheDocument();
    expect(await within(mcp).findByText("工具发现已完成。")).toBeInTheDocument();

    await user.click(within(mcp).getByRole("button", { name: "创建 MCP 服务器" }));

    const dialog = screen.getByRole("dialog", { name: "创建 MCP 服务器" });
    const createForm = within(dialog).getByRole("form", { name: "创建 MCP 服务器" });
    await user.type(within(createForm).getByLabelText("名称"), "Analytics MCP");
    await user.type(within(createForm).getByLabelText("URL"), "https://mcp.example/analytics");
    await user.type(within(createForm).getByLabelText("凭据引用"), "secret://mcp/analytics");
    await user.click(within(createForm).getByRole("button", { name: "保存 MCP 服务器" }));

    expect(await within(mcp).findByRole("button", { name: /Analytics MCP/ })).toBeInTheDocument();
    expect(await within(mcp).findByText("MCP 服务器已创建。")).toBeInTheDocument();
  });
});
