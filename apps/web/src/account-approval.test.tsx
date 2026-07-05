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

    const accountApproval = await screen.findByRole("region", { name: "账号审批" });
    expect(screen.getByRole("heading", { name: "账号审批", level: 1 })).toBeInTheDocument();
    expect(await within(accountApproval).findAllByText("lin.request@example.com")).toHaveLength(2);

    const requestedAccount = within(accountApproval).getByRole("row", { name: /lin\.request/ });
    await user.click(within(requestedAccount).getByRole("button", { name: "批准" }));
    await user.click(within(accountApproval).getByRole("tab", { name: /已启用/ }));

    expect(await within(accountApproval).findAllByText("lin.request@example.com")).toHaveLength(2);
    expect(within(accountApproval).getAllByText("管理员已批准").length).toBeGreaterThanOrEqual(2);
  });

  it("saves administrator notes, records reasons, and re-enables reviewed accounts", async () => {
    const user = userEvent.setup();
    window.history.pushState({}, "", "/admin/account-approval");
    render(<App />);

    const accountApproval = await screen.findByRole("region", { name: "账号审批" });
    expect(await within(accountApproval).findAllByText("lin.request@example.com")).toHaveLength(2);
    await user.type(within(accountApproval).getByLabelText("管理员备注"), "已核对部门负责人");
    await user.click(within(accountApproval).getByRole("button", { name: "保存备注" }));
    expect(await within(accountApproval).findByText("管理员备注已保存。")).toBeInTheDocument();

    await user.click(within(accountApproval).getByRole("tab", { name: /已拒绝/ }));
    expect(await within(accountApproval).findByText("Unable to verify requester.")).toBeInTheDocument();
    const rejectedRow = within(accountApproval).getByRole("row", { name: /unknown\.vendor/ });
    await user.type(within(accountApproval).getByLabelText("操作原因"), "重新提交资料通过。");
    await user.click(within(rejectedRow).getByRole("button", { name: "重新启用" }));
    expect(await within(accountApproval).findByText("账号状态已更新。")).toBeInTheDocument();
    await user.click(within(accountApproval).getByRole("tab", { name: /已启用/ }));
    expect(await within(accountApproval).findAllByText("unknown.vendor@example.com")).toHaveLength(2);
    expect(within(accountApproval).getAllByText(/重新提交资料通过/).length).toBeGreaterThan(0);
  });
});
