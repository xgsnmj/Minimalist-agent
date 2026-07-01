import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { App } from "./App";

describe("Administrator Run Audit surface", () => {
  it("shows run audit, full trace, and retention awareness in the Administrator Console", () => {
    render(<App />);

    const runAudit = screen.getByRole("region", { name: "Run Audit" });

    expect(within(runAudit).getByRole("heading", { name: "Run Audit" })).toBeInTheDocument();
    expect(within(runAudit).getByText("Full Trace retained for 90 days")).toBeInTheDocument();
    expect(within(runAudit).getByText("Storage: 1 artifact")).toBeInTheDocument();
    expect(within(runAudit).getByText("Recent failed runs: 1")).toBeInTheDocument();
    expect(within(runAudit).getByText("sandbox.exec")).toBeInTheDocument();
    expect(within(runAudit).getByText("Full Trace")).toBeInTheDocument();
  });
});
