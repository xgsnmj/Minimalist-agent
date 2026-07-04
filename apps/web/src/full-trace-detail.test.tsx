import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { App } from "./app/app";

describe("Administrator Full Trace Detail surface", () => {
  afterEach(() => {
    cleanup();
    window.history.pushState({}, "", "/");
  });

  it("shows a diagnostic trace with raw payload collapsed by default", async () => {
    const user = userEvent.setup();
    window.history.pushState({}, "", "/admin/full-trace");
    render(<App />);

    const fullTrace = screen.getByRole("region", { name: "Full Trace Detail" });

    expect(within(fullTrace).getByRole("heading", { name: "Full Trace Detail" })).toBeInTheDocument();
    expect(within(fullTrace).getByText("Administrator-only diagnostic record")).toBeInTheDocument();
    expect(within(fullTrace).getByText("run_failed")).toBeInTheDocument();
    expect(within(fullTrace).getByText("Claude Sonnet")).toBeInTheDocument();
    expect(within(fullTrace).getByText("chen.user")).toBeInTheDocument();

    const timeline = within(fullTrace).getByRole("table", { name: "Event timeline" });
    expect(within(timeline).getByRole("row", { name: /09:18 runtime event Agent Run accepted by Agent Runtime/ })).toBeInTheDocument();
    expect(within(timeline).getByRole("row", { name: /09:19 model interaction Claude Sonnet requested Search Capability/ })).toBeInTheDocument();
    expect(within(timeline).getByRole("row", { name: /09:20 tool call search\.web failed with provider_error/ })).toBeInTheDocument();
    expect(within(timeline).getByRole("row", { name: /09:20 error Agent Run marked failed/ })).toBeInTheDocument();

    const rawPayload = within(fullTrace).getByLabelText("Raw diagnostic payload");
    expect(rawPayload.hasAttribute("open")).toBe(false);
    await user.click(within(rawPayload).getByText("Raw diagnostic payload"));
    expect(rawPayload.hasAttribute("open")).toBe(true);
    expect(within(rawPayload).getByText(/provider_error/)).toBeInTheDocument();

    const artifacts = within(fullTrace).getByRole("region", { name: "Artifact references" });
    expect(within(artifacts).getByText("No artifacts captured")).toBeInTheDocument();
    expect(within(fullTrace).getByRole("link", { name: "Back to Run Audit" }).getAttribute("href")).toBe("/admin/run-audit");
  });
});
