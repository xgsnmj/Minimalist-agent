export const authTokenStorageKey = "minimalist-agent:auth-token";
export const authRequestTimeoutMs = 10_000;

const inFlightGetRequests = new Map<string, Promise<unknown>>();

export type CurrentUser = {
  id: number;
  username: string;
  email: string | null;
  role: "admin" | "user";
  status: "pending" | "enabled" | "rejected" | "disabled";
  note?: string;
  status_reason?: string;
  created_at?: string;
  updated_at?: string;
};

export function getAuthToken() {
  return window.localStorage.getItem(authTokenStorageKey);
}

export function clearAuthToken() {
  window.localStorage.removeItem(authTokenStorageKey);
}

export function notifyAuthChanged() {
  window.dispatchEvent(new Event("minimalist-agent:auth-changed"));
}

function navigateToLogin() {
  const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (currentPath !== "/login") {
    window.history.pushState({}, "", "/login");
  }
  window.dispatchEvent(new Event("minimalist-agent:navigate"));
}

export function logout() {
  clearAuthToken();
  notifyAuthChanged();
  navigateToLogin();
}

export function handleUnauthorized() {
  clearAuthToken();
  notifyAuthChanged();
  navigateToLogin();
}

export async function fetchWithAuthTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = authRequestTimeoutMs,
) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  init.signal?.addEventListener("abort", () => controller.abort(), { once: true });

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("请求超时，请稍后重试。");
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export async function authFetch<T>(
  path: string,
  init: RequestInit = {},
  timeoutMs?: number,
): Promise<T> {
  const token = getAuthToken();
  const headers = new Headers(init.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const requestInit = {
    ...init,
    headers,
  };

  const request = async () => {
    const response = timeoutMs == null
      ? await fetch(`/api${path}`, requestInit)
      : await fetchWithAuthTimeout(`/api${path}`, requestInit, timeoutMs);

    if (!response.ok) {
      if (response.status === 401) {
        handleUnauthorized();
        throw new Error("登录已过期，请重新登录。");
      }
      let detail = "请求失败。";
      try {
        const body = await response.json() as { detail?: string };
        detail = body.detail ?? detail;
      } catch {
        detail = response.statusText || detail;
      }
      throw new Error(detail);
    }

    return response.json() as Promise<T>;
  };

  const requestKey = getInFlightRequestKey(path, init, headers, timeoutMs);
  if (requestKey) {
    const inFlightRequest = inFlightGetRequests.get(requestKey) as Promise<T> | undefined;
    if (inFlightRequest) {
      return inFlightRequest;
    }
    const nextRequest = request().finally(() => {
      inFlightGetRequests.delete(requestKey);
    });
    inFlightGetRequests.set(requestKey, nextRequest);
    return nextRequest;
  }

  return request();
}

export function getCurrentUser() {
  return authFetch<CurrentUser>("/auth/me", {}, authRequestTimeoutMs);
}

export function updateCurrentUser(request: { username: string; email: string | null }) {
  return authFetch<CurrentUser>("/auth/me", {
    method: "PATCH",
    body: JSON.stringify(request),
  });
}

function getInFlightRequestKey(
  path: string,
  init: RequestInit,
  headers: Headers,
  timeoutMs: number | undefined,
) {
  const method = (init.method ?? "GET").toUpperCase();
  if (method !== "GET" || init.body || init.signal) {
    return null;
  }
  const headerEntries = Array.from(headers.entries()).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  return JSON.stringify({
    method,
    path,
    headers: headerEntries,
    timeoutMs: timeoutMs ?? null,
  });
}
