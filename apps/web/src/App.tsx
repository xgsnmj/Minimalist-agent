import { useEffect, useState } from "react";

import { CopilotKitWorkspaceProvider } from "./copilotkit-adapter";
import { ConversationShell } from "./conversation-shell";
import {
  AccountSettingsPage,
  AdminPage,
  ApprovalPendingPage,
  LoginPage,
  RegisterPage,
  resolveAppRoute,
} from "./planned-pages";

export function App() {
  const [pathname, setPathname] = useState(window.location.pathname);

  useEffect(() => {
    function syncPathname() {
      setPathname(window.location.pathname);
    }

    window.addEventListener("popstate", syncPathname);
    window.addEventListener("minimalist-agent:navigate", syncPathname);

    return () => {
      window.removeEventListener("popstate", syncPathname);
      window.removeEventListener("minimalist-agent:navigate", syncPathname);
    };
  }, []);

  const route = resolveAppRoute(pathname);
  const content = renderRoute(route);

  if (route === "login" || route === "register" || route === "approval-pending") {
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
