import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { App } from "./App";

describe("App", () => {
  it("renders the Agent Platform shell", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "Minimalist Agent" })).toBeInTheDocument();
    expect(screen.getByText("Agent Platform scaffold is running.")).toBeInTheDocument();
  });
});
