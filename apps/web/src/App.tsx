import { FormEvent, useMemo, useState } from "react";

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

  const selectedConversation = conversations.find(
    (conversation) => conversation.id === selectedConversationId,
  );
  const activeRunId = selectedConversation ? 1 : null;
  const { lastSeenSequence, status: streamStatus, streamUrl } = useAgentRunStream(activeRunId);
  const activeAgent = getAgent(selectedConversation?.agentId ?? draftAgentId);
  const allowedModels = activeAgent.allowedModels;
  const selectedModelId = selectedConversation?.selectedModelId ?? draftModelId;
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
          <button className="primary-button send-button" type="submit">
            Send Message
          </button>
        </form>
      </section>

      <aside className="right-rail" aria-label="Account and Administrator Console">
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
