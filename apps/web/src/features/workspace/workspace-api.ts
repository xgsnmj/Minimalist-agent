import { authFetch, getAuthToken } from "./auth-api";

export type ApiCapabilityPolicy = {
  mcp_server_ids: number[];
  search_enabled: boolean;
  page_read_enabled: boolean;
};

export type ApiAgent = {
  id: number;
  name: string;
  description: string;
  icon: string;
  status: "enabled" | "disabled" | "retired";
  is_default: boolean;
  instruction: string;
  process_visibility: "minimal" | "standard" | "verbose";
  sdk_settings: {
    max_turns: number;
    tool_use_behavior: "run_llm_again" | "stop_on_first_tool";
    reset_tool_choice: boolean;
  };
  default_model_configuration_id: number | null;
  allowed_model_configuration_ids: number[];
  capability_policy: ApiCapabilityPolicy;
};

export type ApiModelConfiguration = {
  id: number;
  provider_id: string;
  name: string;
  model_name: string;
  endpoint: string;
  credential_reference: string;
  model_settings: Record<string, unknown>;
  native_tool_settings: Record<string, unknown>;
  enabled: boolean;
};

export type ApiWorkspaceAgent = {
  agent: ApiAgent;
  allowed_model_configurations: ApiModelConfiguration[];
};

export type ApiArtifactReference = {
  artifact_id: number;
  filename: string;
  preview_type: string;
};

export type ApiConversationCard = {
  schema?: string;
  card_schema?: string;
  payload: Record<string, unknown>;
};

export type ApiToolCall = {
  id: number | string;
  run_id: number;
  conversation_id: number;
  tool_name: string;
  capability: string;
  status: "completed" | "failed" | "rejected" | "running";
  started_at?: string | null;
  ended_at?: string | null;
  safe_input: Record<string, unknown>;
  safe_output?: Record<string, unknown> | null;
  provenance: Record<string, string>;
  error_summary?: string | null;
};

export type ApiConversationMessage = {
  role: "user" | "assistant";
  content: string;
  artifact_reference?: ApiArtifactReference | null;
  card?: ApiConversationCard | null;
  run_id?: number | null;
  event_sequence?: number | null;
  event_type?: string | null;
  process_summary?: string | null;
  tool_call?: ApiToolCall | null;
};

export type ApiConversation = {
  id: number;
  title: string;
  agent: ApiAgent;
  selected_model_configuration_id: number | null;
  status: "idle" | "running";
  updated_at: string;
  deleted: boolean;
  messages: ApiConversationMessage[];
};

export type ApiRun = {
  id: number;
  conversation_id: number;
  owner_user_id: number;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  user_message: string;
  assistant_message: string | null;
  process_summaries: string[];
  error: string | null;
  worker_enqueued: boolean;
  status_events: string[];
};

export type ApiRunAttachment = {
  id: number;
  conversation_id: number;
  filename: string;
  content_type: string;
  size: number;
  preview_type: string;
};

export type ApiArtifactPreview = {
  artifact_id: number;
  filename: string;
  content_type: string;
  preview_type: string;
  download_url: string;
  text?: string | null;
  data_url?: string | null;
};

export function getAuthenticatedStreamUrl(path: string) {
  const token = getAuthToken();
  if (!token) {
    return `/api${path}`;
  }
  const separator = path.includes("?") ? "&" : "?";
  return `/api${path}${separator}access_token=${encodeURIComponent(token)}`;
}

export function listWorkspaceAgents() {
  return authFetch<ApiWorkspaceAgent[]>("/workspace/agents");
}

export function listConversations() {
  return authFetch<ApiConversation[]>("/conversations?limit=50&message_limit=80");
}

export function createConversation(request: {
  agent_id: number;
  initial_message: string;
  selected_model_configuration_id: number | null;
  title: string;
}) {
  return authFetch<ApiConversation>("/conversations", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export function createConversationDraft(request: {
  agent_id: number;
  selected_model_configuration_id: number | null;
  title: string;
}) {
  return authFetch<ApiConversation>("/conversations/drafts", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export function renameConversation(conversationId: string, title: string) {
  return authFetch<ApiConversation>(`/conversations/${conversationId}`, {
    method: "PATCH",
    body: JSON.stringify({ title }),
  });
}

export function deleteConversation(conversationId: string) {
  return authFetch<ApiConversation>(`/conversations/${conversationId}`, {
    method: "DELETE",
  });
}

export function uploadRunAttachment(conversationId: string, file: File) {
  const body = new FormData();
  body.append("file", file);
  return authFetch<ApiRunAttachment>(`/conversations/${conversationId}/run-attachments`, {
    method: "POST",
    body,
  });
}

export function listRuns() {
  return authFetch<ApiRun[]>("/runs?limit=100");
}

export function startAgentRun(conversationId: string, message: string) {
  return authFetch<ApiRun>(`/conversations/${conversationId}/runs`, {
    method: "POST",
    body: JSON.stringify({ message }),
  });
}

export function cancelAgentRun(runId: number) {
  return authFetch<ApiRun>(`/runs/${runId}/cancel`, {
    method: "POST",
  });
}

export function getArtifactPreview(artifactId: number) {
  return authFetch<ApiArtifactPreview>(`/artifacts/${artifactId}/preview`);
}
