import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { App } from "./app/app";

describe("planned page routes", () => {
  afterEach(() => {
    cleanup();
    window.history.pushState({}, "", "/");
  });

  it("renders the Local Account access pages", () => {
    window.history.pushState({}, "", "/login");
    render(<App />);
    expect(screen.getByRole("heading", { name: "登录" })).toBeInTheDocument();

    cleanup();
    window.history.pushState({}, "", "/register");
    render(<App />);
    expect(screen.getByRole("heading", { name: "申请账号" })).toBeInTheDocument();

    cleanup();
    window.history.pushState({}, "", "/approval-pending");
    render(<App />);
    expect(screen.getByRole("heading", { name: "待审批" })).toBeInTheDocument();
  });

  it("renders the Administrator Console pages from route paths", () => {
    window.history.pushState({}, "", "/admin");
    render(<App />);
    expect(screen.getByRole("heading", { name: "治理总览" })).toBeInTheDocument();

    cleanup();
    window.history.pushState({}, "", "/admin/run-audit");
    render(<App />);
    expect(screen.getByRole("heading", { level: 1, name: "运行审计" })).toBeInTheDocument();

    cleanup();
    window.history.pushState({}, "", "/admin/full-trace");
    render(<App />);
    expect(screen.getByRole("heading", { level: 1, name: "完整追踪详情" })).toBeInTheDocument();
  });

  it("loads and updates authenticated account settings", async () => {
    const user = userEvent.setup();
    window.history.pushState({}, "", "/account-settings");
    render(<App />);

    expect(await screen.findByRole("heading", { name: "账号设置" })).toBeInTheDocument();
    expect(screen.getAllByText("wang.user").length).toBeGreaterThan(0);
    expect(screen.queryByText("oil@example.com")).not.toBeInTheDocument();

    const profileForm = screen.getByRole("form", { name: "个人信息修改" });
    await user.clear(within(profileForm).getByLabelText("用户名"));
    await user.type(within(profileForm).getByLabelText("用户名"), "wang.updated");
    await user.clear(within(profileForm).getByLabelText("邮箱"));
    await user.type(within(profileForm).getByLabelText("邮箱"), "wang.updated@example.com");
    await user.click(within(profileForm).getByRole("button", { name: "保存个人信息" }));

    expect(await screen.findByText("账号信息已保存。")).toBeInTheDocument();
    expect(screen.getAllByText("wang.updated").length).toBeGreaterThan(0);
    expect(screen.getByText("wang.updated@example.com")).toBeInTheDocument();
  });

  it("logs out from account settings", async () => {
    const user = userEvent.setup();
    window.history.pushState({}, "", "/account-settings");
    render(<App />);

    await screen.findByRole("heading", { name: "账号设置" });
    await user.click(screen.getByRole("button", { name: "退出登录" }));

    expect(window.localStorage.getItem("minimalist-agent:auth-token")).toBeNull();
    expect(window.location.pathname).toBe("/login");
    expect(await screen.findByRole("heading", { name: "登录" })).toBeInTheDocument();
  });
});
