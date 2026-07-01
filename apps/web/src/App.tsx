import { ChangeEvent, FormEvent, useMemo, useRef, useState } from "react";

import { useAgentRunStream } from "./ag-ui-stream";

type AccessMode = "intro" | "register" | "pending";

type ModelOption = {
  id: string;
  label: string;
};

type WorkspaceAgent = {
  id: string;
  name: string;
  status: "enabled";
  allowedModels: ModelOption[];
};

type ConversationMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCall?: {
    toolName: string;
    status: "completed" | "failed" | "rejected";
    safeInput: Record<string, unknown>;
    safeOutput?: Record<string, unknown>;
    provenance: Record<string, string>;
    errorSummary?: string;
  };
  artifactReference?: {
    artifactId: number;
    filename: string;
    previewType: string;
  };
  card?: {
    schema: string;
    payload: Record<string, unknown>;
  };
};

type PreviewType = "markdown" | "plaintext" | "image" | "pdf" | "code" | "table" | "json" | "html" | "download";

type UploadedAttachmentPreview = {
  id: number;
  filename: string;
  contentType: string;
  previewType: PreviewType;
  text?: string;
  dataUrl?: string;
};

type Conversation = {
  id: string;
  title: string;
  agentId: string;
  status: "idle" | "running";
  updatedAt: string;
  selectedModelId: string;
  messages: ConversationMessage[];
};

const workspaceAgents: WorkspaceAgent[] = [
  {
    id: "default",
    name: "Default Agent",
    status: "enabled",
    allowedModels: [{ id: "openai-gpt-5", label: "OpenAI GPT-5" }],
  },
  {
    id: "research",
    name: "Research Agent",
    status: "enabled",
    allowedModels: [
      { id: "doubao-seed", label: "Doubao Seed 1.6" },
      { id: "minimax-m1", label: "MiniMax M1" },
    ],
  },
];

const initialConversations: Conversation[] = [
  {
    id: "conversation-1",
    title: "Market research",
    agentId: "default",
    status: "idle",
    updatedAt: "just now",
    selectedModelId: "openai-gpt-5",
    messages: [
      {
        id: "message-1",
        role: "user",
        content: "Find recent market signals for a minimalist Agent workspace.",
      },
      {
        id: "message-2",
        role: "assistant",
        content:
          "I will compare common Agent workspace patterns and keep the output ready for review.",
      },
      {
        id: "message-3",
        role: "assistant",
        content: "Artifact ready: brief.md",
        artifactReference: {
          artifactId: 1,
          filename: "brief.md",
          previewType: "markdown",
        },
      },
      {
        id: "message-4",
        role: "assistant",
        content: "Tool Call: search.web completed",
        toolCall: {
          toolName: "search.web",
          status: "completed",
          safeInput: {
            query: "Minimalist Agent WorkBuddy patterns",
          },
          safeOutput: {
            summary: "search.web completed.",
          },
          provenance: {
            gateway: "agent_tool_gateway",
            provider: "mock",
          },
        },
      },
      {
        id: "message-5",
        role: "assistant",
        content: "Card ready: artifact_card",
        card: {
          schema: "artifact_card",
          payload: {
            artifact_id: 1,
            filename: "brief.md",
            preview_type: "markdown",
          },
        },
      },
      {
        id: "message-6",
        role: "assistant",
        content: "Card ready: tool_result_card",
        card: {
          schema: "tool_result_card",
          payload: {
            tool_name: "doubao_search",
            status: "completed",
            summary: "Found 4 relevant results.",
          },
        },
      },
      {
        id: "message-7",
        role: "assistant",
        content: "Card ready: choice_card",
        card: {
          schema: "choice_card",
          payload: {
            prompt: "Choose the output format.",
            options: [
              { id: "brief", label: "Brief" },
              { id: "table", label: "Table", description: "Structured comparison." },
            ],
          },
        },
      },
      {
        id: "message-8",
        role: "assistant",
        content: "Card ready: citation_card",
        card: {
          schema: "citation_card",
          payload: {
            title: "AG-UI protocol",
            url: "https://docs.ag-ui.com/",
            source: "AG-UI docs",
            snippet: "Event streams carry agent state.",
          },
        },
      },
      {
        id: "message-9",
        role: "assistant",
        content: "Card ready: status_card",
        card: {
          schema: "status_card",
          payload: {
            status: "running",
            title: "Reading sources",
            detail: "The Agent is collecting evidence.",
          },
        },
      },
      {
        id: "message-10",
        role: "assistant",
        content: "Card ready: form_request_card",
        card: {
          schema: "form_request_card",
          payload: {
            title: "Need launch inputs",
            fields: [
              { id: "audience", label: "Audience", type: "text", required: true },
            ],
          },
        },
      },
    ],
  },
];

export function App() {
  const [mode, setMode] = useState<AccessMode>("intro");
  const [conversations, setConversations] = useState<Conversation[]>(initialConversations);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(
    initialConversations[0]?.id ?? null,
  );
  const [conversationSearch, setConversationSearch] = useState("");
  const [draftAgentId, setDraftAgentId] = useState(workspaceAgents[0].id);
  const [draftModelId, setDraftModelId] = useState(workspaceAgents[0].allowedModels[0].id);
  const [composerValue, setComposerValue] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(initialConversations[0]?.title ?? "");
  const [previewArtifactId, setPreviewArtifactId] = useState<number | null>(
    initialConversations[0]?.messages.find((message) => message.artifactReference)?.artifactReference
      ?.artifactId ?? null,
  );
  const [selectedAttachment, setSelectedAttachment] = useState<File | null>(null);
  const [attachmentPreview, setAttachmentPreview] = useState<UploadedAttachmentPreview | null>(null);
  const [attachmentInputKey, setAttachmentInputKey] = useState(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const selectedConversation = conversations.find(
    (conversation) => conversation.id === selectedConversationId,
  );
  const activeRunId = selectedConversation ? 1 : null;
  const { lastSeenSequence, status: streamStatus, streamUrl } = useAgentRunStream(activeRunId);
  const activeAgent = getAgent(selectedConversation?.agentId ?? draftAgentId);
  const allowedModels = activeAgent.allowedModels;
  const selectedModelId = selectedConversation?.selectedModelId ?? draftModelId;
  const selectedArtifactReference =
    selectedConversation?.messages.find((message) => message.artifactReference)?.artifactReference ??
    null;
  const visibleConversations = useMemo(
    () =>
      conversations.filter((conversation) =>
        conversation.title.toLowerCase().includes(conversationSearch.toLowerCase()),
      ),
    [conversationSearch, conversations],
  );

  function requestAccess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMode("pending");
  }

  function startNewConversation() {
    setSelectedConversationId(null);
    setComposerValue("");
    setIsRenaming(false);
    setRenameValue("Untitled conversation");
  }

  function selectConversation(conversationId: string) {
    const conversation = conversations.find((item) => item.id === conversationId);
    setSelectedConversationId(conversationId);
    setRenameValue(conversation?.title ?? "");
    setIsRenaming(false);
    setPreviewArtifactId(
      conversation?.messages.find((message) => message.artifactReference)?.artifactReference
        ?.artifactId ?? null,
    );
  }

  function selectArtifactPreview(artifactId: number) {
    setPreviewArtifactId(artifactId);
  }

  function selectAttachment(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setSelectedAttachment(file);
    if (file) {
      setPreviewArtifactId(null);
      void updateAttachmentPreview(file);
    } else {
      setAttachmentPreview(null);
    }
  }

  function updateDraftAgent(agentId: string) {
    const nextAgent = getAgent(agentId);
    setDraftAgentId(nextAgent.id);
    setDraftModelId(nextAgent.allowedModels[0].id);
  }

  function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = composerValue.trim();

    if (!message) {
      return;
    }

    if (selectedConversation) {
      setConversations((currentConversations) =>
        currentConversations.map((conversation) =>
          conversation.id === selectedConversation.id
            ? {
                ...conversation,
                messages: [
                  ...conversation.messages,
                  {
                    id: `message-${conversation.id}-${conversation.messages.length + 1}`,
                    role: "user",
                    content: message,
                  },
                ],
                updatedAt: "just now",
              }
            : conversation,
        ),
      );
    } else {
      const conversation: Conversation = {
        id: `conversation-${Date.now()}`,
        title: titleFromMessage(message),
        agentId: draftAgentId,
        status: "idle",
        updatedAt: "just now",
        selectedModelId: draftModelId,
        messages: [{ id: "message-1", role: "user", content: message }],
      };

      setConversations((currentConversations) => [conversation, ...currentConversations]);
      setSelectedConversationId(conversation.id);
      setRenameValue(conversation.title);
    }

    setComposerValue("");
  }

  async function uploadAttachment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedAttachment) {
      return;
    }
    await updateAttachmentPreview(selectedAttachment);
    setPreviewArtifactId(null);
    setSelectedAttachment(null);
    setAttachmentInputKey((current) => current + 1);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function clearAttachmentPreview() {
    setAttachmentPreview(null);
  }

  async function updateAttachmentPreview(file: File) {
    const preview = createAttachmentPreview(file);
    if (preview.previewType === "image" || preview.previewType === "pdf") {
      const dataUrl = await readFileAsDataUrl(file);
      setAttachmentPreview({ ...preview, dataUrl });
      return;
    }

    const text = await file.text();
    setAttachmentPreview({
      ...preview,
      text: normalizeAttachmentPreviewText(preview.previewType, text),
    });
  }

  function renameConversation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextTitle = renameValue.trim();

    if (!selectedConversation || !nextTitle) {
      return;
    }

    setConversations((currentConversations) =>
      currentConversations.map((conversation) =>
        conversation.id === selectedConversation.id
          ? { ...conversation, title: nextTitle, updatedAt: "just now" }
          : conversation,
      ),
    );
    setIsRenaming(false);
  }

  function deleteConversation() {
    if (!selectedConversation) {
      return;
    }

    const remainingConversations = conversations.filter(
      (conversation) => conversation.id !== selectedConversation.id,
    );
    setConversations(remainingConversations);
    setSelectedConversationId(remainingConversations[0]?.id ?? null);
    setRenameValue(remainingConversations[0]?.title ?? "Untitled conversation");
    setIsRenaming(false);
  }

  return (
    <main className="app-shell">
      <aside className="conversation-sidebar" aria-label="Agent Conversations">
        <div className="brand-block">
          <p className="eyebrow">Agent Platform</p>
          <h1 id="app-title">Minimalist Agent</h1>
          <p>Agent Platform scaffold is running.</p>
        </div>
        <button className="primary-button full-width" type="button" onClick={startNewConversation}>
          New Conversation
        </button>
        <label className="compact-field">
          <span>Search conversations</span>
          <input
            aria-label="Search conversations"
            name="conversation-search"
            type="search"
            value={conversationSearch}
            onChange={(event) => setConversationSearch(event.target.value)}
          />
        </label>
        <nav className="conversation-list" aria-label="Recent conversations">
          {visibleConversations.map((conversation) => {
            const conversationAgent = getAgent(conversation.agentId);

            return (
              <button
                className={
                  conversation.id === selectedConversationId
                    ? "conversation-item selected"
                    : "conversation-item"
                }
                key={conversation.id}
                type="button"
                onClick={() => selectConversation(conversation.id)}
              >
                <span className="conversation-title">{conversation.title}</span>
                <span className="conversation-meta">
                  <span>Agent: {conversationAgent.name}</span>
                  <span>{conversation.status}</span>
                  <span>{conversation.updatedAt}</span>
                </span>
              </button>
            );
          })}
          {visibleConversations.length === 0 ? (
            <p className="empty-state">No conversations match this search.</p>
          ) : null}
        </nav>
      </aside>

      <section className="conversation-workspace" aria-labelledby="conversation-title">
        <header className="conversation-header">
          <div>
            <p className="eyebrow">Agent Conversation</p>
            <h2 id="conversation-title">
              {selectedConversation
                ? `${selectedConversation.title} workspace`
                : "New conversation"}
            </h2>
            <p>
              {selectedConversation
                ? "Continue the existing conversation with its original Agent binding."
                : "Choose an enabled Agent and send the first message to create a conversation."}
            </p>
          </div>
          <div className="conversation-actions">
            <button
              className="secondary-button"
              disabled={!selectedConversation}
              type="button"
              onClick={() => setIsRenaming(true)}
            >
              Rename Conversation
            </button>
            <button
              className="danger-button"
              disabled={!selectedConversation}
              type="button"
              onClick={deleteConversation}
            >
              Delete Conversation
            </button>
          </div>
        </header>

        {isRenaming && selectedConversation ? (
          <form className="rename-panel" onSubmit={renameConversation}>
            <label>
              <span>Conversation title</span>
              <input
                name="conversation-title"
                value={renameValue}
                onChange={(event) => setRenameValue(event.target.value)}
              />
            </label>
            <button className="primary-button" type="submit">
              Save Conversation Name
            </button>
          </form>
        ) : null}

        <section className="message-stream" aria-label="Conversation messages">
          {selectedConversation ? (
            <div className="stream-banner" role="status" aria-live="polite">
              <span>{streamStatus === "connected" ? "AG-UI SSE connected" : "AG-UI SSE idle"}</span>
              <span>{selectedConversation ? `Run ${activeRunId ?? 0}` : "No active run"}</span>
              <span>
                {lastSeenSequence > 0 ? `Last seen event ${lastSeenSequence}` : "Last seen event 0"}
              </span>
              {streamUrl ? <span>{streamUrl}</span> : null}
            </div>
          ) : null}
          {(selectedConversation?.messages ?? []).map((message) => (
            <article className={`message-row ${message.role}`} key={message.id}>
              <span className="message-role">{message.role}</span>
              <p>{message.content}</p>
              {message.toolCall ? renderToolCall(message.toolCall) : null}
              {message.card ? (
                <div className="card-shell" data-card-schema={message.card.schema}>
                  {renderConversationCard(message.card)}
                </div>
              ) : null}
              {message.artifactReference ? (
                <button
                  className="artifact-pill"
                  type="button"
                  onClick={() => selectArtifactPreview(message.artifactReference!.artifactId)}
                >
                  {message.artifactReference.filename}
                </button>
              ) : null}
            </article>
          ))}
          {!selectedConversation ? (
            <div className="draft-state">
              <h3>Ready for a new task</h3>
              <p>The first message will create a conversation bound to the selected Agent.</p>
            </div>
          ) : null}
        </section>

        <form className="composer" onSubmit={sendMessage}>
          <div className="composer-controls">
            <label>
              <span>Agent Selection</span>
              <select
                disabled={Boolean(selectedConversation)}
                value={activeAgent.id}
                onChange={(event) => updateDraftAgent(event.target.value)}
              >
                {workspaceAgents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Allowed Model Selection</span>
              <select
                value={selectedModelId}
                onChange={(event) => setDraftModelId(event.target.value)}
                disabled={Boolean(selectedConversation)}
              >
                {allowedModels.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="composer-input">
            <span>Message</span>
            <textarea
              placeholder="Ask the Agent to work on something..."
              value={composerValue}
              onChange={(event) => setComposerValue(event.target.value)}
            />
          </label>
          <div className="composer-actions">
            <label className="attachment-picker">
              <span>Run Attachment</span>
              <input
                key={attachmentInputKey}
                ref={fileInputRef}
                aria-label="Run Attachment"
                type="file"
                onChange={selectAttachment}
              />
            </label>
            <button className="secondary-button" type="button" onClick={() => fileInputRef.current?.click()}>
              Choose File
            </button>
            <button className="secondary-button" type="submit" onClick={clearAttachmentPreview}>
              Send Message
            </button>
          </div>
        </form>

        <form className="attachment-upload-panel" onSubmit={uploadAttachment}>
          <div>
            <p className="eyebrow">Run Attachment</p>
            <h3>{selectedAttachment ? selectedAttachment.name : "No file selected"}</h3>
          </div>
          <p className="preview-text">
            {selectedAttachment
              ? `${selectedAttachment.type || "application/octet-stream"} · ${selectedAttachment.size} bytes`
              : "Pick a file from the composer to stage it as temporary working context."}
          </p>
          <button className="primary-button" type="submit" disabled={!selectedAttachment}>
            Upload Attachment
          </button>
        </form>
      </section>

      <aside className="right-rail" aria-label="Account and Administrator Console">
        <section className="app-panel preview-panel" aria-labelledby="artifact-preview-title">
          <div>
            <p className="eyebrow">Artifact Preview</p>
            <h2 id="artifact-preview-title">Preview</h2>
          </div>
          <div className="preview-surface" role="presentation">
            {selectedArtifactReference ? (
              <>
                <p className="preview-label">{selectedArtifactReference.previewType}</p>
                <h3>{selectedArtifactReference.filename}</h3>
                <p className="preview-text">
                  {previewArtifactId === selectedArtifactReference.artifactId
                    ? "# Brief\n\nalpha"
                    : "# Summary\n\nThis body stays in object storage."}
                </p>
                <button className="secondary-button" type="button">
                  Download
                </button>
              </>
            ) : attachmentPreview ? (
              renderAttachmentPreview(attachmentPreview)
            ) : (
              <p className="preview-text">Open an artifact or upload a file to preview it here.</p>
            )}
          </div>
        </section>
        <section className="app-panel" aria-labelledby="app-title">
          {mode === "intro" ? (
            <div className="stack">
              <p className="eyebrow">Local Account</p>
              <button
                className="secondary-button"
                type="button"
                onClick={() => setMode("register")}
              >
                Create Local Account
              </button>
            </div>
          ) : null}
          {mode === "register" ? (
            <form className="stack" onSubmit={requestAccess}>
              <label>
                <span>Username</span>
                <input name="username" required />
              </label>
              <label>
                <span>Email</span>
                <input name="email" type="email" required />
              </label>
              <label>
                <span>Password</span>
                <input name="password" type="password" minLength={8} required />
              </label>
              <button className="primary-button" type="submit">
                Request Access
              </button>
            </form>
          ) : null}
          {mode === "pending" ? (
            <div className="stack">
              <h2>Account pending approval</h2>
              <p>
                An Administrator needs to approve this Local Account before workspace access is
                available.
              </p>
            </div>
          ) : null}
        </section>
        <section className="admin-panel" aria-labelledby="agent-lifecycle-title">
          <div>
            <p className="eyebrow">Administrator Console</p>
            <h2 id="agent-lifecycle-title">Agent Lifecycle</h2>
          </div>
          <article className="agent-row">
            <div>
              <h3>Default Agent lifecycle</h3>
              <p>Primary Agent Conversation entry point.</p>
              <p>Process visibility: standard</p>
            </div>
            <div className="button-row">
              <button className="secondary-button" type="button">
                Create Agent
              </button>
              <button className="secondary-button" type="button">
                Disable Agent
              </button>
              <button className="secondary-button" type="button">
                Retire Agent
              </button>
            </div>
          </article>
        </section>
        <section className="admin-panel" aria-labelledby="model-configurations-title">
          <div>
            <p className="eyebrow">Administrator Console</p>
            <h2 id="model-configurations-title">Model Configurations</h2>
          </div>
          <div className="provider-grid" aria-label="Model Provider Catalog">
            {["OpenAI", "DeepSeek", "MiniMax", "Custom OpenAI-compatible endpoint"].map(
              (provider) => (
                <span className="provider-chip" key={provider}>
                  {provider}
                </span>
              ),
            )}
          </div>
          <button className="secondary-button" type="button">
            Create Model Configuration
          </button>
        </section>
        <section className="admin-panel" aria-labelledby="run-audit-title" aria-label="Run Audit">
          <div>
            <p className="eyebrow">Administrator Console</p>
            <h2 id="run-audit-title">Run Audit</h2>
          </div>
          <div className="audit-overview" aria-label="Run Audit overview">
            <span>Full Trace retained for 90 days</span>
            <span>Storage: 1 artifact</span>
            <span>Recent failed runs: 1</span>
          </div>
          <article className="run-audit-row">
            <div>
              <h3>Run 1 · completed</h3>
              <p>Default Agent · OpenAI GPT-5 · User 2</p>
              <p>Capability snapshot: sandbox enabled</p>
            </div>
            <div className="audit-chip-row">
              <span className="audit-chip success">completed</span>
              <span className="audit-chip">sandbox.exec</span>
              <span className="audit-chip">audit-report.md</span>
            </div>
            <button className="secondary-button" type="button">
              Full Trace
            </button>
          </article>
        </section>
      </aside>
    </main>
  );
}

function getAgent(agentId: string): WorkspaceAgent {
  return workspaceAgents.find((agent) => agent.id === agentId) ?? workspaceAgents[0];
}

function titleFromMessage(message: string): string {
  const firstWords = message.split(/\s+/).slice(0, 5).join(" ");
  return firstWords.length > 48 ? `${firstWords.slice(0, 45)}...` : firstWords;
}

function createAttachmentPreview(file: File): UploadedAttachmentPreview {
  const previewType = inferPreviewType(file.name, file.type);
  return {
    id: Date.now(),
    filename: file.name,
    contentType: file.type || "application/octet-stream",
    previewType,
  };
}

function normalizeAttachmentPreviewText(previewType: PreviewType, text: string) {
  if (previewType === "json") {
    try {
      return JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      return text;
    }
  }
  return text;
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Unable to read file preview."));
      }
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error("Unable to read file preview."));
    };
    reader.readAsDataURL(file);
  });
}

function renderAttachmentPreview(preview: UploadedAttachmentPreview) {
  return (
    <>
      <p className="preview-label">{preview.previewType}</p>
      <h3>{preview.filename}</h3>
      {preview.previewType === "image" && preview.dataUrl ? (
        <img className="preview-media" src={preview.dataUrl} alt={`Image preview: ${preview.filename}`} />
      ) : null}
      {preview.previewType === "pdf" && preview.dataUrl ? (
        <iframe className="preview-frame" src={preview.dataUrl} title={`PDF preview: ${preview.filename}`} />
      ) : null}
      {preview.previewType === "html" ? (
        <iframe
          className="preview-frame"
          sandbox=""
          srcDoc={preview.text ?? ""}
          title={`HTML preview: ${preview.filename}`}
        />
      ) : null}
      {preview.previewType === "table" ? (
        <table className="preview-table">
          <tbody>
            {renderPreviewTableRows(preview.text ?? "")}
          </tbody>
        </table>
      ) : null}
      {preview.previewType !== "image" &&
      preview.previewType !== "pdf" &&
      preview.previewType !== "html" &&
      preview.previewType !== "table" ? (
        <pre className="preview-code">{preview.text ?? "Attachment staged for temporary working context."}</pre>
      ) : null}
      {preview.previewType === "download" ? (
        <p className="preview-text">This file is available for download only in the MVP.</p>
      ) : null}
      <button className="secondary-button" type="button">
        Download
      </button>
    </>
  );
}

function renderPreviewTableRows(text: string) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) {
    return null;
  }
  return lines.map((line, index) => {
    const cells = line.split(/,|\t/);
    return (
      <tr key={`${index}-${line}`}>
        {cells.map((cell, cellIndex) => (
          <td key={`${index}-${cellIndex}`}>{cell.trim()}</td>
        ))}
      </tr>
    );
  });
}

function renderToolCall(toolCall: NonNullable<ConversationMessage["toolCall"]>) {
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

function formatToolCallSummary(toolCall: NonNullable<ConversationMessage["toolCall"]>) {
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

function renderConversationCard(card: { schema: string; payload: Record<string, unknown> }) {
  if (card.schema === "artifact_card") {
    return (
      <div className="conversation-card artifact-card">
        <p className="card-label">Artifact</p>
        <h3>{String(card.payload.filename ?? "Untitled artifact")}</h3>
        <p className="preview-text">{String(card.payload.preview_type ?? "download")}</p>
      </div>
    );
  }

  if (card.schema === "tool_result_card") {
    return (
      <div className="conversation-card tool-result-card">
        <p className="card-label">Tool Result</p>
        <h3>{String(card.payload.tool_name ?? "Tool")}</h3>
        <p className="card-status">{String(card.payload.status ?? "completed")}</p>
        <p className="preview-text">{String(card.payload.summary ?? "Tool call finished.")}</p>
      </div>
    );
  }

  if (card.schema === "choice_card") {
    const options = Array.isArray(card.payload.options) ? card.payload.options : [];
    return (
      <div className="conversation-card choice-card">
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
  }

  if (card.schema === "citation_card") {
    return (
      <div className="conversation-card citation-card">
        <p className="card-label">Citation</p>
        <h3>{String(card.payload.title ?? "Source")}</h3>
        {card.payload.source ? <p className="card-status">{String(card.payload.source)}</p> : null}
        {card.payload.snippet ? <p className="preview-text">{String(card.payload.snippet)}</p> : null}
        <a className="card-link" href={String(card.payload.url ?? "#")}>
          {String(card.payload.url ?? "Open source")}
        </a>
      </div>
    );
  }

  if (card.schema === "status_card") {
    return (
      <div className="conversation-card status-card">
        <p className="card-label">Status</p>
        <h3>{String(card.payload.title ?? "Agent Run update")}</h3>
        <p className="card-status">{String(card.payload.status ?? "running")}</p>
        {card.payload.detail ? <p className="preview-text">{String(card.payload.detail)}</p> : null}
      </div>
    );
  }

  if (card.schema === "form_request_card") {
    const fields = Array.isArray(card.payload.fields) ? card.payload.fields : [];
    return (
      <div className="conversation-card form-request-card">
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
  }

  return (
    <div className="conversation-card unsupported-card">
      <p className="preview-text">Unsupported card schema.</p>
    </div>
  );
}

function inferPreviewType(filename: string, contentType: string): PreviewType {
  const lowerName = filename.toLowerCase();
  const lowerContentType = contentType.toLowerCase();
  if (lowerContentType === "text/markdown" || lowerName.endsWith(".md")) {
    return "markdown";
  }
  if (lowerName.endsWith(".html") || lowerName.endsWith(".htm") || lowerContentType === "text/html") {
    return "html";
  }
  if (lowerContentType.startsWith("text/")) {
    return "plaintext";
  }
  if (lowerContentType.startsWith("image/")) {
    return "image";
  }
  if (lowerContentType === "application/pdf" || lowerName.endsWith(".pdf")) {
    return "pdf";
  }
  if (lowerContentType.includes("json") || lowerName.endsWith(".json")) {
    return "json";
  }
  if (lowerName.endsWith(".csv") || lowerName.endsWith(".tsv")) {
    return "table";
  }
  if (
    lowerName.endsWith(".py") ||
    lowerName.endsWith(".ts") ||
    lowerName.endsWith(".tsx") ||
    lowerName.endsWith(".js") ||
    lowerName.endsWith(".jsx") ||
    lowerName.endsWith(".sh") ||
    lowerName.endsWith(".css")
  ) {
    return "code";
  }
  return "download";
}
