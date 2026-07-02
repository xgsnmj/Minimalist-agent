import type { ReactElement } from "react";

import type { CardSchema, ConversationCard } from "./card-schema-contract";

export type ConversationToolCall = {
  toolName: string;
  status: "completed" | "failed" | "rejected";
  safeInput: Record<string, unknown>;
  safeOutput?: Record<string, unknown>;
  provenance: Record<string, string>;
  errorSummary?: string;
};

export function ToolCallView({ toolCall }: { toolCall: ConversationToolCall }) {
  return (
    <div className="tool-call-row">
      <div>
        <p className="card-label">Tool Call</p>
        <h3>{toolCall.toolName}</h3>
      </div>
      <span className={`tool-call-status ${toolCall.status}`}>{toolCall.status}</span>
      <p className="preview-text">{formatToolCallSummary(toolCall)}</p>
      <p className="tool-call-meta">
        Gateway: {toolCall.provenance.gateway} · Provider: {toolCall.provenance.provider}
      </p>
    </div>
  );
}

type CardRenderer = (card: ConversationCard) => ReactElement;

export const CARD_RENDERERS: Record<CardSchema, CardRenderer> = {
  artifact_card: (card) => (
      <div className="conversation-card artifact-card" data-testid="conversation-card-artifact_card">
        <p className="card-label">Artifact</p>
        <h3>{String(card.payload.filename ?? "Untitled artifact")}</h3>
        <p className="preview-text">{String(card.payload.preview_type ?? "download")}</p>
      </div>
  ),
  tool_result_card: (card) => (
      <div className="conversation-card tool-result-card" data-testid="conversation-card-tool_result_card">
        <p className="card-label">Tool Result</p>
        <h3>{String(card.payload.tool_name ?? "Tool")}</h3>
        <p className="card-status">{String(card.payload.status ?? "completed")}</p>
        <p className="preview-text">{String(card.payload.summary ?? "Tool call finished.")}</p>
      </div>
  ),
  choice_card: (card) => {
    const options = Array.isArray(card.payload.options) ? card.payload.options : [];
    return (
      <div className="conversation-card choice-card" data-testid="conversation-card-choice_card">
        <p className="card-label">Choice</p>
        <h3>{String(card.payload.prompt ?? "Choose an option")}</h3>
        <div className="card-choice-list">
          {options.map((option, index) => {
            const typedOption = option as Record<string, unknown>;
            return (
              <button className="card-choice" key={String(typedOption.id ?? index)} type="button">
                <span>{String(typedOption.label ?? "Option")}</span>
                {typedOption.description ? <small>{String(typedOption.description)}</small> : null}
              </button>
            );
          })}
        </div>
      </div>
    );
  },
  citation_card: (card) => (
      <div className="conversation-card citation-card" data-testid="conversation-card-citation_card">
        <p className="card-label">Citation</p>
        <h3>{String(card.payload.title ?? "Source")}</h3>
        {card.payload.source ? <p className="card-status">{String(card.payload.source)}</p> : null}
        {card.payload.snippet ? <p className="preview-text">{String(card.payload.snippet)}</p> : null}
        <a className="card-link" href={String(card.payload.url ?? "#")}>
          {String(card.payload.url ?? "Open source")}
        </a>
      </div>
  ),
  status_card: (card) => (
      <div className="conversation-card status-card" data-testid="conversation-card-status_card">
        <p className="card-label">Status</p>
        <h3>{String(card.payload.title ?? "Agent Run update")}</h3>
        <p className="card-status">{String(card.payload.status ?? "running")}</p>
        {card.payload.detail ? <p className="preview-text">{String(card.payload.detail)}</p> : null}
      </div>
  ),
  form_request_card: (card) => {
    const fields = Array.isArray(card.payload.fields) ? card.payload.fields : [];
    return (
      <div className="conversation-card form-request-card" data-testid="conversation-card-form_request_card">
        <p className="card-label">Form Request</p>
        <h3>{String(card.payload.title ?? "More information needed")}</h3>
        <div className="card-field-list">
          {fields.map((field, index) => {
            const typedField = field as Record<string, unknown>;
            return (
              <span className="card-field" key={String(typedField.id ?? index)}>
                {String(typedField.label ?? "Field")}
              </span>
            );
          })}
        </div>
      </div>
    );
  },
};

export function ConversationCardView({ card }: { card: ConversationCard }) {
  const renderCard = CARD_RENDERERS[card.schema];
  if (renderCard) {
    return renderCard(card);
  }

  return (
    <div className="conversation-card unsupported-card">
      <p className="preview-text">Unsupported card schema.</p>
    </div>
  );
}

function formatToolCallSummary(toolCall: ConversationToolCall) {
  if (toolCall.errorSummary) {
    return toolCall.errorSummary;
  }
  const outputSummary = toolCall.safeOutput?.summary;
  if (typeof outputSummary === "string") {
    return outputSummary;
  }
  const query = toolCall.safeInput.query;
  return typeof query === "string" ? `Input: ${query}` : "Tool call recorded.";
}
