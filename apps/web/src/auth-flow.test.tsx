import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./app/app";

describe("Local Account access flow", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    window.localStorage.clear();
    window.history.pushState({}, "", "/");
  });

  it("shows the login page instead of the conversation workbench when unauthenticated", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "登录" })).toBeInTheDocument();
    expect(screen.queryByText("对话工作台")).not.toBeInTheDocument();
  });

  it("enters the conversation workbench after an approved local account signs in", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ access_token: "local-1" }),
      }),
    );

    render(<App />);

    await user.type(screen.getByLabelText("账号或邮箱"), "admin");
    await user.type(screen.getByLabelText("密码"), "correct horse battery staple");
    await user.click(screen.getByRole("button", { name: "登录" }));

    expect(await screen.findByText("对话工作台")).toBeInTheDocument();
    expect(window.localStorage.getItem("minimalist-agent:auth-token")).toBe("local-1");
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
