import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { App } from "./App";

describe("Administrator Run Audit surface", () => {
  afterEach(() => {
    cleanup();
    window.history.pushState({}, "", "/");
  });

  it("filters Agent Runs and opens an Administrator-only audit detail", async () => {
    const user = userEvent.setup();
    window.history.pushState({}, "", "/admin/run-audit");
    render(<App />);

    const runAudit = screen.getByRole("region", { name: "Run Audit" });

    expect(within(runAudit).getByRole("heading", { name: "Run Audit" })).toBeInTheDocument();
    expect(within(runAudit).getByText("Full Trace retained for 90 days")).toBeInTheDocument();

    const filters = within(runAudit).getByRole("region", { name: "Run Audit filters" });
    await user.selectOptions(within(filters).getByLabelText("Status"), "failed");

    const runList = within(runAudit).getByRole("table", { name: "Agent Run list" });
    expect(within(runList).getByRole("row", { name: /run_failed Customer interview chen\.user Research Agent Claude Sonnet failed 1 0 Details/ })).toBeInTheDocument();
    expect(within(runList).queryByRole("row", { name: /run_current/ })).not.toBeInTheDocument();

    await user.click(within(runList).getByRole("button", { name: "Details" }));

    const detail = within(runAudit).getByRole("region", { name: "Agent Run detail" });
    expect(within(detail).getByRole("heading", { name: "run_failed" })).toBeInTheDocument();
    expect(within(detail).getByText("Status timeline")).toBeInTheDocument();
    expect(within(detail).getByText("Conversation Message references")).toBeInTheDocument();
    expect(within(detail).getByText("Process Summary")).toBeInTheDocument();
    expect(within(detail).getByText("Tool Call sequence")).toBeInTheDocument();
    expect(within(detail).getByText("Run Capability Snapshot")).toBeInTheDocument();
    expect(within(detail).getByText("Artifacts")).toBeInTheDocument();
    expect(within(detail).getByText("failure/cancellation detail")).toBeInTheDocument();
    expect(within(detail).getByText("Full Trace entry")).toBeInTheDocument();
    expect(within(detail).getByRole("link", { name: "Open Full Trace Detail" }).getAttribute("href")).toBe("/admin/full-trace");
  });
});
