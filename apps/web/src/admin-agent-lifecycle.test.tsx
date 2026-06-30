import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { App } from "./App";

describe("Administrator Agent Lifecycle surface", () => {
  it("shows the Default Agent and lifecycle actions", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "Agent Lifecycle" })).toBeInTheDocument();
    expect(screen.getByText("Default Agent")).toBeInTheDocument();
    expect(screen.getByText("Process visibility: standard")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create Agent" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Disable Agent" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retire Agent" })).toBeInTheDocument();
  });
});
