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

import type { ConversationToolCall } from "../../shared/conversation-message-rendering";
import type { ConversationCard } from "../../shared/card-schema-contract";
import { CopilotRichMessageRenderingProvider } from "../../shared/copilotkit-rich-message-rendering";
import { useUploadRunAttachmentMutation } from "./workspace-queries";

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
  const uploadRunAttachmentMutation = useUploadRunAttachmentMutation();
  const transcriptRef = useRef<HTMLElement | null>(null);
  const shouldFollowTranscriptRef = useRef(true);
  const previousThreadIdRef = useRef(threadId);
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
  const visibleAgentMessages = isLoadingWorkspace ? [] : renderedAgentMessages;
  const showEmptyHero = !isLoadingWorkspace && visibleAgentMessages.length === 0;
  const copilotMessageFingerprint = useMemo(
    () => fingerprintCopilotMessages(copilotMessages),
    [copilotMessages],
  );
  const renderedMessageFingerprint = useMemo(
    () => fingerprintCopilotMessages(renderedAgentMessages),
    [renderedAgentMessages],
  );

  useDefaultRenderTool();

  useEffect(() => {
    agent.threadId = threadId;
  }, [agent, threadId]);

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
        const attachment = await uploadRunAttachmentMutation.mutateAsync({ conversationId, file });
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

  async function submitMessage(value: string) {
    const message = value.trim();
    if (!message || agent.isRunning || !activeAgent.backendId) {
      return;
    }

    const readyAttachments = consumeAttachments();
    onWorkspaceError(null);
    setInputValue("");

    const userMessage: Message = {
      id: createClientMessageId(),
      role: "user",
      content: buildUserMessageContent(message, readyAttachments),
    };
    shouldFollowTranscriptRef.current = true;
    setOptimisticMessages((currentMessages) => [...currentMessages, userMessage]);
    agent.addMessage(userMessage);
    queueTranscriptScroll("smooth");

    let preferredConversationId: string | null = conversationId;

    try {
      agent.threadId = threadId;
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
          {({ input, messageView }) => (
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
                {visibleAgentMessages.length > 0 ? messageView : null}
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

function createClientMessageId() {
  const cryptoProvider = globalThis.crypto as Crypto | undefined;
  if (typeof cryptoProvider?.randomUUID === "function") {
    return cryptoProvider.randomUUID();
  }
  if (typeof cryptoProvider?.getRandomValues === "function") {
    const bytes = cryptoProvider.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
    return [
      hex.slice(0, 4).join(""),
      hex.slice(4, 6).join(""),
      hex.slice(6, 8).join(""),
      hex.slice(8, 10).join(""),
      hex.slice(10, 16).join(""),
    ].join("-");
  }
  return `client-message-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

type NativeAssistantToolCall = {
  id: string;
  function: {
    name: string;
    arguments: string;
  };
};

function nativeAssistantToolCalls(message: Message): NativeAssistantToolCall[] {
  if (message.role !== "assistant") {
    return [];
  }
  const toolCalls = (message as { toolCalls?: unknown }).toolCalls;
  if (!Array.isArray(toolCalls)) {
    return [];
  }
  return toolCalls.filter((toolCall): toolCall is NativeAssistantToolCall =>
    isRecord(toolCall) &&
    typeof toolCall.id === "string" &&
    isRecord(toolCall.function) &&
    typeof toolCall.function.name === "string" &&
    typeof toolCall.function.arguments === "string",
  );
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
  return `${message.role}:${messageContentSignature(message)}:${messageMetadataSignature(message)}`;
}

function messageContentSignature(message: Message): string {
  return JSON.stringify(message.content) ?? "";
}

function fingerprintCopilotMessages(messages: Message[]): string {
  return JSON.stringify(
    messages.map((message) => ({
      content: message.content,
      id: message.id,
      metadata: messageMetadataSignature(message),
      role: message.role,
    })),
  );
}

function messageMetadataSignature(message: Message): string {
  if (message.role === "assistant") {
    return JSON.stringify(nativeAssistantToolCalls(message));
  }
  if (message.role === "tool" && "toolCallId" in message) {
    return String(message.toolCallId);
  }
  return "";
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
