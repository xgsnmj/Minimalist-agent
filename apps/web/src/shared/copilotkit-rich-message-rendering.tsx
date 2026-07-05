import { createContext, ReactNode, useContext, useMemo } from "react";
import type { Message } from "@ag-ui/core";
import type { ReactCustomMessageRenderer } from "@copilotkit/react-core/v2";

import {
  ConversationCardView,
  ProcessSummaryView,
  ToolCallView,
  type ConversationProcessSummary,
  type ConversationToolCall,
} from "./conversation-message-rendering";
import type { ConversationCard } from "./card-schema-contract";
import { Button } from "@/components/ui/button";

export type CopilotRichMessage = {
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

type ArtifactReference = NonNullable<CopilotRichMessage["artifactReference"]>;

type RichMessageRenderingContextValue = {
  activeAgentName: string;
  messagesById: ReadonlyMap<string, CopilotRichMessage>;
  onArtifactOpen: (artifactId: number) => void;
  previewArtifactId: number | null;
};

const RichMessageRenderingContext = createContext<RichMessageRenderingContextValue | null>(null);

export const minimalistRichMessageRenderer: ReactCustomMessageRenderer = {
  render: MinimalistRichMessageRenderer,
};

export function CopilotRichMessageRenderingProvider({
  activeAgentName,
  children,
  messages,
  onArtifactOpen,
  previewArtifactId,
}: {
  activeAgentName: string;
  children: ReactNode;
  messages: CopilotRichMessage[];
  onArtifactOpen: (artifactId: number) => void;
  previewArtifactId: number | null;
}) {
  const messagesById = useMemo(
    () => new Map(messages.map((message) => [message.id, message])),
    [messages],
  );
  const value = useMemo(
    () => ({
      activeAgentName,
      messagesById,
      onArtifactOpen,
      previewArtifactId,
    }),
    [activeAgentName, messagesById, onArtifactOpen, previewArtifactId],
  );

  return (
    <RichMessageRenderingContext.Provider value={value}>
      {children}
    </RichMessageRenderingContext.Provider>
  );
}

function MinimalistRichMessageRenderer({
  message,
  position,
}: {
  message: Message;
  position: "before" | "after";
}) {
  const context = useContext(RichMessageRenderingContext);
  if (position !== "after" || !context) {
    return null;
  }

  const richMessage = context.messagesById.get(message.id);
  if (!richMessage || !hasRichContent(richMessage)) {
    return null;
  }

  const artifactReference = getMessageArtifactReference(richMessage);
  return (
    <div className="conversation-rich-message" aria-label="结构化消息">
      <span className="message-role">
        {richMessage.role === "user" ? "你" : context.activeAgentName}
      </span>
      {artifactReference ? (
        <ArtifactReferenceCard
          isActive={artifactReference.artifactId === context.previewArtifactId}
          reference={artifactReference}
          onOpen={context.onArtifactOpen}
        />
      ) : null}
      {richMessage.processSummary ? (
        <ProcessSummaryView processSummary={richMessage.processSummary} />
      ) : null}
      {richMessage.toolCall ? <ToolCallView toolCall={richMessage.toolCall} /> : null}
      {richMessage.card ? (
        <ConversationCardView
          card={richMessage.card}
          onOpenArtifact={context.onArtifactOpen}
        />
      ) : null}
    </div>
  );
}

function hasRichContent(message: CopilotRichMessage): boolean {
  return Boolean(message.artifactReference || message.processSummary || message.toolCall || message.card);
}

function ArtifactReferenceCard({
  isActive,
  onOpen,
  reference,
}: {
  isActive: boolean;
  onOpen: (artifactId: number) => void;
  reference: ArtifactReference;
}) {
  return (
    <Button
      aria-label={`打开制品 ${reference.filename}`}
      className={isActive ? "artifact-reference-card active" : "artifact-reference-card"}
      type="button"
      onClick={() => onOpen(reference.artifactId)}
    >
      <span className="artifact-reference-icon" aria-hidden="true">
        {formatArtifactType(reference.previewType)}
      </span>
      <span className="artifact-reference-body">
        <strong>{reference.filename}</strong>
        <span>刚刚生成 · 点击预览</span>
      </span>
      <span className="artifact-reference-thumb" aria-hidden="true">
        # 简报
      </span>
    </Button>
  );
}

function getMessageArtifactReference(message: CopilotRichMessage): ArtifactReference | null {
  if (message.artifactReference) {
    return message.artifactReference;
  }

  if (message.card?.schema !== "artifact_card") {
    return null;
  }

  const artifactId = Number(message.card.payload.artifact_id);
  if (!Number.isFinite(artifactId)) {
    return null;
  }

  return {
    artifactId,
    filename: String(message.card.payload.filename ?? "未命名制品"),
    previewType: String(message.card.payload.preview_type ?? "download"),
  };
}

function formatArtifactType(previewType: string) {
  const normalized = previewType.toLowerCase();
  if (normalized.includes("json")) {
    return "JSON";
  }
  if (normalized.includes("markdown")) {
    return "MD";
  }
  if (normalized.includes("code")) {
    return "CODE";
  }
  if (normalized.includes("html")) {
    return "HTML";
  }
  if (normalized.includes("image")) {
    return "IMG";
  }
  if (normalized.includes("pdf")) {
    return "PDF";
  }
  return "FILE";
}
