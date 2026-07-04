import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { App } from "./app/app";

describe("Administrator Search Provider surface", () => {
  afterEach(() => {
    cleanup();
    window.history.pushState({}, "", "/");
  });

  it("keeps Search Capability configuration separate from Page Read and previews provider runtime states", async () => {
    const user = userEvent.setup();
    window.history.pushState({}, "", "/admin/search-provider");
    render(<App />);

    expect(screen.getByRole("heading", { level: 1, name: "Search Provider" })).toBeInTheDocument();
    expect(screen.getByText("Search Capability finds candidate URLs and summaries; Page Read reads known URLs.")).toBeInTheDocument();

    const status = screen.getByRole("region", { name: "Doubao Search Provider status" });
    expect(within(status).getByText("enabled")).toBeInTheDocument();
    expect(within(status).getByText("secret/doubao-search")).toBeInTheDocument();
    expect(within(status).getByText("8 candidate results")).toBeInTheDocument();

    const editPanel = screen.getByRole("region", { name: "Search Provider edit panel" });
    expect(within(editPanel).getByLabelText("Endpoint")).toHaveDisplayValue("Doubao Search Provider");
    expect(within(editPanel).getByRole("combobox", { name: "Result limit" })).toHaveTextContent("8 candidate results");
    expect(within(editPanel).getByText("This does not change Page Read content-length limits.")).toBeInTheDocument();

    const boundary = screen.getByRole("region", { name: "Capability boundary" });
    expect(within(boundary).getByText("Search: candidate URLs, titles, and summaries.")).toBeInTheDocument();
    expect(within(boundary).getByText("Page Read: full text from a known URL.")).toBeInTheDocument();
    expect(within(boundary).getByText("Do not collapse either capability into browser mode.")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Provider error" }));

    const runtimePreview = screen.getByRole("tabpanel", { name: "Provider error" });
    expect(within(runtimePreview).getByText("Search Provider unavailable")).toBeInTheDocument();
    expect(within(runtimePreview).getByText("Credential and internal endpoint details stay Administrator-only.")).toBeInTheDocument();
  });
});
