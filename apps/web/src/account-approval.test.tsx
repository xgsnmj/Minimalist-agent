import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { App } from "./app/app";

describe("Account Approval governance", () => {
  afterEach(() => {
    cleanup();
    window.history.pushState({}, "", "/");
  });

  it("lets an Administrator approve a pending Local Account and review the approval history", async () => {
    const user = userEvent.setup();
    window.history.pushState({}, "", "/admin/account-approval");
    render(<App />);

    const accountApproval = screen.getByRole("region", { name: "账号审批" });
    expect(screen.getByRole("heading", { name: "账号审批", level: 1 })).toBeInTheDocument();
    expect(await within(accountApproval).findAllByText("lin.request@example.com")).toHaveLength(2);

    const requestedAccount = within(accountApproval).getByRole("row", { name: /lin\.request/ });
    await user.click(within(requestedAccount).getByRole("button", { name: "批准" }));
    await user.click(within(accountApproval).getByRole("tab", { name: /已启用/ }));

    expect(await within(accountApproval).findAllByText("lin.request@example.com")).toHaveLength(2);
    expect(within(accountApproval).getAllByText("管理员已批准").length).toBeGreaterThanOrEqual(2);
  });
});
