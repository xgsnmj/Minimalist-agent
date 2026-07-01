import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach } from "vitest";
import { describe, expect, it } from "vitest";

import { App } from "./App";

describe("App", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the Agent Platform shell", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "Minimalist Agent" })).toBeInTheDocument();
    expect(screen.getByText("Agent Platform scaffold is running.")).toBeInTheDocument();
  });

  it("uploads a run attachment and opens its preview from the composer", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getAllByRole("button", { name: "New Conversation" })[0]);
    await user.type(screen.getByLabelText("Message"), "Draft the product brief.");
    await user.upload(screen.getByLabelText("Run Attachment"), new File(["hello"], "brief.md", { type: "text/markdown" }));
    await user.click(screen.getByRole("button", { name: "Upload Attachment" }));

    expect(await screen.findByText("hello")).toBeInTheDocument();
    expect(screen.getByText("brief.md")).toBeInTheDocument();
    expect(screen.getByText("markdown")).toBeInTheDocument();
  });

  it("renders approved cards inside the conversation stream", () => {
    render(<App />);
    const messageStream = screen.getByLabelText("Conversation messages");

    expect(within(messageStream).getByText("Card ready: artifact_card")).toBeInTheDocument();
    expect(within(messageStream).getByText("Artifact")).toBeInTheDocument();
    expect(within(messageStream).getByText("brief.md", { selector: ".artifact-card h3" })).toBeInTheDocument();
    expect(within(messageStream).getByText("Tool Result")).toBeInTheDocument();
    expect(within(messageStream).getByText("doubao_search")).toBeInTheDocument();
    expect(within(messageStream).getByText("Choice")).toBeInTheDocument();
    expect(within(messageStream).getByRole("button", { name: "Brief" })).toBeInTheDocument();
    expect(within(messageStream).getByText("Citation")).toBeInTheDocument();
    expect(within(messageStream).getByRole("link", { name: "https://docs.ag-ui.com/" })).toBeInTheDocument();
    expect(within(messageStream).getByText("Status")).toBeInTheDocument();
    expect(within(messageStream).getByText("Reading sources")).toBeInTheDocument();
    expect(within(messageStream).getByText("Form Request")).toBeInTheDocument();
    expect(within(messageStream).getByText("Audience")).toBeInTheDocument();
  });
});
