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

    expect(screen.getByRole("heading", { level: 1, name: "MCP Servers" })).toBeInTheDocument();
    expect(screen.getByText("SSE or Streamable HTTP only; stdio MCP servers stay outside the MVP.")).toBeInTheDocument();

    const serverTable = screen.getByRole("table", { name: "MCP Server list" });
    expect(within(serverTable).getByRole("row", { name: /Document Tools SSE secret reference Discovered Default Agent Edit/ })).toBeInTheDocument();
    expect(within(serverTable).getByRole("row", { name: /Data Reader Streamable HTTP secret reference Pending discovery Unassigned Configure/ })).toBeInTheDocument();

    const discoveryResult = screen.getByRole("region", { name: "Tool discovery result" });
    expect(within(discoveryResult).getByText("read_document")).toBeInTheDocument();
    expect(within(discoveryResult).getByText("extract_table")).toBeInTheDocument();
    expect(within(discoveryResult).getByText("render_artifact")).toBeInTheDocument();

    const authorizationPanel = screen.getByRole("region", { name: "MCP Tool Authorization" });
    expect(within(authorizationPanel).getByRole("combobox", { name: "Agent" })).toHaveTextContent("Default Agent");
    expect(within(authorizationPanel).getByRole("button", { name: "Save authorization draft" })).toBeInTheDocument();
    expect(screen.getByText("Agent Tool Gateway remains backend-owned; the frontend never exposes raw MCP credentials.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Create MCP Server" }));

    const configPanel = screen.getByRole("region", { name: "MCP Server configuration draft" });
    expect(within(configPanel).getByRole("heading", { name: "Create MCP Server" })).toBeInTheDocument();
    expect(within(configPanel).getByRole("combobox", { name: "Connection type" })).toHaveTextContent("SSE");
    expect(within(configPanel).getByLabelText("Credential reference").getAttribute("placeholder")).toBe("secret/mcp-server");
  });
});
