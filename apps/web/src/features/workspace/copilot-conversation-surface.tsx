import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  CopilotChatView,
  UseAgentUpdate,
  useAgent,
  useAttachments,
  useConfigureSuggestions,
  useCopilotKit,
  useDefaultRenderTool,
  useSuggestions,
} from "@copilotkit/react-core/v2";
import type { Attachment } from "@copilotkit/react-core/v2";
import type { InputContent, Message } from "@ag-ui/core";
import { Paperclip } from "lucide-react";

import { type ConversationToolCall } from "../../shared/conversation-message-rendering";
import type { ConversationCard } from "../../shared/card-schema-contract";
import { CopilotRichMessageRenderingProvider } from "../../shared/copilotkit-rich-message-rendering";
import { Button } from "@/components/ui/button";
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
  const [suggestionLoadingIndexes, setSuggestionLoadingIndexes] = useState<ReadonlyArray<number>>([]);
  const syncedMessageFingerprintRef = useRef<string | null>(null);
  const copilotMessages = useMemo(
    () => conversationMessages.map(toCopilotMessage),
    [conversationMessages],
  );
  const copilotMessageFingerprint = useMemo(
    () => fingerprintCopilotMessages(copilotMessages),
    [copilotMessages],
  );

  useDefaultRenderTool();
  useConfigureSuggestions(
    {
      available: "always",
      consumerAgentId: activeAgent.copilotAgentId,
      suggestions: buildStaticSuggestions(conversationId),
    },
    [activeAgent.copilotAgentId, conversationId],
  );
  const {
    clearSuggestions,
    isLoading: isLoadingSuggestions,
    reloadSuggestions,
    suggestions,
  } = useSuggestions({ agentId: activeAgent.copilotAgentId });
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
    if (!isLoadingSuggestions) {
      setSuggestionLoadingIndexes((currentIndexes) =>
        currentIndexes.length === 0 ? currentIndexes : [],
      );
      return;
    }
    const nextIndexes = suggestions.map((_suggestion, index) => index);
    setSuggestionLoadingIndexes((currentIndexes) =>
      areNumberArraysEqual(currentIndexes, nextIndexes) ? currentIndexes : nextIndexes,
    );
  }, [isLoadingSuggestions, suggestions]);

  async function submitMessage(value: string) {
    const message = value.trim();
    if (!message || agent.isRunning || !activeAgent.backendId) {
      return;
    }

    const readyAttachments = consumeAttachments();
    onWorkspaceError(null);
    setInputValue("");
    clearSuggestions();

    agent.addMessage({
      id: crypto.randomUUID(),
      role: "user",
      content: buildUserMessageContent(message, readyAttachments),
    });

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
      await onRunSettled(conversationIdFromRunResult(runResult) ?? conversationId);
      reloadSuggestions();
    } catch (error) {
      onWorkspaceError(error instanceof Error ? error.message : "发送失败。");
      await onRunSettled(conversationId);
    }
  }

  async function stopRun() {
    if (isBackendRunActive) {
      await onStopBackendRun();
      return;
    }
    agent.abortRun();
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
          messages={agent.messages}
          suggestionLoadingIndexes={suggestionLoadingIndexes}
          suggestions={suggestions}
          welcomeScreen={false}
          onAddFile={() => fileInputRef.current?.click()}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={(event) => {
            void handleDrop(event);
          }}
          onInputChange={setInputValue}
          onRemoveAttachment={removeAttachment}
          onSelectSuggestion={(suggestion) => {
            setInputValue(suggestion.message);
          }}
          onStop={() => {
            void stopRun();
          }}
          onSubmitMessage={(value) => {
            void submitMessage(value);
          }}
        >
          {({ input, messageView, suggestionView }) => (
            <>
              <section className="conversation-transcript" aria-label="消息记录">
                {isLoadingWorkspace ? (
                  <div className="draft-state">
                    <h3>正在加载对话</h3>
                    <p>正在从后端读取 Agent Conversation、运行状态和制品引用。</p>
                  </div>
                ) : null}
                {messageView}
              </section>
              <section className="conversation-composer copilot-native-composer" aria-label="对话输入区">
                <div className="composer-model-row">
                  {modelControls}
                  <div className="composer-context-actions">
                    <Button
                      aria-label="添加上下文"
                      className="context-upload-control"
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Paperclip aria-hidden="true" />
                      <span>添加上下文</span>
                    </Button>
                  </div>
                </div>
                {suggestionView}
                {input}
              </section>
            </>
          )}
        </CopilotChatView>
      </CopilotRichMessageRenderingProvider>
    </div>
  );
}

function toCopilotMessage(message: CopilotConversationMessage): Message {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
  };
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

function areNumberArraysEqual(left: ReadonlyArray<number>, right: ReadonlyArray<number>): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
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

function buildStaticSuggestions(conversationId: string | null) {
  if (!conversationId) {
    return [
      { title: "规划任务", message: "帮我把这个目标拆成可执行步骤。" },
      { title: "生成简报", message: "基于我的输入生成一份简明工作简报。" },
      { title: "列出风险", message: "先列出这个任务的主要风险和需要确认的问题。" },
    ];
  }
  return [
    { title: "总结当前对话", message: "总结当前对话的结论和下一步。" },
    { title: "继续推进", message: "基于当前上下文继续推进下一步。" },
    { title: "生成制品", message: "把当前结论整理成可预览的 Markdown 制品。" },
  ];
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
