import { ChangeEvent, FormEvent, useMemo, useRef, useState } from "react";

import {
  AttachmentPreview,
  createAttachmentPreview,
  normalizeAttachmentPreviewText,
  readFileAsDataUrl,
  type UploadedAttachmentPreview,
} from "./attachment-preview";
import { useAgentRunStream } from "./ag-ui-stream";
import {
  ConversationCardView,
  ToolCallView,
  type ConversationToolCall,
} from "./conversation-message-rendering";
import { CopilotWorkspaceBridge } from "./copilotkit-adapter";
import type { ConversationCard } from "./card-schema-contract";

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
  toolCall?: ConversationToolCall;
  artifactReference?: {
    artifactId: number;
    filename: string;
    previewType: string;
  };
  card?: ConversationCard;
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

export function ConversationShell() {
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
  const { lastSeenSequence, status: streamStatus } = useAgentRunStream(activeRunId);
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
      <CopilotWorkspaceBridge
        activeRunId={activeRunId}
        agents={workspaceAgents}
        attachmentPreviewName={attachmentPreview?.filename ?? null}
        conversations={conversations}
        draftAgentId={draftAgentId}
        draftModelId={draftModelId}
        lastSeenSequence={lastSeenSequence}
        previewArtifactId={previewArtifactId}
        selectedArtifactId={selectedArtifactReference?.artifactId ?? null}
        selectedConversationId={selectedConversationId}
        setComposerValue={setComposerValue}
        setIsRenaming={setIsRenaming}
        setPreviewArtifactId={setPreviewArtifactId}
        setRenameValue={setRenameValue}
        setSelectedConversationId={setSelectedConversationId}
        streamStatus={streamStatus}
      />
      <aside className="conversation-sidebar" aria-label="Agent Conversations">
        <div className="brand-block">
          <a className="brand-link" href="/app/conversations" aria-label="Minimalist Agent home">
            <span className="brand-mark">MA</span>
            <h1 id="app-title">Minimalist Agent</h1>
          </a>
          <p>Agent Conversation workspace</p>
        </div>
        <button className="primary-button full-width" type="button" onClick={startNewConversation}>
          New Conversation
        </button>
        <nav className="workspace-nav" aria-label="Workspace navigation">
          <a className="workspace-nav-item active" href="/app/conversations">Conversations</a>
          <a className="workspace-nav-item" href="/admin/run-audit">Run Audit</a>
          <a className="workspace-nav-item" href="/admin">Administrator Console</a>
        </nav>
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
                  <span>{conversationAgent.name}</span>
                  <span className={`status-dot ${conversation.status}`}>{conversation.status}</span>
                  <span>{conversation.updatedAt}</span>
                </span>
              </button>
            );
          })}
          {visibleConversations.length === 0 ? (
            <p className="empty-state">No conversations match this search.</p>
          ) : null}
        </nav>
        <footer className="conversation-sidebar-footer">
          <a className="user-pill" href="/account-settings">
            <span className="brand-mark">oil</span>
            <span>oil</span>
          </a>
          <a className="secondary-button full-width" href="/admin">Admin Console</a>
        </footer>
      </aside>

      <section className="conversation-workspace" aria-labelledby="conversation-title">
        <header className="conversation-header">
          <div>
            <p className="eyebrow">Agent Conversation</p>
            <h2 id="conversation-title">
              {selectedConversation ? selectedConversation.title : "New conversation"}
            </h2>
            <p>
              {selectedConversation
                ? `${activeAgent.name} · ${selectedModelId} · Last run ${selectedConversation.status}`
                : "Choose an enabled Agent and send the first message to create a conversation."}
            </p>
          </div>
          <div className="conversation-actions">
            <span className={`run-status ${streamStatus}`}>
              {streamStatus === "connected" ? "Run connected" : "Run idle"}
            </span>
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
            </div>
          ) : null}
          {(selectedConversation?.messages ?? []).map((message) => (
            <article className={`message-row ${message.role}`} key={message.id}>
              <span className="message-role">{message.role}</span>
              <p>{message.content}</p>
              {message.toolCall ? <ToolCallView toolCall={message.toolCall} /> : null}
              {message.card ? (
                <div className="card-shell" data-card-schema={message.card.schema}>
                  <ConversationCardView card={message.card} />
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
            <button
              className="secondary-button"
              disabled={!selectedConversation || selectedConversation.status !== "running"}
              type="button"
            >
              Stop Run
            </button>
            <button className="primary-button send-button" type="submit" onClick={clearAttachmentPreview}>
              Send Message
            </button>
          </div>
        </form>

        <form className="attachment-upload-panel" aria-label="Run Attachment staging" onSubmit={uploadAttachment}>
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

      <aside className="artifact-inspector" aria-label="Artifact Inspector">
        <section
          className="app-panel preview-panel"
          aria-label="Artifact Preview"
        >
          <div className="inspector-header">
            <div>
              <p className="eyebrow">Artifact Preview</p>
              <h2 id="artifact-preview-title">Preview</h2>
            </div>
            <button className="secondary-button" type="button">Download</button>
          </div>
          <div className="artifact-actions">
            <button className="artifact-tab active" type="button">Markdown</button>
            <button className="artifact-tab" type="button">JSON</button>
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
              <AttachmentPreview preview={attachmentPreview} />
            ) : (
              <p className="preview-text">Open an artifact or upload a file to preview it here.</p>
            )}
          </div>
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
