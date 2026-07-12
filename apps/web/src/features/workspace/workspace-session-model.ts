import { type ConversationToolCall } from "../../shared/conversation-message-rendering";
import { CARD_SCHEMAS, type CardSchema, type ConversationCard } from "../../shared/card-schema-contract";
import {
  type ApiConversation,
  type ApiConversationCard,
  type ApiRun,
  type ApiToolCall,
  type ApiWorkspaceAgent,
} from "./workspace-api";

export type ModelOption = {
  id: string;
  label: string;
};

export type WorkspaceAgent = {
  id: string;
  backendId: number;
  copilotAgentId: string;
  name: string;
  status: "enabled";
  allowedModels: ModelOption[];
  defaultModelId: string | null;
  capabilitySnapshot: {
    mcpServerCount: number;
    search: boolean;
  };
};

export type ConversationMessage = {
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

export type ArtifactReference = NonNullable<ConversationMessage["artifactReference"]>;

export type Conversation = {
  id: string;
  title: string;
  agentId: string;
  status: "idle" | "queued" | "running" | "completed" | "failed" | "cancelled";
  updatedAt: string;
  selectedModelId: string;
  latestRunId: number | null;
  completedAt?: string;
  cancelledAt?: string;
  runError?: string;
  messages: ConversationMessage[];
};

export type CommandArtifact = {
  conversationId: string;
  conversationTitle: string;
  reference: ArtifactReference;
};

export type CommandRun = {
  conversationId: string;
  conversationTitle: string;
  runId: number;
  updatedAt: string;
};

export const emptyWorkspaceAgent: WorkspaceAgent = {
  id: "",
  backendId: 0,
  copilotAgentId: "default",
  name: "未配置智能体",
  status: "enabled",
  allowedModels: [],
  defaultModelId: null,
  capabilitySnapshot: {
    mcpServerCount: 0,
    search: false,
  },
};

export function getAgent(agents: WorkspaceAgent[], agentId: string): WorkspaceAgent {
  return agents.find((agent) => agent.id === agentId) ?? agents[0] ?? emptyWorkspaceAgent;
}

export function mapWorkspaceAgent(response: ApiWorkspaceAgent): WorkspaceAgent {
  const allowedModels = response.allowed_model_configurations.map((configuration) => ({
    id: String(configuration.id),
    label: `${configuration.name} / ${configuration.model_name}`,
  }));
  return {
    id: String(response.agent.id),
    backendId: response.agent.id,
    copilotAgentId: response.agent.is_default ? "default" : `agent-${response.agent.id}`,
    name: response.agent.name,
    status: "enabled",
    allowedModels,
    defaultModelId: response.agent.default_model_configuration_id != null
      ? String(response.agent.default_model_configuration_id)
      : allowedModels[0]?.id ?? null,
    capabilitySnapshot: {
      mcpServerCount: response.agent.capability_policy.mcp_server_ids.length,
      search: response.agent.capability_policy.search_enabled,
    },
  };
}

export function mapConversation(conversation: ApiConversation, runs: ApiRun[]): Conversation {
  const latestRun = runs
    .filter((run) => run.conversation_id === conversation.id)
    .sort((first, second) => second.id - first.id)[0];
  const status = latestRun?.status ?? conversation.status;

  return {
    id: String(conversation.id),
    title: conversation.title,
    agentId: String(conversation.agent.id),
    status,
    updatedAt: conversation.updated_at,
    selectedModelId: conversation.selected_model_configuration_id != null
      ? String(conversation.selected_model_configuration_id)
      : conversation.agent.default_model_configuration_id != null
        ? String(conversation.agent.default_model_configuration_id)
        : "",
    latestRunId: latestRun?.id ?? null,
    completedAt: status === "completed" ? conversation.updated_at : undefined,
    cancelledAt: status === "cancelled" ? conversation.updated_at : undefined,
    runError: latestRun?.error ?? undefined,
    messages: conversation.messages
      .filter(isVisibleConversationMessage)
      .map((message, index) => mapConversationMessage(message, conversation.id, index)),
  };
}

export function mergeConversationMessages(messages: ConversationMessage[]): ConversationMessage[] {
  const seen = new Set<string>();
  return messages.filter((message) => {
    if (seen.has(message.id)) {
      return false;
    }
    seen.add(message.id);
    return true;
  });
}

export function compareConversationsByLatestInteraction(first: Conversation, second: Conversation) {
  const now = Date.now();
  const firstTime = conversationUpdatedAtRank(first.updatedAt, now);
  const secondTime = conversationUpdatedAtRank(second.updatedAt, now);

  if (firstTime !== secondTime) {
    return secondTime - firstTime;
  }

  return Number(second.id) - Number(first.id);
}

export function getMessageArtifactReference(message: ConversationMessage): ArtifactReference | null {
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

export function collectCommandArtifacts(conversations: Conversation[]): CommandArtifact[] {
  const seenArtifactIds = new Set<number>();
  const artifacts: CommandArtifact[] = [];

  for (const conversation of conversations) {
    for (const message of conversation.messages) {
      const reference = getMessageArtifactReference(message);
      if (!reference || seenArtifactIds.has(reference.artifactId)) {
        continue;
      }

      seenArtifactIds.add(reference.artifactId);
      artifacts.push({
        conversationId: conversation.id,
        conversationTitle: conversation.title,
        reference,
      });
    }
  }

  return artifacts;
}

export function collectCommandRuns(conversations: Conversation[], runs: ApiRun[]): CommandRun[] {
  const conversationById = new Map(
    conversations.map((conversation) => [conversation.id, conversation]),
  );
  const commandRuns: CommandRun[] = [];
  for (const run of runs) {
    const conversation = conversationById.get(String(run.conversation_id));
    if (!conversation) {
      continue;
    }
    commandRuns.push({
      conversationId: conversation.id,
      conversationTitle: conversation.title,
      runId: run.id,
      updatedAt: conversation.updatedAt,
    });
  }
  return commandRuns;
}

export function isActiveConversationRun(conversation: Conversation) {
  return conversation.status === "queued" || conversation.status === "running";
}

function isVisibleConversationMessage(message: ApiConversation["messages"][number]) {
  return !isProcessSummaryMessage(message);
}

function isProcessSummaryMessage(message: ApiConversation["messages"][number]) {
  return message.event_type === "process.summary" ||
    typeof message.process_summary === "string" ||
    message.content.trim().startsWith("运行过程：");
}

function mapConversationMessage(
  message: ApiConversation["messages"][number],
  conversationId: number,
  index: number,
): ConversationMessage {
  return {
    id: conversationMessageId(message, conversationId, index),
    role: message.role,
    content: message.content,
    artifactReference: message.artifact_reference
      ? {
          artifactId: message.artifact_reference.artifact_id,
          filename: message.artifact_reference.filename,
          previewType: message.artifact_reference.preview_type,
        }
      : undefined,
    toolCall: message.tool_call ? mapApiToolCall(message.tool_call) : undefined,
    card: message.card ? mapConversationCard(message.card) : undefined,
  };
}

function conversationMessageId(
  message: ApiConversation["messages"][number],
  conversationId: number,
  index: number,
) {
  if (typeof message.run_id === "number" && typeof message.event_sequence === "number") {
    return `run-${message.run_id}-event-${message.event_sequence}`;
  }
  if (message.tool_call) {
    return `run-${message.tool_call.run_id}-tool-${message.tool_call.id}`;
  }
  return `conversation-${conversationId}-message-${index + 1}`;
}

function mapApiToolCall(toolCall: ApiToolCall): ConversationToolCall {
  return {
    capability: toolCall.capability,
    endedAt: toolCall.ended_at ?? null,
    errorSummary: toolCall.error_summary ?? undefined,
    id: toolCall.id,
    provenance: toolCall.provenance ?? {},
    runId: toolCall.run_id,
    safeInput: toolCall.safe_input ?? {},
    safeOutput: toolCall.safe_output ?? undefined,
    startedAt: toolCall.started_at ?? null,
    status: toolCall.status,
    toolName: toolCall.tool_name,
  };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function mapConversationCard(card: ApiConversationCard): ConversationCard {
  const schema = String(card.schema ?? card.card_schema ?? "");
  return {
    schema: isCardSchema(schema) ? schema : "status_card",
    payload: card.payload,
  };
}

function conversationUpdatedAtRank(updatedAt: string, now: number) {
  const trimmed = updatedAt.trim();
  const parsedTime = Date.parse(trimmed);

  if (!Number.isNaN(parsedTime)) {
    return parsedTime;
  }

  if (trimmed === "刚刚" || trimmed.toLowerCase() === "just now") {
    return Number.MAX_SAFE_INTEGER;
  }

  const relativeMatch = trimmed.match(/^(\d+)\s*(分钟|小时|天|周|月|年)前$/);
  if (!relativeMatch) {
    return 0;
  }

  const amount = Number(relativeMatch[1]);
  const unit = relativeMatch[2];
  const unitMs: Record<string, number> = {
    分钟: 60 * 1000,
    小时: 60 * 60 * 1000,
    天: 24 * 60 * 60 * 1000,
    周: 7 * 24 * 60 * 60 * 1000,
    月: 30 * 24 * 60 * 60 * 1000,
    年: 365 * 24 * 60 * 60 * 1000,
  };

  return now - amount * unitMs[unit];
}

function isCardSchema(schema: string): schema is CardSchema {
  return (CARD_SCHEMAS as readonly string[]).includes(schema);
}
