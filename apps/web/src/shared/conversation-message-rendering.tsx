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
        <p className="card-label">工具调用</p>
        <h3>{toolCall.toolName}</h3>
      </div>
      <span className={`tool-call-status ${toolCall.status}`}>{formatToolCallStatus(toolCall.status)}</span>
      <p className="preview-text">{formatToolCallSummary(toolCall)}</p>
      <p className="tool-call-meta">
        网关：{toolCall.provenance.gateway} · 提供方：{toolCall.provenance.provider}
      </p>
    </div>
  );
}

type CardRenderer = (card: ConversationCard) => ReactElement;

export const CARD_RENDERERS: Record<CardSchema, CardRenderer> = {
  artifact_card: (card) => (
      <div className="conversation-card artifact-card" data-testid="conversation-card-artifact_card">
        <p className="card-label">制品</p>
        <h3>{String(card.payload.filename ?? "未命名制品")}</h3>
        <p className="preview-text">{String(card.payload.preview_type ?? "download")}</p>
      </div>
  ),
  tool_result_card: (card) => (
      <div className="conversation-card tool-result-card" data-testid="conversation-card-tool_result_card">
        <p className="card-label">工具结果</p>
        <h3>{String(card.payload.tool_name ?? "工具")}</h3>
        <p className="card-status">{String(card.payload.status ?? "completed")}</p>
        <p className="preview-text">{String(card.payload.summary ?? "工具调用已完成。")}</p>
      </div>
  ),
  choice_card: (card) => {
    const options = Array.isArray(card.payload.options) ? card.payload.options : [];
    return (
      <div className="conversation-card choice-card" data-testid="conversation-card-choice_card">
        <p className="card-label">选择</p>
        <h3>{String(card.payload.prompt ?? "选择一个选项")}</h3>
        <div className="card-choice-list">
          {options.map((option, index) => {
            const typedOption = option as Record<string, unknown>;
            return (
              <button className="card-choice" key={String(typedOption.id ?? index)} type="button">
                <span>{String(typedOption.label ?? "选项")}</span>
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
        <p className="card-label">引用</p>
        <h3>{String(card.payload.title ?? "来源")}</h3>
        {card.payload.source ? <p className="card-status">{String(card.payload.source)}</p> : null}
        {card.payload.snippet ? <p className="preview-text">{String(card.payload.snippet)}</p> : null}
        <a className="card-link" href={String(card.payload.url ?? "#")}>
          {String(card.payload.url ?? "打开来源")}
        </a>
      </div>
  ),
  status_card: (card) => (
      <div className="conversation-card status-card" data-testid="conversation-card-status_card">
        <p className="card-label">状态</p>
        <h3>{String(card.payload.title ?? "智能体运行更新")}</h3>
        <p className="card-status">{String(card.payload.status ?? "running")}</p>
        {card.payload.detail ? <p className="preview-text">{String(card.payload.detail)}</p> : null}
      </div>
  ),
  form_request_card: (card) => {
    const fields = Array.isArray(card.payload.fields) ? card.payload.fields : [];
    return (
      <div className="conversation-card form-request-card" data-testid="conversation-card-form_request_card">
        <p className="card-label">表单请求</p>
        <h3>{String(card.payload.title ?? "需要补充信息")}</h3>
        <div className="card-field-list">
          {fields.map((field, index) => {
            const typedField = field as Record<string, unknown>;
            return (
              <span className="card-field" key={String(typedField.id ?? index)}>
                {String(typedField.label ?? "字段")}
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
      <p className="preview-text">暂不支持该卡片 schema。</p>
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
  return typeof query === "string" ? `输入：${query}` : "工具调用已记录。";
}

function formatToolCallStatus(status: ConversationToolCall["status"]) {
  switch (status) {
    case "completed":
      return "已完成";
    case "failed":
      return "失败";
    case "rejected":
      return "已拒绝";
    default:
      return status;
  }
}
