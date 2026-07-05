import { useEffect, useState } from "react";

import { CopilotKitWorkspaceProvider } from "../shared/copilotkit-adapter";
import { ConversationShell } from "../features/workspace/conversation-shell";
import { getAuthToken, getCurrentUser, type CurrentUser } from "../features/workspace/auth-api";
import {
  AccountSettingsPage,
  AdminPage,
  ApprovalPendingPage,
  LoginPage,
  RegisterPage,
  resolveAppRoute,
} from "../routes/planned-pages";

const protectedRoutes = new Set<ReturnType<typeof resolveAppRoute>>([
  "conversation",
  "account-settings",
  "admin-overview",
  "account-approval",
  "agent-lifecycle",
  "model-configurations",
  "mcp-servers",
  "search-provider",
  "page-read-provider",
  "sandbox-status",
  "run-audit",
  "full-trace",
]);

type AuthState = "checking" | "authenticated" | "unauthenticated";

export function App() {
  const [pathname, setPathname] = useState(window.location.pathname);
  const [authState, setAuthState] = useState<AuthState>(() =>
    getAuthToken() ? "checking" : "unauthenticated",
  );
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);

  useEffect(() => {
    function syncPathname() {
      setPathname(window.location.pathname);
    }
    function syncAuthState() {
      const token = getAuthToken();
      setAuthState(token ? "authenticated" : "unauthenticated");
    }
    function navigateWithinApp(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.altKey || event.ctrlKey || event.shiftKey) {
        return;
      }
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) {
        return;
      }
      if (anchor.target || anchor.hasAttribute("download")) {
        return;
      }
      const nextUrl = new URL(anchor.href, window.location.href);
      if (nextUrl.origin !== window.location.origin || nextUrl.protocol !== window.location.protocol) {
        return;
      }
      const nextPath = `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`;
      const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (nextPath === currentPath) {
        event.preventDefault();
        return;
      }
      event.preventDefault();
      window.history.pushState({}, "", nextPath);
      window.dispatchEvent(new Event("minimalist-agent:navigate"));
    }

    document.addEventListener("click", navigateWithinApp);
    window.addEventListener("popstate", syncPathname);
    window.addEventListener("minimalist-agent:navigate", syncPathname);
    window.addEventListener("minimalist-agent:auth-changed", syncAuthState);

    return () => {
      document.removeEventListener("click", navigateWithinApp);
      window.removeEventListener("popstate", syncPathname);
      window.removeEventListener("minimalist-agent:navigate", syncPathname);
      window.removeEventListener("minimalist-agent:auth-changed", syncAuthState);
    };
  }, []);

  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      setCurrentUser(null);
      setAuthState("unauthenticated");
      return;
    }

    let isCurrent = true;

    getCurrentUser()
      .then((user) => {
        if (!isCurrent) {
          return;
        }
        setCurrentUser(user);
        setAuthState("authenticated");
      })
      .catch(() => {
        if (!isCurrent) {
          return;
        }
        setCurrentUser(null);
        setAuthState(getAuthToken() ? "authenticated" : "unauthenticated");
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  const route = resolveAppRoute(pathname);
  const isPublicRoute = route === "login" || route === "register" || route === "approval-pending";
  const isProtectedRoute = !isPublicRoute && protectedRoutes.has(route);

  if (isProtectedRoute) {
    if (authState === "checking") {
      return <AuthVerificationFallback />;
    }
    if (authState === "unauthenticated") {
      return <LoginPage />;
    }
  }

  const content = renderRoute(route, currentUser);

  if (isPublicRoute) {
    return content;
  }

  return (
    <CopilotKitWorkspaceProvider>
      {content}
    </CopilotKitWorkspaceProvider>
  );
}

function AuthVerificationFallback() {
  return (
    <main className="app-shell" aria-label="认证校验">
      <p className="empty-state" role="status">正在验证登录状态...</p>
    </main>
  );
}

function renderRoute(route: ReturnType<typeof resolveAppRoute>, currentUser: CurrentUser | null) {
  switch (route) {
    case "login":
      return <LoginPage />;
    case "register":
      return <RegisterPage />;
    case "approval-pending":
      return <ApprovalPendingPage />;
    case "account-settings":
      return <AccountSettingsPage />;
    case "conversation":
      return <ConversationShell currentUser={currentUser} />;
    default:
      return <AdminPage route={route} />;
  }
}
