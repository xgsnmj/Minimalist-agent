import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { App } from "./App";

describe("Local Account access flow", () => {
  afterEach(() => {
    cleanup();
    window.history.pushState({}, "", "/");
  });

  it("shows a pending approval state after registration", async () => {
    const user = userEvent.setup();
    window.history.pushState({}, "", "/register");
    render(<App />);

    await user.type(screen.getByLabelText("用户名"), "lin");
    await user.type(screen.getByLabelText("邮箱"), "lin@example.com");
    await user.type(screen.getByLabelText("密码"), "correct horse battery staple");
    await user.type(screen.getByLabelText("确认密码"), "correct horse battery staple");
    await user.click(screen.getByRole("button", { name: "提交申请" }));

    expect(await screen.findByRole("heading", { name: "待审批" })).toBeInTheDocument();
    expect(screen.getByText("等待管理员")).toBeInTheDocument();
  });
});
