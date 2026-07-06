import { describe, expect, it } from "vitest";

import {
  mapConversation,
  mapStreamEventsToMessages,
  mergeConversationMessages,
} from "./features/workspace/workspace-session-model";
import type { ApiConversation, ApiRun } from "./features/workspace/workspace-api";

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

  it("maps live tool events and keeps persisted messages authoritative", () => {
    const runs: ApiRun[] = [
      {
        assistant_message: null,
        conversation_id: 5,
        error: null,
        id: 9,
        owner_user_id: 7,
        process_summaries: [],
        status: "running",
        status_events: ["queued", "running"],
        user_message: "继续调研。",
        worker_enqueued: true,
      },
    ];
    const streamMessages = mapStreamEventsToMessages({
      conversationId: "5",
      events: [
        {
          data: {
            tool_call: {
              id: 42,
              run_id: 9,
              safe_output: { summary: "读取页面摘要。" },
              status: "completed",
              tool_name: "page.read",
            },
          },
          eventType: "tool.call",
          sequence: 12,
        },
      ],
      runId: runs[0].id,
    });

    expect(mergeConversationMessages(streamMessages)).toEqual([
      expect.objectContaining({
        content: "工具调用：page.read（completed）",
        id: "run-9-event-12",
        toolCall: expect.objectContaining({
          safeOutput: { summary: "读取页面摘要。" },
          toolName: "page.read",
        }),
      }),
    ]);
  });
});
