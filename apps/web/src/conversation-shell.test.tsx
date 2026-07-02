import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { App } from "./App";

describe("Agent Conversation workspace", () => {
  afterEach(() => {
    cleanup();
  });

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

  it("keeps the workspace seam visible through the sidebar, stream banner, composer, and preview rail", () => {
    render(<App />);

    expect(screen.getByLabelText("Agent Conversations")).toBeInTheDocument();
    expect(screen.getByLabelText("Conversation messages")).toBeInTheDocument();
    expect(screen.getByLabelText("Account and Administrator Console")).toBeInTheDocument();
    expect(screen.getByLabelText("Run Audit")).toBeInTheDocument();
    expect(screen.getByLabelText("Search conversations")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose File" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload Attachment" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Artifact Preview" })).toBeInTheDocument();
  });
});
