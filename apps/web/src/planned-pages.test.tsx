import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { App } from "./App";

describe("planned page routes", () => {
  afterEach(() => {
    cleanup();
    window.history.pushState({}, "", "/");
  });

  it("renders the Local Account access pages", () => {
    window.history.pushState({}, "", "/login");
    render(<App />);
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();

    cleanup();
    window.history.pushState({}, "", "/register");
    render(<App />);
    expect(screen.getByRole("heading", { name: "Request access" })).toBeInTheDocument();

    cleanup();
    window.history.pushState({}, "", "/approval-pending");
    render(<App />);
    expect(screen.getByRole("heading", { name: "Account pending approval" })).toBeInTheDocument();
  });

  it("renders the Administrator Console pages from route paths", () => {
    window.history.pushState({}, "", "/admin");
    render(<App />);
    expect(screen.getByRole("heading", { name: "Governance Overview" })).toBeInTheDocument();

    cleanup();
    window.history.pushState({}, "", "/admin/run-audit");
    render(<App />);
    expect(screen.getByRole("heading", { level: 1, name: "Run Audit" })).toBeInTheDocument();

    cleanup();
    window.history.pushState({}, "", "/admin/full-trace");
    render(<App />);
    expect(screen.getByRole("heading", { level: 1, name: "Full Trace Detail" })).toBeInTheDocument();
  });
});
