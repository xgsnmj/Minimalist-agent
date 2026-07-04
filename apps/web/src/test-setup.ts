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
    CopilotChat: ({ attachments, className, labels }: any) =>
      React.createElement(
        "section",
        { "aria-label": "CopilotKit 对话面板", className },
        React.createElement("p", null, labels?.welcomeMessageText ?? "CopilotKit Chat"),
        React.createElement("textarea", {
          "aria-label": "消息",
          placeholder: labels?.chatInputPlaceholder ?? "询问当前工作台",
        }),
        attachments?.enabled
          ? React.createElement("input", {
              "aria-label": "运行附件",
              type: "file",
              onChange: async (event: any) => {
                const file = event.currentTarget.files?.[0];
                if (file && attachments.onUpload) {
                  await attachments.onUpload(file);
                }
              },
            })
          : null,
        React.createElement("button", { type: "button" }, "发送"),
      ),
    useAgentContext: () => undefined,
    useFrontendTool: () => undefined,
  };
});
