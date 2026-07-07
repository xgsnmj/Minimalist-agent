import { describe, expect, it } from "vitest";

import {
  mapConversation,
} from "./features/workspace/workspace-session-model";
import type { ApiConversation } from "./features/workspace/workspace-api";

describe("WorkspaceSessionModel", () => {
  it("filters process summaries from persisted conversation messages", () => {
    const conversation: ApiConversation = {
      agent: {
        allowed_model_configuration_ids: [1],
        capability_policy: {
          mcp_server_ids: [],
          page_read_enabled: false,
          sandbox_enabled: false,
          search_enabled: false,
        },
        default_model_configuration_id: 1,
        description: "默认智能体",
        icon: "agent",
        id: 1,
        instruction: "Help.",
        is_default: true,
        name: "Default Agent",
        process_visibility: "standard",
        sdk_settings: {
          max_turns: 10,
          reset_tool_choice: true,
          tool_use_behavior: "run_llm_again",
        },
        status: "enabled",
      },
      deleted: false,
      id: 3,
      messages: [
        { content: "请分析材料。", role: "user" },
        {
          content: "运行过程：读取上下文。",
          event_type: "process.summary",
          process_summary: "读取上下文。",
          role: "assistant",
        },
        { content: "分析完成。", role: "assistant" },
      ],
      selected_model_configuration_id: 1,
      status: "idle",
      title: "材料分析",
      updated_at: "just now",
    };

    expect(mapConversation(conversation, []).messages.map((message) => message.content)).toEqual([
      "请分析材料。",
      "分析完成。",
    ]);
  });

});
