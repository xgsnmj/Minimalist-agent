import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { App } from "./App";

describe("MVP smoke workflow surface", () => {
  it("keeps the primary conversation, artifact, cancellation, and admin audit entry points visible", () => {
    render(<App />);

    const conversationSidebar = screen.getByLabelText("Agent Conversations");
    const messageStream = screen.getByLabelText("Conversation messages");

    expect(within(conversationSidebar).getByRole("button", { name: "New Conversation" })).toBeInTheDocument();
    expect(within(conversationSidebar).getByRole("link", { name: "Run Audit" })).toBeInTheDocument();
    expect(within(conversationSidebar).getByRole("link", { name: "Administrator Console" })).toBeInTheDocument();
    expect(screen.getByLabelText("Agent Selection")).toHaveDisplayValue("Default Agent");
    expect(screen.getByLabelText("Allowed Model Selection")).toHaveDisplayValue("OpenAI GPT-5");
    expect(screen.getByRole("button", { name: "Send Message" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete Conversation" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stop Run" })).toBeDisabled();

    expect(within(messageStream).getByText("AG-UI SSE idle")).toBeInTheDocument();
    expect(within(messageStream).getByText("Last seen event 0")).toBeInTheDocument();
    expect(within(messageStream).getByText("Tool Call")).toBeInTheDocument();
    expect(within(messageStream).getByText("search.web")).toBeInTheDocument();
    expect(within(messageStream).getByText("Card ready: artifact_card")).toBeInTheDocument();

    expect(screen.getByRole("heading", { name: "Preview" })).toBeInTheDocument();
    expect(screen.getByText(/# Brief\s+alpha/)).toBeInTheDocument();
  });
});
