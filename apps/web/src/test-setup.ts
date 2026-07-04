/// <reference types="@testing-library/jest-dom/vitest" />
import * as matchers from "@testing-library/jest-dom/matchers";
import type { ReactNode } from "react";
import { expect, vi } from "vitest";

expect.extend(matchers);

vi.mock("@copilotkit/react-core/v2", async () => {
  const React = await import("react");

  return {
    CopilotKit: ({ children }: { children: ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    CopilotSidebar: () => null,
    useAgentContext: () => undefined,
    useFrontendTool: () => undefined,
  };
});
