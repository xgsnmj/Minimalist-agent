export const CARD_SCHEMAS = [
  "artifact_card",
  "tool_result_card",
  "choice_card",
  "citation_card",
  "status_card",
  "form_request_card",
] as const;

export type CardSchema = (typeof CARD_SCHEMAS)[number];

export type ConversationCard = {
  schema: CardSchema;
  payload: Record<string, unknown>;
};

export const CARD_SCHEMA_FIXTURES: Record<CardSchema, Record<string, unknown>> = {
  artifact_card: {
    artifact_id: 1,
    filename: "brief.md",
    preview_type: "markdown",
  },
  tool_result_card: {
    tool_call_id: "tool-1",
    tool_name: "search.web",
    status: "completed",
    summary: "Tool call finished.",
  },
  choice_card: {
    prompt: "Choose the output format.",
    options: [
      { id: "brief", label: "Brief" },
      { id: "table", label: "Table", description: "Structured comparison." },
    ],
  },
  citation_card: {
    title: "AG-UI protocol",
    url: "https://docs.ag-ui.com/",
    source: "AG-UI docs",
    snippet: "Event streams carry agent state.",
  },
  status_card: {
    status: "running",
    title: "Reading sources",
    detail: "The Agent is collecting evidence.",
  },
  form_request_card: {
    title: "Need launch inputs",
    fields: [
      { id: "audience", label: "Audience", type: "text", required: true },
    ],
  },
};
