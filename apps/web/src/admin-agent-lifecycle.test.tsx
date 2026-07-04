import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { App } from "./App";

describe("Administrator Agent Lifecycle surface", () => {
  afterEach(() => {
    cleanup();
    window.history.pushState({}, "", "/");
  });

  it("shows the Default Agent and lifecycle actions", () => {
    window.history.pushState({}, "", "/admin/agents");
    render(<App />);

    expect(screen.getByRole("heading", { level: 1, name: "Agent Lifecycle" })).toBeInTheDocument();
    const lifecycle = screen.getByRole("region", { name: "Agent Lifecycle" });
    expect(within(lifecycle).getByRole("row", { name: /Default Agent enabled OpenAI GPT-5 2 search, sandbox Process visibility: standard Details/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create Agent" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Disable Agent" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retire Agent" })).toBeInTheDocument();
  });

  it("opens Agent detail and a local Create Agent draft", async () => {
    const user = userEvent.setup();
    window.history.pushState({}, "", "/admin/agents");
    render(<App />);

    const lifecycle = screen.getByRole("region", { name: "Agent Lifecycle" });
    const agentList = within(lifecycle).getByRole("table", { name: "Agent list" });

    expect(within(agentList).getByRole("row", { name: /Research Agent enabled Claude Sonnet 2 search, page read Process visibility: summary Details/ })).toBeInTheDocument();
    await user.click(within(agentList).getAllByRole("button", { name: "Details" })[1]);

    const detail = within(lifecycle).getByRole("region", { name: "Agent detail" });
    expect(within(detail).getByRole("heading", { name: "Research Agent" })).toBeInTheDocument();
    expect(within(detail).getByText("Agent Instruction")).toBeInTheDocument();
    expect(within(detail).getByText("Process Visibility Policy")).toBeInTheDocument();
    expect(within(detail).getByText("Default Model Configuration")).toBeInTheDocument();
    expect(within(detail).getByText("Allowed Model Selection")).toBeInTheDocument();
    expect(within(detail).getByText("Agent Capability Policy")).toBeInTheDocument();
    expect(within(detail).getByText("MCP Tool Authorization")).toBeInTheDocument();
    expect(within(detail).getByText("Instruction snapshot recorded for new Agent Runs")).toBeInTheDocument();

    await user.click(within(lifecycle).getByRole("button", { name: "Create Agent" }));
    const draft = within(lifecycle).getByRole("region", { name: "Create Agent draft" });
    expect(within(draft).getByLabelText("Agent name")).toBeInTheDocument();
    expect(within(draft).getByLabelText("Description")).toBeInTheDocument();
    expect(within(draft).getByLabelText("Agent Instruction")).toBeInTheDocument();
    expect(within(draft).getByText("Draft only. Backend governance must create the Agent.")).toBeInTheDocument();
  });
});
