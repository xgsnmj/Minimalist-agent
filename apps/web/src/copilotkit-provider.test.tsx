import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { CopilotKitWorkspaceProvider } from "./shared/copilotkit-adapter";

describe("CopilotKitWorkspaceProvider", () => {
  afterEach(() => {
    cleanup();
  });

  it("keeps the runtime URL query-free and sends the token as an Authorization header", () => {
    window.localStorage.setItem("minimalist-agent:auth-token", "local-test-token");

    render(
      <CopilotKitWorkspaceProvider>
        <main>workspace</main>
      </CopilotKitWorkspaceProvider>,
    );

    const provider = screen.getByTestId("copilotkit-provider");
    expect(provider).toHaveAttribute("data-runtime-url", "/api/copilotkit");
    expect(provider).toHaveAttribute("data-authorization", "Bearer local-test-token");
    expect(provider).toHaveAttribute("data-credentials", "same-origin");
    expect(provider).toHaveAttribute("data-use-single-endpoint", "false");
  });
});
