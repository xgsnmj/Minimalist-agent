import type { ReactElement } from "react";

import type { CardSchema, ConversationCard } from "./card-schema-contract";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

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
    <Card className="tool-call-row">
      <CardHeader>
        <CardTitle>{toolCall.toolName}</CardTitle>
        <Badge variant={toolCallBadgeVariant(toolCall.status)}>{formatToolCallStatus(toolCall.status)}</Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <p className="preview-text">{formatToolCallSummary(toolCall)}</p>
        <p className="tool-call-meta">
          网关：{toolCall.provenance.gateway} · 提供方：{toolCall.provenance.provider}
        </p>
      </CardContent>
    </Card>
  );
}

type CardRenderer = (card: ConversationCard) => ReactElement;

export const CARD_RENDERERS: Record<CardSchema, CardRenderer> = {
  artifact_card: (card) => (
      <Card className="conversation-card artifact-card" data-testid="conversation-card-artifact_card">
        <CardHeader>
          <CardTitle>{String(card.payload.filename ?? "未命名制品")}</CardTitle>
          <Badge variant="secondary">制品</Badge>
        </CardHeader>
        <CardContent>
          <p className="preview-text">{String(card.payload.preview_type ?? "download")}</p>
        </CardContent>
      </Card>
  ),
  tool_result_card: (card) => (
      <Card className="conversation-card tool-result-card" data-testid="conversation-card-tool_result_card">
        <CardHeader>
          <CardTitle>{String(card.payload.tool_name ?? "工具")}</CardTitle>
          <Badge variant="outline">{String(card.payload.status ?? "completed")}</Badge>
        </CardHeader>
        <CardContent>
          <p className="preview-text">{String(card.payload.summary ?? "工具调用已完成。")}</p>
        </CardContent>
      </Card>
  ),
  choice_card: (card) => {
    const options = Array.isArray(card.payload.options) ? card.payload.options : [];
    return (
      <Card className="conversation-card choice-card" data-testid="conversation-card-choice_card">
        <CardHeader>
          <Badge variant="secondary">选择</Badge>
          <CardTitle>{String(card.payload.prompt ?? "选择一个选项")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {options.map((option, index) => {
            const typedOption = option as Record<string, unknown>;
            return (
              <Button className="card-choice" key={String(typedOption.id ?? index)} type="button">
                <span>{String(typedOption.label ?? "选项")}</span>
                {typedOption.description ? <small>{String(typedOption.description)}</small> : null}
              </Button>
            );
          })}
        </CardContent>
      </Card>
    );
  },
  citation_card: (card) => (
      <Card className="conversation-card citation-card" data-testid="conversation-card-citation_card">
        <CardHeader>
          <Badge variant="secondary">引用</Badge>
          <CardTitle>{String(card.payload.title ?? "来源")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {card.payload.source ? <p className="card-status">{String(card.payload.source)}</p> : null}
          {card.payload.snippet ? <p className="preview-text">{String(card.payload.snippet)}</p> : null}
          <a className="card-link" href={String(card.payload.url ?? "#")}>
            {String(card.payload.url ?? "打开来源")}
          </a>
        </CardContent>
      </Card>
  ),
  status_card: (card) => (
      <Card className="conversation-card status-card" data-testid="conversation-card-status_card">
        <CardHeader>
          <Badge variant={toolCallBadgeVariant(String(card.payload.status ?? "running") as ConversationToolCall["status"])}>{String(card.payload.status ?? "running")}</Badge>
          <CardTitle>{String(card.payload.title ?? "智能体运行更新")}</CardTitle>
        </CardHeader>
        <CardContent>
          {card.payload.detail ? <p className="preview-text">{String(card.payload.detail)}</p> : null}
        </CardContent>
      </Card>
  ),
  form_request_card: (card) => {
    const fields = Array.isArray(card.payload.fields) ? card.payload.fields : [];
    return (
      <Card className="conversation-card form-request-card" data-testid="conversation-card-form_request_card">
        <CardHeader>
          <Badge variant="secondary">表单请求</Badge>
          <CardTitle>{String(card.payload.title ?? "需要补充信息")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {fields.map((field, index) => {
            const typedField = field as Record<string, unknown>;
            return (
              <Badge key={String(typedField.id ?? index)} variant="outline">
                {String(typedField.label ?? "字段")}
              </Badge>
            );
          })}
        </CardContent>
      </Card>
    );
  },
};

export function ConversationCardView({ card }: { card: ConversationCard }) {
  const renderCard = CARD_RENDERERS[card.schema];
  if (renderCard) {
    return renderCard(card);
  }

  return (
    <Card className="conversation-card unsupported-card">
      <p className="preview-text">暂不支持该卡片 schema。</p>
    </Card>
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

function toolCallBadgeVariant(status: ConversationToolCall["status"]) {
  switch (status) {
    case "completed":
      return "default";
    case "failed":
    case "rejected":
      return "destructive";
    default:
      return "secondary";
  }
}
