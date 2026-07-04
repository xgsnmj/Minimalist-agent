import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { App } from "./App";

describe("Administrator Sandbox Status surface", () => {
  afterEach(() => {
    cleanup();
    window.history.pushState({}, "", "/");
  });

  it("shows Sandbox Capability availability, Agent authorization, recent calls, and artifact capture", async () => {
    const user = userEvent.setup();
    window.history.pushState({}, "", "/admin/sandbox");
    render(<App />);

    expect(screen.getByRole("heading", { level: 1, name: "Sandbox Status" })).toBeInTheDocument();
    expect(screen.getByText("Uses OpenAI Agents SDK sandbox support; this page does not imply a production host Docker sandbox.")).toBeInTheDocument();

    const runtimeStatus = screen.getByRole("region", { name: "Sandbox runtime status" });
    expect(within(runtimeStatus).getByText("available")).toBeInTheDocument();
    expect(within(runtimeStatus).getByText("workspace isolated")).toBeInTheDocument();
    expect(within(runtimeStatus).getByText("artifact capture enabled")).toBeInTheDocument();

    const capabilityTable = screen.getByRole("table", { name: "Agent Sandbox Capability" });
    expect(within(capabilityTable).getByRole("row", { name: /Default Agent enabled artifact capture on Administrator policy/ })).toBeInTheDocument();
    expect(within(capabilityTable).getByRole("row", { name: /Research Agent restricted artifact capture review Summary-only policy/ })).toBeInTheDocument();

    const recentCalls = screen.getByRole("region", { name: "Recent sandbox tool calls" });
    expect(within(recentCalls).getByText("sandbox.exec")).toBeInTheDocument();
    expect(within(recentCalls).getByText("report.md captured as Artifact Reference")).toBeInTheDocument();

    const artifactCapture = screen.getByRole("region", { name: "Artifact capture summary" });
    expect(within(artifactCapture).getByText("2 captured artifacts")).toBeInTheDocument();
    expect(within(artifactCapture).getByText("HTML previews stay sandboxed before rendering in Artifact Preview.")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Rejected call" }));

    const rejectedCall = screen.getByRole("tabpanel", { name: "Rejected call" });
    expect(within(rejectedCall).getByText("Sandbox Capability denied by Agent Capability Policy")).toBeInTheDocument();
    expect(within(rejectedCall).getByText("The frontend did not run code or override backend policy.")).toBeInTheDocument();
  });
});
