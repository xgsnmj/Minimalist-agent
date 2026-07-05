import { StrictMode } from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./app/app";
import { authFetch, authTokenStorageKey } from "./features/workspace/auth-api";

function countCurrentUserRequests(fetchMock: ReturnType<typeof vi.fn>) {
  return countGetRequests(fetchMock, "/api/auth/me");
}

function countGetRequests(fetchMock: ReturnType<typeof vi.fn>, url: string) {
  return fetchMock.mock.calls.filter(([input, init]) =>
    String(input) === url && (init?.method ?? "GET") === "GET",
  ).length;
}

describe("Local Account access flow", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    window.localStorage.clear();
    window.history.pushState({}, "", "/");
  });

  it("shows the login page instead of the conversation workbench when unauthenticated", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "登录" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "申请" })).toHaveLength(1);
    expect(screen.queryByText("对话工作台")).not.toBeInTheDocument();
    expect(screen.queryByTestId("copilotkit-provider")).not.toBeInTheDocument();
  });

  it("does not mount CopilotKit while a stale token is rejected", async () => {
    window.localStorage.setItem(authTokenStorageKey, "stale-token");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ detail: "Authentication required." }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(screen.queryByTestId("copilotkit-provider")).not.toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "登录" })).toBeInTheDocument();
    expect(screen.queryByTestId("copilotkit-provider")).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/api/copilotkit/info",
      expect.anything(),
    );
  });

  it("keeps protected content behind auth verification before mounting CopilotKit", () => {
    window.history.pushState({}, "", "/app/conversations");
    window.localStorage.setItem(authTokenStorageKey, "pending-token-checking");
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));

    render(<App />);

    expect(screen.getByRole("status")).toHaveTextContent("正在验证登录状态");
    expect(screen.queryByTestId("copilotkit-provider")).not.toBeInTheDocument();
    expect(screen.queryByText("对话工作台")).not.toBeInTheDocument();
  });

  it("stops waiting forever when auth verification never responds", async () => {
    vi.useFakeTimers();
    window.history.pushState({}, "", "/app/conversations");
    window.localStorage.setItem(authTokenStorageKey, "pending-token");
    vi.stubGlobal(
      "fetch",
      vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      })),
    );

    render(<App />);

    expect(screen.getByRole("status")).toHaveTextContent("正在验证登录状态");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByText("对话工作台")).toBeInTheDocument();
    expect(window.localStorage.getItem(authTokenStorageKey)).toBe("pending-token");
  });

  it("keeps the Administrator Console behind auth verification before mounting CopilotKit", () => {
    window.history.pushState({}, "", "/admin");
    window.localStorage.setItem(authTokenStorageKey, "pending-token");
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));

    render(<App />);

    expect(screen.getByRole("status")).toHaveTextContent("正在验证登录状态");
    expect(screen.queryByTestId("copilotkit-provider")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "治理总览" })).not.toBeInTheDocument();
  });

  it("navigates administrator menu links without revalidating the current user", async () => {
    const user = userEvent.setup();
    window.history.pushState({}, "", "/admin");
    window.localStorage.setItem(authTokenStorageKey, "local-test-token");
    const fetchMock = vi.mocked(fetch);

    render(<App />);

    expect(await screen.findByRole("heading", { name: "治理总览" })).toBeInTheDocument();
    expect(countCurrentUserRequests(fetchMock)).toBe(1);

    await user.click(screen.getByRole("link", { name: /智能体生命周期/ }));

    expect(window.location.pathname).toBe("/admin/agents");
    expect(await screen.findByRole("heading", { name: "智能体生命周期" })).toBeInTheDocument();
    expect(countCurrentUserRequests(fetchMock)).toBe(1);
  });

  it("deduplicates initial protected route requests when StrictMode remounts effects", async () => {
    window.history.pushState({}, "", "/app/conversations");
    window.localStorage.setItem(authTokenStorageKey, "local-test-token");
    const fetchMock = vi.mocked(fetch);

    render(
      <StrictMode>
        <App />
      </StrictMode>,
    );

    expect(await screen.findByText("对话工作台")).toBeInTheDocument();
    await waitFor(() => {
      expect(countGetRequests(fetchMock, "/api/workspace/agents")).toBe(1);
      expect(countGetRequests(fetchMock, "/api/conversations")).toBe(1);
      expect(countGetRequests(fetchMock, "/api/runs")).toBe(1);
    });
    expect(countCurrentUserRequests(fetchMock)).toBe(1);
  });

  it("clears the local session and redirects to login when an authenticated API returns 401", async () => {
    window.localStorage.setItem(authTokenStorageKey, "expired-token");
    window.history.pushState({}, "", "/app/conversations");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ detail: "Authentication required." }),
      }),
    );

    await expect(authFetch("/workspace/agents")).rejects.toThrow("登录已过期，请重新登录。");

    expect(window.localStorage.getItem(authTokenStorageKey)).toBeNull();
    expect(window.location.pathname).toBe("/login");
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

  it("returns to the login page after a registration request is submitted", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        id: 6,
        username: "lin",
        email: "lin@example.com",
        role: "user",
        status: "pending",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    window.history.pushState({}, "", "/register");
    render(<App />);

    expect(screen.getAllByRole("link", { name: "登录" })).toHaveLength(1);
    await user.type(screen.getByLabelText("用户名"), "lin");
    await user.type(screen.getByLabelText("邮箱"), "lin@example.com");
    await user.type(screen.getByLabelText("密码"), "correct horse battery staple");
    await user.type(screen.getByLabelText("确认密码"), "correct horse battery staple");
    await user.click(screen.getByRole("button", { name: "提交申请" }));

    expect(fetchMock).toHaveBeenCalledWith("/api/auth/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username: "lin",
        email: "lin@example.com",
        password: "correct horse battery staple",
      }),
    });
    expect(window.location.pathname).toBe("/login");
    expect(await screen.findByRole("heading", { name: "登录" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("账号申请已提交，审批通过后即可登录");
    expect(screen.queryByRole("heading", { name: "待审批" })).not.toBeInTheDocument();
  });
});
