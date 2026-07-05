import { useEffect, useState } from "react";

import { CopilotKitWorkspaceProvider } from "../shared/copilotkit-adapter";
import { ConversationShell } from "../features/workspace/conversation-shell";
import { clearAuthToken, getAuthToken, notifyAuthChanged } from "../features/workspace/auth-api";
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

type AuthState = "authenticated" | "unauthenticated";

export function App() {
  const [pathname, setPathname] = useState(window.location.pathname);
  const [authState, setAuthState] = useState<AuthState>(() =>
    getAuthToken() ? "authenticated" : "unauthenticated",
  );

  useEffect(() => {
    function syncPathname() {
      setPathname(window.location.pathname);
    }
    function syncAuthState() {
      setAuthState(getAuthToken() ? "authenticated" : "unauthenticated");
    }

    window.addEventListener("popstate", syncPathname);
    window.addEventListener("minimalist-agent:navigate", syncPathname);
    window.addEventListener("minimalist-agent:auth-changed", syncAuthState);

    return () => {
      window.removeEventListener("popstate", syncPathname);
      window.removeEventListener("minimalist-agent:navigate", syncPathname);
      window.removeEventListener("minimalist-agent:auth-changed", syncAuthState);
    };
  }, []);

  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      setAuthState("unauthenticated");
      return;
    }

    let isCurrent = true;

    fetch("/api/auth/me", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
      .then((response) => {
        if (!isCurrent) {
          return;
        }
        if (response.ok) {
          setAuthState("authenticated");
          return;
        }
        clearAuthToken();
        notifyAuthChanged();
        setAuthState("unauthenticated");
      })
      .catch(() => {
        if (!isCurrent) {
          return;
        }
        clearAuthToken();
        notifyAuthChanged();
        setAuthState("unauthenticated");
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  const route = resolveAppRoute(pathname);
  const isPublicRoute = route === "login" || route === "register" || route === "approval-pending";

  if (!isPublicRoute && protectedRoutes.has(route)) {
    if (authState !== "authenticated") {
      return <LoginPage />;
    }
  }

  const content = renderRoute(route);

  if (isPublicRoute) {
    return content;
  }

  return (
    <CopilotKitWorkspaceProvider>
      {content}
    </CopilotKitWorkspaceProvider>
  );
}

function renderRoute(route: ReturnType<typeof resolveAppRoute>) {
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
      return <ConversationShell />;
    default:
      return <AdminPage route={route} />;
  }
}
