import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { App } from "./App";

describe("Account Approval governance", () => {
  afterEach(() => {
    cleanup();
    window.history.pushState({}, "", "/");
  });

  it("lets an Administrator approve a pending Local Account and review the approval history", async () => {
    const user = userEvent.setup();
    window.history.pushState({}, "", "/admin/account-approval");
    render(<App />);

    const accountApproval = screen.getByRole("region", { name: "Account Approval" });
    expect(screen.getByRole("heading", { name: "Account Approval", level: 1 })).toBeInTheDocument();
    expect(within(accountApproval).getAllByText("lin.request@example.com")).toHaveLength(2);

    const requestedAccount = within(accountApproval).getByRole("row", { name: /lin\.request/ });
    await user.click(within(requestedAccount).getByRole("button", { name: "Approve" }));
    await user.click(within(accountApproval).getByRole("tab", { name: /Enabled/ }));

    expect(within(accountApproval).getAllByText("lin.request@example.com")).toHaveLength(2);
    expect(within(accountApproval).getAllByText("Approved by Administrator")).toHaveLength(2);
  });
});
