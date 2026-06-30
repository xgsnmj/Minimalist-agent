import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { App } from "./App";

describe("Agent Conversation workspace", () => {
  it("renders the WorkBuddy-like conversation shell as the primary workspace", () => {
    render(<App />);

    expect(screen.getByRole("button", { name: "New Conversation" })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Search conversations" })).toBeInTheDocument();
    expect(screen.getByText("Market research")).toBeInTheDocument();
    expect(screen.getByText("Default Agent")).toBeInTheDocument();
    expect(screen.getByLabelText("Agent Selection")).toHaveDisplayValue("Default Agent");
    expect(screen.getByLabelText("Allowed Model Selection")).toHaveDisplayValue("OpenAI GPT-5");
    expect(screen.getByPlaceholderText("Ask the Agent to work on something...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rename Conversation" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete Conversation" })).toBeInTheDocument();
  });
});
