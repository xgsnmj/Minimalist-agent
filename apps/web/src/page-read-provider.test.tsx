import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { App } from "./App";

describe("Administrator Page Read Provider surface", () => {
  afterEach(() => {
    cleanup();
    window.history.pushState({}, "", "/");
  });

  it("configures known-URL page reading without collapsing it into Search or browser mode", async () => {
    const user = userEvent.setup();
    window.history.pushState({}, "", "/admin/page-read-provider");
    render(<App />);

    expect(screen.getByRole("heading", { level: 1, name: "Page Read Provider" })).toBeInTheDocument();
    expect(screen.getByText("Page Read reads full text from a known URL; Search only finds candidate URLs and summaries.")).toBeInTheDocument();

    const status = screen.getByRole("region", { name: "Jina Reader Provider status" });
    expect(within(status).getByText("enabled")).toBeInTheDocument();
    expect(within(status).getByText("secret/jina-reader")).toBeInTheDocument();
    expect(within(status).getByText("40k characters")).toBeInTheDocument();

    const domainPolicy = screen.getByRole("region", { name: "Domain policy editor" });
    expect(within(domainPolicy).getByLabelText("Allow domains")).toHaveDisplayValue("docs.example.com\nhelp.example.com");
    expect(within(domainPolicy).getByLabelText("Deny domains")).toHaveDisplayValue("internal.example.com");
    expect(within(domainPolicy).getByRole("button", { name: "Save policy draft" })).toBeInTheDocument();

    const runtimeSettings = screen.getByRole("region", { name: "Page Read runtime settings" });
    expect(within(runtimeSettings).getByLabelText("Extract mode")).toHaveDisplayValue("Readable text");
    expect(within(runtimeSettings).getByLabelText("Timeout")).toHaveDisplayValue("15s");
    expect(within(runtimeSettings).getByLabelText("Content length")).toHaveDisplayValue("40k characters");

    await user.click(screen.getByRole("tab", { name: "Policy violation" }));

    const healthCheck = screen.getByRole("tabpanel", { name: "Policy violation" });
    expect(within(healthCheck).getByText("Known URL blocked by domain policy")).toBeInTheDocument();
    expect(within(healthCheck).getByText("No Search query was issued by Page Read.")).toBeInTheDocument();
  });
});
