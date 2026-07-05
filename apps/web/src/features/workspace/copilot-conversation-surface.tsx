import { type ReactNode, type UIEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  CopilotChatView,
  UseAgentUpdate,
  useAgent,
  useAttachments,
  useCopilotKit,
  useDefaultRenderTool,
} from "@copilotkit/react-core/v2";
import type { Attachment } from "@copilotkit/react-core/v2";
import type { InputContent, Message } from "@ag-ui/core";

import {
  ConversationCardView,
  type ConversationProcessSummary,
  type ConversationToolCall,
  ProcessSummaryView,
  ToolCallView,
} from "../../shared/conversation-message-rendering";
import type { ConversationCard } from "../../shared/card-schema-contract";
import { CopilotRichMessageRenderingProvider } from "../../shared/copilotkit-rich-message-rendering";
import { uploadRunAttachment } from "./workspace-api";

export type CopilotConversationMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCall?: ConversationToolCall;
  artifactReference?: {
    artifactId: number;
    filename: string;
    previewType: string;
  };
  processSummary?: ConversationProcessSummary;
  card?: ConversationCard;
};

export type CopilotConversationAgent = {
  backendId: number;
  copilotAgentId: string;
  name: string;
};

type CopilotConversationSurfaceProps = {
  activeAgent: CopilotConversationAgent;
  conversationId: string | null;
  conversationMessages: CopilotConversationMessage[];
  currentUserName?: string | null;
  isBackendRunActive: boolean;
  isLoadingWorkspace: boolean;
  modelControls: ReactNode;
  selectedModelId: string;
  onArtifactOpen: (artifactId: number) => void;
  onAttachmentUploaded?: (filename: string) => void;
  onRunSettled: (preferredConversationId?: string | null) => Promise<void>;
  onStopBackendRun: () => Promise<void>;
  onWorkspaceError: (message: string | null) => void;
  previewArtifactId: number | null;
};

const runAttachmentAccept = "text/*,application/json,application/pdf,image/*,.md,.csv";

export function CopilotConversationSurface({
  activeAgent,
  conversationId,
  conversationMessages,
  currentUserName,
  isBackendRunActive,
  isLoadingWorkspace,
  modelControls,
  onArtifactOpen,
  onAttachmentUploaded,
  onRunSettled,
  onStopBackendRun,
  onWorkspaceError,
  previewArtifactId,
  selectedModelId,
}: CopilotConversationSurfaceProps) {
  const threadId = useMemo(
    () =>
      conversationId
        ? `conversation-${conversationId}`
        : `draft-agent-${activeAgent.backendId || "none"}-model-${selectedModelId || "default"}`,
    [activeAgent.backendId, conversationId, selectedModelId],
  );
  const { agent } = useAgent({
    agentId: activeAgent.copilotAgentId,
    updates: [
      UseAgentUpdate.OnMessagesChanged,
      UseAgentUpdate.OnRunStatusChanged,
    ],
    throttleMs: 100,
  });
  const { copilotkit } = useCopilotKit();
  const [inputValue, setInputValue] = useState("");
  const [optimisticMessages, setOptimisticMessages] = useState<Message[]>([]);
  const transcriptRef = useRef<HTMLElement | null>(null);
  const shouldFollowTranscriptRef = useRef(true);
  const previousThreadIdRef = useRef(threadId);
  const stopSettlementRefreshRef = useRef<(() => void) | null>(null);
  const syncedMessageFingerprintRef = useRef<string | null>(null);
  const copilotMessages = useMemo(
    () => ensureUniqueMessageIds(conversationMessages.map(toCopilotMessage)),
    [conversationMessages],
  );
  const liveAgentMessages = Array.isArray(agent.messages) ? agent.messages : [];
  const renderedAgentMessages = useMemo(
    () =>
      ensureUniqueMessageIds(
        mergeOptimisticMessages(
          mergeOptimisticMessages(copilotMessages, liveAgentMessages),
          optimisticMessages,
        ),
      ),
    [copilotMessages, liveAgentMessages, optimisticMessages],
  );
  const richMessagesById = useMemo(
    () => new Map(conversationMessages.map((message) => [message.id, message])),
    [conversationMessages],
  );
  const showEmptyHero = !isLoadingWorkspace && renderedAgentMessages.length === 0;
  const copilotMessageFingerprint = useMemo(
    () => fingerprintCopilotMessages(copilotMessages),
    [copilotMessages],
  );
  const renderedMessageFingerprint = useMemo(
    () => fingerprintCopilotMessages(renderedAgentMessages),
    [renderedAgentMessages],
  );

  useDefaultRenderTool();
  const {
    attachments,
    consumeAttachments,
    containerRef,
    dragOver,
    fileInputRef,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    handleFileUpload,
    removeAttachment,
  } = useAttachments({
    config: {
      accept: runAttachmentAccept,
      enabled: true,
      maxSize: 20 * 1024 * 1024,
      onUpload: async (file) => {
        if (!conversationId) {
          throw new Error("请先发送第一条消息创建对话，再添加上下文附件。");
        }
        const attachment = await uploadRunAttachment(conversationId, file);
        onAttachmentUploaded?.(attachment.filename);
        return {
          type: "url",
          value: `/api/conversations/${conversationId}/run-attachments/${attachment.id}/download`,
          mimeType: attachment.content_type,
          metadata: {
            attachment_id: attachment.id,
            conversation_id: attachment.conversation_id,
            filename: attachment.filename,
            preview_type: attachment.preview_type,
          },
        };
      },
      onUploadFailed: ({ message }) => {
        onWorkspaceError(message || "附件上传失败。");
      },
    },
  });

  useEffect(() => {
    if (syncedMessageFingerprintRef.current === copilotMessageFingerprint) {
      return;
    }
    agent.setMessages(copilotMessages);
    syncedMessageFingerprintRef.current = copilotMessageFingerprint;
  }, [agent, copilotMessageFingerprint, copilotMessages]);

  useEffect(() => {
    setOptimisticMessages((currentMessages) => {
      const nextMessages = currentMessages.filter(
        (message) => !copilotMessages.some((copilotMessage) => haveSameRoleAndContent(copilotMessage, message)),
      );
      return nextMessages.length === currentMessages.length ? currentMessages : nextMessages;
    });
  }, [copilotMessageFingerprint, copilotMessages]);

  useEffect(() => {
    if (previousThreadIdRef.current === threadId) {
      return;
    }
    previousThreadIdRef.current = threadId;
    shouldFollowTranscriptRef.current = true;
    setOptimisticMessages([]);
    queueTranscriptScroll("auto");
  }, [threadId]);

  useEffect(() => {
    if (isLoadingWorkspace || renderedAgentMessages.length === 0) {
      return;
    }
    const lastMessage = renderedAgentMessages[renderedAgentMessages.length - 1];
    if (shouldFollowTranscriptRef.current || lastMessage.role === "user" || agent.isRunning || isBackendRunActive) {
      queueTranscriptScroll(lastMessage.role === "user" ? "smooth" : "auto");
    }
  }, [
    agent.isRunning,
    isBackendRunActive,
    isLoadingWorkspace,
    renderedAgentMessages,
    renderedMessageFingerprint,
  ]);

  useEffect(() => () => {
    stopSettlementRefreshRef.current?.();
  }, []);

  async function submitMessage(value: string) {
    const message = value.trim();
    if (!message || agent.isRunning || !activeAgent.backendId) {
      return;
    }

    const readyAttachments = consumeAttachments();
    onWorkspaceError(null);
    setInputValue("");

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: buildUserMessageContent(message, readyAttachments),
    };
    shouldFollowTranscriptRef.current = true;
    setOptimisticMessages((currentMessages) => [...currentMessages, userMessage]);
    agent.addMessage(userMessage);
    queueTranscriptScroll("smooth");

    let preferredConversationId: string | null = conversationId;
    stopSettlementRefreshRef.current?.();
    stopSettlementRefreshRef.current = scheduleRunSettlementRefresh(() => preferredConversationId);

    try {
      const runResult = await copilotkit.runAgent({
        agent,
        forwardedProps: {
          agent_id: activeAgent.backendId,
          conversation_id: conversationId ? Number(conversationId) : null,
          selected_model_configuration_id: selectedModelId ? Number(selectedModelId) : null,
          thread_id: threadId,
        },
      });
      preferredConversationId = conversationIdFromRunResult(runResult) ?? conversationId;
    } catch (error) {
      onWorkspaceError(error instanceof Error ? error.message : "发送失败。");
    } finally {
      await onRunSettled(preferredConversationId);
    }
  }

  function scheduleRunSettlementRefresh(getPreferredConversationId: () => string | null) {
    let isCancelled = false;
    let timeoutId: number | null = null;
    const delays = [750, 1500, 2500, 4000, 6000, 9000];

    const scheduleNext = (index: number) => {
      if (isCancelled || index >= delays.length) {
        return;
      }
      timeoutId = window.setTimeout(() => {
        void onRunSettled(getPreferredConversationId()).finally(() => {
          scheduleNext(index + 1);
        });
      }, delays[index]);
    };

    scheduleNext(0);
    return () => {
      isCancelled = true;
      if (timeoutId != null) {
        window.clearTimeout(timeoutId);
      }
    };
  }

  async function stopRun() {
    if (isBackendRunActive) {
      await onStopBackendRun();
      return;
    }
    agent.abortRun();
  }

  function handleTranscriptScroll(event: UIEvent<HTMLElement>) {
    const transcript = event.currentTarget;
    const distanceFromBottom = transcript.scrollHeight - transcript.scrollTop - transcript.clientHeight;
    shouldFollowTranscriptRef.current = distanceFromBottom < 180;
  }

  function queueTranscriptScroll(behavior: ScrollBehavior) {
    const scrollToBottom = (nextBehavior: ScrollBehavior) => {
      const transcript = transcriptRef.current;
      if (!transcript) {
        return;
      }
      if (typeof transcript.scrollTo === "function") {
        transcript.scrollTo({
          behavior: nextBehavior,
          top: transcript.scrollHeight,
        });
        return;
      }
      transcript.scrollTop = transcript.scrollHeight;
    };

    window.requestAnimationFrame(() => {
      scrollToBottom(behavior);
      window.setTimeout(() => scrollToBottom("auto"), 80);
      window.setTimeout(() => scrollToBottom("auto"), 220);
    });
  }

  return (
    <div
      aria-label="CopilotKit 对话面板"
      className={dragOver ? "copilot-native-surface drag-over" : "copilot-native-surface"}
      ref={containerRef}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={(event) => {
        void handleDrop(event);
      }}
    >
      <input
        aria-label="添加上下文"
        accept={runAttachmentAccept}
        className="copilot-native-file-input"
        multiple
        ref={fileInputRef}
        type="file"
        onChange={(event) => {
          void handleFileUpload(event);
        }}
      />
      <CopilotRichMessageRenderingProvider
        activeAgentName={activeAgent.name}
        messages={conversationMessages}
        previewArtifactId={previewArtifactId}
        onArtifactOpen={onArtifactOpen}
      >
        <CopilotChatView
          autoScroll="pin-to-send"
          attachments={attachments}
          className="native-copilot-chat"
          dragOver={dragOver}
          hasExplicitThreadId
          inputValue={inputValue}
          isConnecting={isLoadingWorkspace}
          isRunning={agent.isRunning || isBackendRunActive}
          messages={renderedAgentMessages}
          welcomeScreen={false}
          onAddFile={() => fileInputRef.current?.click()}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={(event) => {
            void handleDrop(event);
          }}
          onInputChange={setInputValue}
          onRemoveAttachment={removeAttachment}
          onStop={() => {
            void stopRun();
          }}
          onSubmitMessage={(value) => {
            void submitMessage(value);
          }}
        >
          {({ input }) => (
            <>
              <section
                className="conversation-transcript"
                ref={transcriptRef}
                aria-label="消息记录"
                onScroll={handleTranscriptScroll}
              >
                {isLoadingWorkspace ? (
                  <div className="draft-state">
                    <h3>正在加载对话</h3>
                    <p>正在从后端读取 Agent Conversation、运行状态和制品引用。</p>
                  </div>
                ) : null}
                {showEmptyHero ? (
                  <div className="conversation-empty-hero">
                    <span className="conversation-hero-mark" aria-hidden="true">
                      {activeAgent.name.slice(0, 2).toUpperCase()}
                    </span>
                    <h3>Hi {currentUserName || activeAgent.name}</h3>
                    <p>今天想推进什么？</p>
                  </div>
                ) : null}
                {renderedAgentMessages.length > 0 ? (
                  <ConversationTimeline
                    activeAgentName={activeAgent.name}
                    isStreaming={agent.isRunning || isBackendRunActive}
                    messages={renderedAgentMessages}
                    richMessagesById={richMessagesById}
                    onArtifactOpen={onArtifactOpen}
                  />
                ) : null}
              </section>
              <section className="conversation-composer copilot-native-composer" aria-label="对话输入区">
                <div className="composer-model-row">
                  {modelControls}
                </div>
                {input}
              </section>
            </>
          )}
        </CopilotChatView>
      </CopilotRichMessageRenderingProvider>
    </div>
  );
}

function ConversationTimeline({
  activeAgentName,
  isStreaming,
  messages,
  onArtifactOpen,
  richMessagesById,
}: {
  activeAgentName: string;
  isStreaming: boolean;
  messages: Message[];
  onArtifactOpen: (artifactId: number) => void;
  richMessagesById: ReadonlyMap<string, CopilotConversationMessage>;
}) {
  const entries = buildTimelineEntries(messages, richMessagesById);
  return (
    <div className="conversation-timeline" aria-label="消息时间线">
      {entries.map((entry) =>
        entry.type === "agent-turn" ? (
          <AgentTurn
            activeAgentName={activeAgentName}
            isStreaming={isStreaming}
            items={entry.items}
            key={entry.id}
            onArtifactOpen={onArtifactOpen}
          />
        ) : (
          <TimelineUserMessage key={entry.message.id} message={entry.message} />
        ),
      )}
    </div>
  );
}

type TimelineEntry =
  | {
      message: Message;
      type: "user";
    }
  | {
      id: string;
      items: AgentTurnItem[];
      type: "agent-turn";
    };

type AgentTurnItem = {
  message: Message;
  richMessage?: CopilotConversationMessage;
};

function buildTimelineEntries(
  messages: Message[],
  richMessagesById: ReadonlyMap<string, CopilotConversationMessage>,
): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  let currentAgentTurn: AgentTurnItem[] = [];

  const flushAgentTurn = () => {
    if (currentAgentTurn.length === 0) {
      return;
    }
    entries.push({
      id: `agent-turn-${currentAgentTurn[0].message.id}`,
      items: currentAgentTurn,
      type: "agent-turn",
    });
    currentAgentTurn = [];
  };

  for (const message of messages) {
    if (message.role === "assistant") {
      currentAgentTurn.push({
        message,
        richMessage: richMessagesById.get(message.id),
      });
      continue;
    }

    flushAgentTurn();
    entries.push({
      message,
      type: "user",
    });
  }

  flushAgentTurn();
  return entries;
}

function TimelineUserMessage({ message }: { message: Message }) {
  const text = formatMessageContent(message.content).trim();
  if (!text) {
    return null;
  }

  return (
    <article className={`message-row ${message.role}`} aria-label="用户消息">
      <div className="message-content">{text}</div>
    </article>
  );
}

function AgentTurn({
  activeAgentName,
  isStreaming,
  items,
  onArtifactOpen,
}: {
  activeAgentName: string;
  isStreaming: boolean;
  items: AgentTurnItem[];
  onArtifactOpen: (artifactId: number) => void;
}) {
  return (
    <article className="agent-turn" aria-label={`${activeAgentName} 回复`}>
      <header className="agent-turn-header">
        <span className="agent-turn-avatar" aria-hidden="true">
          {activeAgentName.slice(0, 2).toUpperCase()}
        </span>
        <div className="agent-turn-title">
          <strong>{activeAgentName}</strong>
          <span>{isStreaming ? "生成中" : "已完成"} · 过程摘要与工具调用可见</span>
        </div>
      </header>
      <div className="agent-turn-body">
        {items.map((item, index) => (
          <AgentTurnSegment
            isStreaming={isStreaming && index === items.length - 1}
            item={item}
            key={item.message.id}
            onArtifactOpen={onArtifactOpen}
          />
        ))}
      </div>
    </article>
  );
}

function AgentTurnSegment({
  isStreaming,
  item,
  onArtifactOpen,
}: {
  isStreaming: boolean;
  item: AgentTurnItem;
  onArtifactOpen: (artifactId: number) => void;
}) {
  const { message, richMessage } = item;

  if (richMessage?.processSummary) {
    return (
      <section className="agent-turn-segment process" aria-label="深度思考">
        <p className="agent-segment-label">深度思考</p>
        <ProcessSummaryView processSummary={richMessage.processSummary} />
      </section>
    );
  }

  if (richMessage?.toolCall) {
    return (
      <section className="agent-turn-segment tool" aria-label="工具调用">
        <p className="agent-segment-label">工具调用</p>
        <ToolCallView toolCall={richMessage.toolCall} />
      </section>
    );
  }

  if (richMessage?.artifactReference) {
    return (
      <section className="agent-turn-segment artifact" aria-label="制品">
        <p className="agent-segment-label">制品</p>
        <ConversationCardView
          card={{
            schema: "artifact_card",
            payload: {
              artifact_id: richMessage.artifactReference.artifactId,
              filename: richMessage.artifactReference.filename,
              preview_type: richMessage.artifactReference.previewType,
            },
          }}
          onOpenArtifact={onArtifactOpen}
        />
      </section>
    );
  }

  if (richMessage?.card) {
    return (
      <section className="agent-turn-segment card" aria-label="结构化内容">
        <p className="agent-segment-label">结构化内容</p>
        <ConversationCardView card={richMessage.card} onOpenArtifact={onArtifactOpen} />
      </section>
    );
  }

  const text = formatMessageContent(message.content).trim();
  const legacyProcessSummary = extractLegacyProcessSummary(text);
  if (legacyProcessSummary) {
    return (
      <section className="agent-turn-segment process" aria-label="深度思考">
        <p className="agent-segment-label">深度思考</p>
        <ProcessSummaryView processSummary={{ summary: legacyProcessSummary }} />
      </section>
    );
  }
  if (!text) {
    return null;
  }
  return <AgentTextSegment isStreaming={isStreaming} text={text} />;
}

function extractLegacyProcessSummary(content: string): string | null {
  const prefix = "运行过程：";
  if (!content.startsWith(prefix)) {
    return null;
  }
  const summary = content.slice(prefix.length).trim();
  return summary || null;
}

function AgentTextSegment({
  isStreaming,
  text,
}: {
  isStreaming: boolean;
  text: string;
}) {
  const visibleText = useSmoothStreamingText(text, isStreaming);
  return (
    <section className="agent-turn-segment answer" aria-label="回答">
      <div className="message-content">{visibleText}</div>
      {isStreaming && visibleText.length < text.length ? <span className="stream-caret" aria-hidden="true" /> : null}
    </section>
  );
}

function useSmoothStreamingText(targetText: string, enabled: boolean) {
  const [visibleText, setVisibleText] = useState(() => (enabled ? "" : targetText));

  useEffect(() => {
    if (!enabled) {
      setVisibleText(targetText);
      return;
    }

    setVisibleText((currentText) =>
      targetText.startsWith(currentText) ? currentText : "",
    );
  }, [enabled, targetText]);

  useEffect(() => {
    if (!enabled || visibleText.length >= targetText.length) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setVisibleText((currentText) => {
        if (!targetText.startsWith(currentText)) {
          return targetText.slice(0, 2);
        }
        const nextLength = Math.min(currentText.length + 3, targetText.length);
        return targetText.slice(0, nextLength);
      });
    }, 18);

    return () => window.clearTimeout(timeoutId);
  }, [enabled, targetText, visibleText]);

  return visibleText;
}

function toCopilotMessage(message: CopilotConversationMessage): Message {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
  };
}

function ensureUniqueMessageIds(messages: Message[]): Message[] {
  const seenCounts = new Map<string, number>();
  return messages.map((message) => {
    const seenCount = seenCounts.get(message.id) ?? 0;
    seenCounts.set(message.id, seenCount + 1);
    if (seenCount === 0) {
      return message;
    }
    return {
      ...message,
      id: `${message.id}:duplicate-${seenCount}`,
    };
  });
}

function mergeOptimisticMessages(messages: Message[], optimisticMessages: Message[]): Message[] {
  if (optimisticMessages.length === 0) {
    return messages;
  }
  const existingIds = new Set(messages.map((message) => message.id));
  const existingSignatures = new Set(messages.map(messageSignature));
  const mergedMessages = [...messages];
  for (const message of optimisticMessages) {
    const signature = messageSignature(message);
    if (!existingIds.has(message.id) && !existingSignatures.has(signature)) {
      mergedMessages.push(message);
      existingIds.add(message.id);
      existingSignatures.add(signature);
    }
  }
  return mergedMessages;
}

function haveSameRoleAndContent(left: Message, right: Message): boolean {
  return left.role === right.role && messageContentSignature(left) === messageContentSignature(right);
}

function messageSignature(message: Message): string {
  return `${message.role}:${messageContentSignature(message)}`;
}

function messageContentSignature(message: Message): string {
  return JSON.stringify(message.content) ?? "";
}

function fingerprintCopilotMessages(messages: Message[]): string {
  return JSON.stringify(
    messages.map((message) => ({
      content: message.content,
      id: message.id,
      role: message.role,
    })),
  );
}

function formatMessageContent(content: Message["content"]) {
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((part) => {
      if (typeof part === "string") {
        return part;
      }
      if (part && typeof part === "object" && "text" in part && typeof part.text === "string") {
        return part.text;
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function buildUserMessageContent(message: string, attachments: Attachment[]): string | InputContent[] {
  if (attachments.length === 0) {
    return message;
  }
  return [
    { type: "text", text: message },
    ...attachments.map((attachment) => ({
      type: attachment.type,
      source: attachment.source,
      metadata: {
        ...(attachment.filename ? { filename: attachment.filename } : {}),
        ...attachment.metadata,
      },
    })),
  ] satisfies InputContent[];
}

function conversationIdFromRunResult(result: unknown): string | null {
  if (!isRecord(result)) {
    return null;
  }

  const directConversationId = normalizeConversationId(
    result.conversationId ?? result.conversation_id,
  );
  if (directConversationId) {
    return directConversationId;
  }

  if (!isRecord(result.result)) {
    return null;
  }
  return normalizeConversationId(result.result.conversationId ?? result.result.conversation_id);
}

function normalizeConversationId(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === "string" && value.trim()) {
    return value;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}
