import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Activity, Bell, Copy, Download, ExternalLink, LogOut, Shield, UserRound } from "lucide-react";

import { useAgentRunStream } from "../../shared/ag-ui-stream";
import { type ConversationToolCall } from "../../shared/conversation-message-rendering";
import { CopilotWorkspaceBridge } from "../../shared/copilotkit-adapter";
import { CARD_SCHEMAS, type CardSchema, type ConversationCard } from "../../shared/card-schema-contract";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CopilotConversationSurface } from "./copilot-conversation-surface";
import {
  cancelAgentRun,
  deleteConversation as deleteConversationRequest,
  getArtifactPreview,
  listConversations,
  listRuns,
  listWorkspaceAgents,
  renameConversation as renameConversationRequest,
  type ApiArtifactPreview,
  type ApiConversation,
  type ApiConversationCard,
  type ApiRun,
  type ApiWorkspaceAgent,
} from "./workspace-api";
import { getCurrentUser, logout, type CurrentUser } from "./auth-api";

type ModelOption = {
  id: string;
  label: string;
};

type WorkspaceAgent = {
  id: string;
  backendId: number;
  copilotAgentId: string;
  name: string;
  status: "enabled";
  allowedModels: ModelOption[];
  defaultModelId: string | null;
  capabilitySnapshot: {
    mcpServerCount: number;
    sandbox: boolean;
    search: boolean;
  };
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

type ArtifactReference = NonNullable<ConversationMessage["artifactReference"]>;

type Conversation = {
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

type CommandArtifact = {
  conversationId: string;
  conversationTitle: string;
  reference: ArtifactReference;
};

type CommandRun = {
  conversationId: string;
  conversationTitle: string;
  runId: number;
  status: Conversation["status"];
  updatedAt: string;
};

type ArtifactPanelView = "preview" | "metadata";

export function ConversationShell() {
  const [workspaceAgents, setWorkspaceAgents] = useState<WorkspaceAgent[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [runs, setRuns] = useState<ApiRun[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [conversationSearch, setConversationSearch] = useState("");
  const [commandSearch, setCommandSearch] = useState("");
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [draftAgentId, setDraftAgentId] = useState("");
  const [draftModelId, setDraftModelId] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [previewArtifactId, setPreviewArtifactId] = useState<number | null>(null);
  const [artifactPreviews, setArtifactPreviews] = useState<Record<number, ApiArtifactPreview>>({});
  const [artifactPanelView, setArtifactPanelView] = useState<ArtifactPanelView>("preview");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [latestAttachmentPreviewName, setLatestAttachmentPreviewName] = useState<string | null>(null);
  const [copiedArtifactId, setCopiedArtifactId] = useState<number | null>(null);
  const [isLoadingWorkspace, setIsLoadingWorkspace] = useState(true);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);

  const selectedConversation = conversations.find(
    (conversation) => conversation.id === selectedConversationId,
  );
  const activeRunId = selectedConversation?.latestRunId ?? null;
  const { lastSeenSequence, status: streamStatus } = useAgentRunStream(activeRunId);
  const refreshedRunEventRef = useRef<string | null>(null);
  const activeAgent = getAgent(workspaceAgents, selectedConversation?.agentId ?? draftAgentId);
  const allowedModels = activeAgent.allowedModels;
  const selectedModelId = selectedConversation?.selectedModelId ?? draftModelId;
  const selectedModelLabel =
    allowedModels.find((model) => model.id === selectedModelId)?.label ?? (selectedModelId || "未配置模型");
  const selectedArtifactReferences = useMemo(
    () =>
      selectedConversation?.messages
        .map(getMessageArtifactReference)
        .filter((artifact): artifact is ArtifactReference => Boolean(artifact)) ?? [],
    [selectedConversation],
  );
  const selectedArtifactReference =
    previewArtifactId != null
      ? selectedArtifactReferences.find((artifact) => artifact.artifactId === previewArtifactId) ?? null
      : null;
  const selectedArtifactPreview = previewArtifactId != null
    ? artifactPreviews[previewArtifactId] ?? null
    : null;
  const visibleConversations = useMemo(
    () =>
      conversations.filter((conversation) =>
        conversation.title.toLowerCase().includes(conversationSearch.toLowerCase()),
      ),
    [conversationSearch, conversations],
  );
  const commandArtifacts = useMemo(() => collectCommandArtifacts(conversations), [conversations]);
  const commandRuns = useMemo(() => collectCommandRuns(conversations, runs), [conversations, runs]);
  const visibleCommandConversations = useMemo(
    () =>
      conversations.filter((conversation) =>
        conversation.title.toLowerCase().includes(commandSearch.toLowerCase()),
      ),
    [commandSearch, conversations],
  );
  const visibleCommandArtifacts = useMemo(
    () =>
      commandArtifacts.filter((artifact) =>
        artifact.reference.filename.toLowerCase().includes(commandSearch.toLowerCase()) ||
        artifact.conversationTitle.toLowerCase().includes(commandSearch.toLowerCase()),
      ),
    [commandArtifacts, commandSearch],
  );
  const visibleCommandRuns = useMemo(
    () =>
      commandRuns.filter((run) =>
        `run ${run.runId}`.includes(commandSearch.toLowerCase()) ||
        run.conversationTitle.toLowerCase().includes(commandSearch.toLowerCase()) ||
        formatConversationStatus(run.status).includes(commandSearch),
      ),
    [commandRuns, commandSearch],
  );

  useEffect(() => {
    void refreshWorkspace();
  }, []);

  useEffect(() => {
    if (activeRunId == null || lastSeenSequence === 0) {
      return;
    }
    const refreshKey = `${activeRunId}:${lastSeenSequence}`;
    if (refreshedRunEventRef.current === refreshKey) {
      return;
    }
    refreshedRunEventRef.current = refreshKey;
    void refreshWorkspace(selectedConversationId);
  }, [activeRunId, lastSeenSequence, selectedConversationId]);

  useEffect(() => {
    let isCurrent = true;

    getCurrentUser()
      .then((user) => {
        if (isCurrent) {
          setCurrentUser(user);
        }
      })
      .catch(() => {
        if (isCurrent) {
          setCurrentUser(null);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  useEffect(() => {
    function openCommandPaletteFromKeyboard(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setIsCommandPaletteOpen(true);
      }
    }

    window.addEventListener("keydown", openCommandPaletteFromKeyboard);
    return () => window.removeEventListener("keydown", openCommandPaletteFromKeyboard);
  }, []);

  async function refreshWorkspace(preferredConversationId?: string | null) {
    setWorkspaceError(null);
    try {
      const [apiAgents, apiConversations, apiRuns] = await Promise.all([
        listWorkspaceAgents(),
        listConversations(),
        listRuns(),
      ]);
      const nextAgents = apiAgents.map(mapWorkspaceAgent);
      const nextRuns = apiRuns;
      const nextConversations = apiConversations.map((conversation) =>
        mapConversation(conversation, nextRuns),
      );
      const preferredId = preferredConversationId ?? selectedConversationId;
      const nextSelectedId = preferredId && nextConversations.some((conversation) => conversation.id === preferredId)
        ? preferredId
        : nextConversations[0]?.id ?? null;
      const nextSelectedConversation = nextConversations.find(
        (conversation) => conversation.id === nextSelectedId,
      );
      const nextDraftAgentId = nextSelectedConversation?.agentId ?? nextAgents[0]?.id ?? "";
      const nextAgent = getAgent(nextAgents, nextDraftAgentId);
      const nextDraftModelId = nextSelectedConversation?.selectedModelId
        ?? nextAgent.defaultModelId
        ?? nextAgent.allowedModels[0]?.id
        ?? "";

      setWorkspaceAgents(nextAgents);
      setRuns(nextRuns);
      setConversations(nextConversations);
      setSelectedConversationId(nextSelectedId);
      setDraftAgentId(nextDraftAgentId);
      setDraftModelId(nextDraftModelId);
      setRenameValue(nextSelectedConversation?.title ?? "未命名对话");
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : "工作台数据加载失败。");
    } finally {
      setIsLoadingWorkspace(false);
    }
  }

  function startNewConversation() {
    setSelectedConversationId(null);
    setIsRenaming(false);
    setRenameValue("未命名对话");
    setPreviewArtifactId(null);
    setLatestAttachmentPreviewName(null);
    const firstAgent = workspaceAgents[0];
    if (firstAgent) {
      setDraftAgentId(firstAgent.id);
      setDraftModelId(firstAgent.defaultModelId ?? firstAgent.allowedModels[0]?.id ?? "");
    }
  }

  function startNewConversationFromCommand() {
    startNewConversation();
    closeCommandPalette();
  }

  function selectConversation(conversationId: string) {
    const conversation = conversations.find((item) => item.id === conversationId);
    setSelectedConversationId(conversationId);
    setRenameValue(conversation?.title ?? "");
    setIsRenaming(false);
    setPreviewArtifactId(null);
  }

  function selectConversationFromCommand(conversationId: string) {
    selectConversation(conversationId);
    closeCommandPalette();
  }

  function openArtifactFromCommand(conversationId: string, artifactId: number) {
    selectConversation(conversationId);
    openArtifactPreview(artifactId);
    closeCommandPalette();
  }

  function openRunFromCommand(conversationId: string) {
    selectConversation(conversationId);
    closeCommandPalette();
  }

  function closeCommandPalette() {
    setCommandSearch("");
    setIsCommandPaletteOpen(false);
  }

  async function openArtifactPreview(artifactId: number) {
    setPreviewArtifactId(artifactId);
    setArtifactPanelView("preview");
    if (artifactPreviews[artifactId]) {
      return;
    }
    try {
      const preview = await getArtifactPreview(artifactId);
      setArtifactPreviews((currentPreviews) => ({
        ...currentPreviews,
        [artifactId]: preview,
      }));
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : "制品预览加载失败。");
    }
  }

  async function copyArtifactPreview(reference: ArtifactReference) {
    const content = getArtifactPreviewContent(reference, artifactPreviews[reference.artifactId]);
    try {
      await navigator.clipboard?.writeText(content);
    } finally {
      setCopiedArtifactId(reference.artifactId);
    }
  }

  async function renameConversation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextTitle = renameValue.trim();

    if (!selectedConversation || !nextTitle) {
      return;
    }

    try {
      const updatedConversation = await renameConversationRequest(selectedConversation.id, nextTitle);
      const mappedConversation = mapConversation(updatedConversation, runs);
      setConversations((currentConversations) =>
        currentConversations.map((conversation) =>
          conversation.id === selectedConversation.id ? mappedConversation : conversation,
        ),
      );
      setIsRenaming(false);
      setWorkspaceError(null);
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : "重命名失败。");
    }
  }

  async function deleteConversation() {
    if (!selectedConversation) {
      return;
    }

    try {
      await deleteConversationRequest(selectedConversation.id);
      const remainingConversations = conversations.filter(
        (conversation) => conversation.id !== selectedConversation.id,
      );
      setConversations(remainingConversations);
      setSelectedConversationId(remainingConversations[0]?.id ?? null);
      setRenameValue(remainingConversations[0]?.title ?? "未命名对话");
      setIsRenaming(false);
      setPreviewArtifactId(null);
      setWorkspaceError(null);
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : "删除对话失败。");
    }
  }

  async function stopActiveRun() {
    if (!selectedConversation?.latestRunId) {
      return;
    }
    try {
      await cancelAgentRun(selectedConversation.latestRunId);
      await refreshWorkspace(selectedConversation.id);
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : "停止运行失败。");
    }
  }

  const shellClassName = [
    "app-shell",
    isSidebarCollapsed ? "sidebar-collapsed" : "",
    selectedArtifactReference ? "file-preview-open" : "file-preview-closed",
  ].filter(Boolean).join(" ");

  return (
    <main className={shellClassName}>
      <CopilotWorkspaceBridge
        activeRunId={activeRunId}
        agents={workspaceAgents}
        attachmentPreviewName={latestAttachmentPreviewName}
        conversations={conversations}
        draftAgentId={draftAgentId}
        draftModelId={draftModelId}
        lastSeenSequence={lastSeenSequence}
        previewArtifactId={previewArtifactId}
        selectedArtifactId={selectedArtifactReference?.artifactId ?? null}
        selectedConversationId={selectedConversationId}
        setIsRenaming={setIsRenaming}
        setPreviewArtifactId={setPreviewArtifactId}
        setRenameValue={setRenameValue}
        setSelectedConversationId={setSelectedConversationId}
        streamStatus={streamStatus}
      />
      <aside className="conversation-sidebar" aria-label="智能体会话" data-collapsed={isSidebarCollapsed}>
        <div className="brand-block">
          <a className="brand-link" href="/app/conversations" aria-label="Minimalist Agent 首页">
            <span className="brand-mark" aria-hidden="true">
              <img className="brand-logo" src="/brand-mark.svg" alt="" />
            </span>
            <h1 id="app-title">Minimalist Agent</h1>
          </a>
          <Button
            aria-label={isSidebarCollapsed ? "展开侧边栏" : "收起侧边栏"}
            className="sidebar-toggle"
            type="button"
            onClick={() => setIsSidebarCollapsed((isCollapsed) => !isCollapsed)}
          >
            {isSidebarCollapsed ? "展开" : "收起"}
          </Button>
          <p>对话工作台</p>
        </div>
        <Button
          aria-label="搜索对话、运行或制品 ⌘ K"
          className="command-search-button"
          type="button"
          onClick={() => setIsCommandPaletteOpen(true)}
        >
          <span>搜索对话、运行或制品</span>
          <kbd>⌘ K</kbd>
        </Button>
        <Button className="primary-button full-width" type="button" onClick={startNewConversation}>
          新建对话
        </Button>
        <section className="sidebar-section" aria-label="历史对话">
          <div className="sidebar-section-head">
            <span>历史对话</span>
            <span>{visibleConversations.length}</span>
          </div>
          <label className="compact-field">
            <span>搜索</span>
            <Input
              aria-label="搜索对话"
              name="conversation-search"
              type="search"
              value={conversationSearch}
              onChange={(event) => setConversationSearch(event.target.value)}
            />
          </label>
          <nav className="conversation-list" aria-label="最近对话">
            {visibleConversations.map((conversation) => {
              const conversationAgent = getAgent(workspaceAgents, conversation.agentId);

              return (
                <Button
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
                    <span className={`status-dot ${conversation.status}`}>
                      {formatConversationStatus(conversation.status)}
                    </span>
                    <span>{conversation.updatedAt}</span>
                  </span>
                </Button>
              );
            })}
            {visibleConversations.length === 0 ? (
              <p className="empty-state">没有匹配的对话。</p>
            ) : null}
          </nav>
        </section>
        <AccountCenter currentUser={currentUser} />
      </aside>

      <section className="conversation-workspace" aria-labelledby="conversation-title">
        <header className="conversation-header">
          <div>
            <p className="eyebrow">智能体对话</p>
            <h2 id="conversation-title">
              {selectedConversation ? selectedConversation.title : "新对话"}
            </h2>
            <div className="context-strip" aria-label="当前对话上下文">
              {selectedConversation
                ? (
                    <>
                      <span>{activeAgent.name}</span>
                      <span>{selectedModelLabel}</span>
                      <span>运行：{formatConversationStatus(selectedConversation.status)}</span>
                    </>
                  )
                : (
                    <>
                      <span>{activeAgent.name}</span>
                      <span>{selectedModelLabel}</span>
                      <span>发送后创建对话</span>
                    </>
                  )}
            </div>
          </div>
          <div className="conversation-actions">
            <span className={`run-status ${streamStatus}`}>
              {formatStreamStatus(streamStatus)}
            </span>
            <Button
              className="secondary-button"
              disabled={!selectedConversation || !isActiveConversationRun(selectedConversation)}
              type="button"
              onClick={stopActiveRun}
            >
              停止运行
            </Button>
            <Button
              className="secondary-button"
              disabled={!selectedConversation}
              type="button"
              onClick={() => setIsRenaming(true)}
            >
              重命名
            </Button>
            <Button
              className="danger-button"
              disabled={!selectedConversation}
              type="button"
              onClick={deleteConversation}
            >
              删除
            </Button>
          </div>
        </header>

        {isRenaming && selectedConversation ? (
          <form className="rename-panel" onSubmit={renameConversation}>
            <label>
              <span>对话名称</span>
              <Input
                name="conversation-title"
                value={renameValue}
                onChange={(event) => setRenameValue(event.target.value)}
              />
            </label>
            <Button className="primary-button" type="submit">
              保存名称
            </Button>
          </form>
        ) : null}
        {workspaceError ? (
          <p className="workspace-error" role="alert">{workspaceError}</p>
        ) : null}

        <section className="copilot-chat-panel" aria-label="对话消息">
          <Card className="stream-banner" role="status" aria-live="polite">
            <span>AG-UI：{streamStatus === "connected" ? "已连接" : "空闲"}</span>
            <span>{selectedConversation ? `Run ${activeRunId ?? 0}` : "无运行"}</span>
            <span>{formatRunActivity(lastSeenSequence)}</span>
          </Card>
          <CopilotConversationSurface
            key={[
              activeAgent.copilotAgentId,
              selectedConversation?.id ?? "draft",
              selectedModelId,
              selectedConversation?.latestRunId ?? "no-run",
              selectedConversation?.status ?? "draft",
            ].join(":")}
            activeAgent={{
              backendId: activeAgent.backendId,
              copilotAgentId: activeAgent.copilotAgentId,
              name: activeAgent.name,
            }}
            conversationId={selectedConversation?.id ?? null}
            conversationMessages={selectedConversation?.messages ?? []}
            isBackendRunActive={Boolean(selectedConversation && isActiveConversationRun(selectedConversation))}
            isLoadingWorkspace={isLoadingWorkspace}
            modelControls={(
              <>
                <label className="model-select-field">
                  <span>模型选择</span>
                  <Select
                    disabled={Boolean(selectedConversation)}
                    value={selectedModelId}
                    onValueChange={setDraftModelId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={selectedModelLabel} />
                    </SelectTrigger>
                    <SelectContent>
                      {allowedModels.map((model) => (
                        <SelectItem key={model.id} value={model.id}>
                          {model.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
                <Badge variant="secondary">能力边界由管理员策略决定</Badge>
              </>
            )}
            previewArtifactId={previewArtifactId}
            selectedModelId={selectedModelId}
            onArtifactOpen={openArtifactPreview}
            onAttachmentUploaded={setLatestAttachmentPreviewName}
            onRunSettled={refreshWorkspace}
            onStopBackendRun={stopActiveRun}
            onWorkspaceError={setWorkspaceError}
          />
        </section>
      </section>

      {selectedArtifactReference ? (
        <aside className="artifact-inspector" aria-label="文件预览">
          <Card className="app-panel preview-panel inspector-panel">
            <CardHeader className="inspector-header">
              <div>
                <p className="eyebrow">文件预览</p>
                <h2 id="artifact-preview-title">制品</h2>
              </div>
              <div className="inspector-actions">
                <Badge variant="outline">只读</Badge>
                <Button
                  className="artifact-tab"
                  type="button"
                  onClick={() => setPreviewArtifactId(null)}
                >
                  关闭文件预览
                </Button>
              </div>
            </CardHeader>
            <CardContent
              aria-label="文件预览内容"
              className="flex flex-col gap-4"
            >
              <div className="artifact-actions">
                <Button
                  aria-pressed={artifactPanelView === "preview"}
                  className={artifactPanelView === "preview" ? "artifact-tab active" : "artifact-tab"}
                  type="button"
                  onClick={() => setArtifactPanelView("preview")}
                >
                  预览
                </Button>
                <Button
                  aria-pressed={artifactPanelView === "metadata"}
                  className={artifactPanelView === "metadata" ? "artifact-tab active" : "artifact-tab"}
                  type="button"
                  onClick={() => setArtifactPanelView("metadata")}
                >
                  元数据
                </Button>
              </div>
              <div className="preview-surface" role="presentation">
                {artifactPanelView === "metadata" ? (
                  <ArtifactMetadataView
                    conversationTitle={selectedConversation?.title ?? "未命名对话"}
                    preview={selectedArtifactPreview}
                    reference={selectedArtifactReference}
                  />
                ) : (
                  <GeneratedArtifactPreview
                    copiedArtifactId={copiedArtifactId}
                    preview={selectedArtifactPreview}
                    reference={selectedArtifactReference}
                    onCopy={copyArtifactPreview}
                  />
                )}
              </div>
            </CardContent>
          </Card>
        </aside>
      ) : null}
      {isCommandPaletteOpen ? (
        <CommandPalette
          artifacts={visibleCommandArtifacts}
          conversations={visibleCommandConversations}
          runs={visibleCommandRuns}
          searchValue={commandSearch}
          onClose={closeCommandPalette}
          onOpenArtifact={openArtifactFromCommand}
          onOpenRun={openRunFromCommand}
          onSearchChange={setCommandSearch}
          onSelectConversation={selectConversationFromCommand}
          onStartConversation={startNewConversationFromCommand}
        />
      ) : null}
    </main>
  );
}

const emptyWorkspaceAgent: WorkspaceAgent = {
  id: "",
  backendId: 0,
  copilotAgentId: "default",
  name: "未配置智能体",
  status: "enabled",
  allowedModels: [],
  defaultModelId: null,
  capabilitySnapshot: {
    mcpServerCount: 0,
    sandbox: false,
    search: false,
  },
};

function getAgent(agents: WorkspaceAgent[], agentId: string): WorkspaceAgent {
  return agents.find((agent) => agent.id === agentId) ?? agents[0] ?? emptyWorkspaceAgent;
}

function mapWorkspaceAgent(response: ApiWorkspaceAgent): WorkspaceAgent {
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
      sandbox: response.agent.capability_policy.sandbox_enabled,
      search: response.agent.capability_policy.search_enabled,
    },
  };
}

function mapConversation(conversation: ApiConversation, runs: ApiRun[]): Conversation {
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
    messages: conversation.messages.map((message, index) => mapConversationMessage(message, conversation.id, index)),
  };
}

function mapConversationMessage(
  message: ApiConversation["messages"][number],
  conversationId: number,
  index: number,
): ConversationMessage {
  return {
    id: `conversation-${conversationId}-message-${index + 1}`,
    role: message.role,
    content: message.content,
    artifactReference: message.artifact_reference
      ? {
          artifactId: message.artifact_reference.artifact_id,
          filename: message.artifact_reference.filename,
          previewType: message.artifact_reference.preview_type,
        }
      : undefined,
    card: message.card ? mapConversationCard(message.card) : undefined,
  };
}

function mapConversationCard(card: ApiConversationCard): ConversationCard {
  const schema = String(card.schema ?? card.card_schema ?? "");
  return {
    schema: isCardSchema(schema) ? schema : "status_card",
    payload: card.payload,
  };
}

function isCardSchema(schema: string): schema is CardSchema {
  return (CARD_SCHEMAS as readonly string[]).includes(schema);
}

function getMessageArtifactReference(message: ConversationMessage): ArtifactReference | null {
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

function collectCommandArtifacts(conversations: Conversation[]): CommandArtifact[] {
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

function collectCommandRuns(conversations: Conversation[], runs: ApiRun[]): CommandRun[] {
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
        status: run.status,
        updatedAt: conversation.updatedAt,
      });
  }
  return commandRuns;
}

function AccountCenter({ currentUser }: { currentUser: CurrentUser | null }) {
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const accountCenterRef = useRef<HTMLElement | null>(null);
  const displayName = currentUser?.username ?? "加载账号";
  const accountMeta = currentUser?.email ?? (currentUser ? "本地账号" : "加载中");
  const accountRole = formatSidebarUserRole(currentUser?.role);

  useEffect(() => {
    if (!isAccountMenuOpen) {
      return;
    }

    function closeAccountMenu(event: PointerEvent) {
      if (!accountCenterRef.current?.contains(event.target as Node)) {
        setIsAccountMenuOpen(false);
      }
    }

    function closeAccountMenuFromKeyboard(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsAccountMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", closeAccountMenu);
    document.addEventListener("keydown", closeAccountMenuFromKeyboard);
    return () => {
      document.removeEventListener("pointerdown", closeAccountMenu);
      document.removeEventListener("keydown", closeAccountMenuFromKeyboard);
    };
  }, [isAccountMenuOpen]);

  return (
    <footer className="conversation-sidebar-footer account-center" aria-label="账号中心" ref={accountCenterRef}>
      {isAccountMenuOpen ? (
        <section className="account-menu" id="account-menu" role="dialog" aria-label="账号菜单">
          <div className="account-menu-profile">
            <span className="account-avatar large" aria-hidden="true">{avatarInitials(displayName)}</span>
            <span className="account-summary-copy">
              <strong>{displayName}</strong>
              <span>{accountMeta}</span>
            </span>
            <Badge variant={currentUser?.role === "admin" ? "default" : "secondary"}>
              {accountRole}
            </Badge>
          </div>
          <nav className="account-menu-actions" aria-label="账号操作">
            {currentUser?.role === "admin" ? (
              <>
                <a className="account-action" href="/admin" aria-label="管理控制台">
                  <Shield aria-hidden="true" />
                  <span>
                    <strong>管理控制台</strong>
                    <small>账号、模型与工具治理</small>
                  </span>
                </a>
                <a className="account-action" href="/admin/run-audit" aria-label="运行审计">
                  <Activity aria-hidden="true" />
                  <span>
                    <strong>运行审计</strong>
                    <small>查看智能体执行记录</small>
                  </span>
                </a>
              </>
            ) : null}
            <a className="account-action" href="/account-settings" aria-label="个人信息维护">
              <UserRound aria-hidden="true" />
              <span>
                <strong>个人信息维护</strong>
                <small>更新账号资料</small>
              </span>
            </a>
            <Button className="account-action logout-action" type="button" aria-label="退出登录" onClick={logout}>
              <LogOut aria-hidden="true" />
              <span>
                <strong>退出登录</strong>
                <small>结束当前会话</small>
              </span>
            </Button>
          </nav>
        </section>
      ) : null}
      <div className="account-bottom-bar">
        <Button
          aria-controls="account-menu"
          aria-expanded={isAccountMenuOpen}
          aria-haspopup="dialog"
          aria-label="打开账号菜单"
          className="account-profile-trigger"
          type="button"
          onClick={() => setIsAccountMenuOpen((isOpen) => !isOpen)}
        >
          <span className="account-avatar" aria-hidden="true">{avatarInitials(displayName)}</span>
          <span className="account-trigger-copy">
            <strong>{displayName}</strong>
            <span>{accountRole}</span>
          </span>
        </Button>
        <Button
          aria-label="消息通知，1 条未读"
          className="account-notification-button"
          title="消息通知"
          type="button"
        >
          <Bell aria-hidden="true" />
          <span className="notification-indicator" aria-hidden="true">1</span>
        </Button>
      </div>
    </footer>
  );
}

function avatarInitials(value: string) {
  const normalized = value.trim();
  if (!normalized || normalized === "加载账号") {
    return "MA";
  }
  return normalized.slice(0, 2).toUpperCase();
}

function formatSidebarUserRole(role: CurrentUser["role"] | undefined) {
  if (role === "admin") {
    return "管理员";
  }
  if (role === "user") {
    return "成员";
  }
  return "加载中";
}

function isActiveConversationRun(conversation: Conversation) {
  return conversation.status === "queued" || conversation.status === "running";
}

function CommandPalette({
  artifacts,
  conversations,
  onClose,
  onOpenArtifact,
  onOpenRun,
  onSearchChange,
  onSelectConversation,
  onStartConversation,
  runs,
  searchValue,
}: {
  artifacts: CommandArtifact[];
  conversations: Conversation[];
  onClose: () => void;
  onOpenArtifact: (conversationId: string, artifactId: number) => void;
  onOpenRun: (conversationId: string) => void;
  onSearchChange: (value: string) => void;
  onSelectConversation: (conversationId: string) => void;
  onStartConversation: () => void;
  runs: CommandRun[];
  searchValue: string;
}) {
  const hasNoResults = conversations.length === 0 && runs.length === 0 && artifacts.length === 0;

  return (
    <div className="command-palette-layer">
      <button className="command-palette-backdrop" type="button" aria-label="关闭命令面板" onClick={onClose} />
      <section className="command-palette" role="dialog" aria-modal="true" aria-label="命令面板">
        <div className="command-palette-header">
          <Input
            aria-label="命令面板搜索"
            autoFocus
            type="search"
            placeholder="搜索对话、运行或制品"
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                onClose();
              }
            }}
          />
        </div>
        <div className="command-palette-section">
          <p className="command-section-title">快捷创建</p>
          <Button aria-label="新建对话" className="command-action" type="button" onClick={onStartConversation}>
            <span>新建对话</span>
            <small>发送第一条消息后创建 Agent Conversation</small>
          </Button>
        </div>
        <div className="command-palette-section">
          <p className="command-section-title">最近对话</p>
          {conversations.map((conversation) => (
            <Button
              aria-label={`打开对话 ${conversation.title}`}
              className="command-action"
              key={conversation.id}
              type="button"
              onClick={() => onSelectConversation(conversation.id)}
            >
              <span>{conversation.title}</span>
              <small>{formatConversationStatus(conversation.status)} · {conversation.updatedAt}</small>
            </Button>
          ))}
        </div>
        <div className="command-palette-section">
          <p className="command-section-title">最近运行</p>
          {runs.map((run) => (
            <Button
              aria-label={`打开运行 Run ${run.runId}`}
              className="command-action"
              key={`${run.conversationId}-${run.runId}`}
              type="button"
              onClick={() => onOpenRun(run.conversationId)}
            >
              <span>Run {run.runId}</span>
              <small>{run.conversationTitle} · {formatConversationStatus(run.status)} · {run.updatedAt}</small>
            </Button>
          ))}
        </div>
        <div className="command-palette-section">
          <p className="command-section-title">最近制品</p>
          {artifacts.map((artifact) => (
            <Button
              aria-label={`打开制品 ${artifact.reference.filename}`}
              className="command-action"
              key={artifact.reference.artifactId}
              type="button"
              onClick={() => onOpenArtifact(artifact.conversationId, artifact.reference.artifactId)}
            >
              <span>{artifact.reference.filename}</span>
              <small>{artifact.conversationTitle} · {artifact.reference.previewType}</small>
            </Button>
          ))}
          {hasNoResults ? <p className="empty-state">没有匹配的对话或制品。</p> : null}
        </div>
      </section>
    </div>
  );
}

function ArtifactMetadataView({
  conversationTitle,
  preview,
  reference,
}: {
  conversationTitle: string;
  preview: ApiArtifactPreview | null;
  reference: ArtifactReference;
}) {
  const content = getArtifactPreviewContent(reference, preview);
  const rows = [
    ["文件名", reference.filename],
    ["类型", reference.previewType],
    ["大小", formatArtifactSize(content)],
    ["创建时间", "刚刚"],
    ["来源对话", conversationTitle],
  ];

  return (
    <dl className="artifact-metadata-list" aria-label="制品元数据">
      {rows.map(([label, value]) => (
        <div className="artifact-metadata-row" key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function GeneratedArtifactPreview({
  copiedArtifactId,
  onCopy,
  preview,
  reference,
}: {
  copiedArtifactId: number | null;
  onCopy: (reference: ArtifactReference) => void;
  preview: ApiArtifactPreview | null;
  reference: ArtifactReference;
}) {
  const content = getArtifactPreviewContent(reference, preview);

  return (
    <>
      <div className="artifact-preview-topline">
        <div>
          <p className="preview-label">{reference.previewType}</p>
          <h3>{reference.filename}</h3>
          <p className="artifact-updated-at">生成时间：刚刚</p>
        </div>
        <div className="artifact-toolbar" role="toolbar" aria-label="制品操作">
          <button
            aria-label={`复制 ${reference.filename}`}
            className="artifact-tool-button"
            type="button"
            onClick={() => onCopy(reference)}
          >
            <Copy aria-hidden="true" />
            <span>{copiedArtifactId === reference.artifactId ? "已复制" : "复制"}</span>
          </button>
          <a
            aria-label={`下载 ${reference.filename}`}
            className="artifact-tool-button"
            download={reference.filename}
            href={createTextDownloadHref(content, reference.previewType)}
          >
            <Download aria-hidden="true" />
            <span>下载</span>
          </a>
          <a
            aria-label={`打开独立预览 ${reference.filename}`}
            className="artifact-tool-button"
            href={createTextDownloadHref(content, reference.previewType)}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink aria-hidden="true" />
            <span>打开</span>
          </a>
        </div>
      </div>
      {!preview ? (
        <p className="preview-text">正在加载文件预览。</p>
      ) : reference.previewType === "markdown" ? (
        <article className="artifact-document-preview">
          {renderMarkdownPreview(content)}
        </article>
      ) : reference.previewType === "json" ? (
        <JsonArtifactPreview content={content} />
      ) : reference.previewType === "code" ? (
        <CodeArtifactPreview content={content} />
      ) : reference.previewType === "html" ? (
        <HtmlArtifactPreview content={content} />
      ) : reference.previewType === "plaintext" ? (
        <PlainTextArtifactPreview content={content} />
      ) : reference.previewType === "image" ? (
        <ImageArtifactPreview content={content} filename={reference.filename} />
      ) : reference.previewType === "pdf" ? (
        <PdfArtifactPreview content={content} filename={reference.filename} />
      ) : (
        <p className="preview-text">{content}</p>
      )}
    </>
  );
}

function getArtifactPreviewContent(_reference: ArtifactReference, preview: ApiArtifactPreview | null) {
  return preview?.text ?? preview?.data_url ?? "";
}

function createTextDownloadHref(content: string, previewType: string) {
  if ((previewType === "image" || previewType === "pdf") && content.startsWith("data:")) {
    return content;
  }

  const mimeType = previewType === "markdown"
    ? "text/markdown"
    : previewType === "json"
      ? "application/json"
      : previewType === "code"
        ? "text/plain"
        : previewType === "html"
          ? "text/html"
          : "text/plain";
  return `data:${mimeType};charset=utf-8,${encodeURIComponent(content)}`;
}

function formatArtifactSize(content: string) {
  return `${new Blob([content]).size} B`;
}

function renderMarkdownPreview(content: string) {
  return content
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line, index) => {
      const trimmedLine = line.trim();
      if (trimmedLine.startsWith("# ")) {
        return <h4 key={`${index}-${trimmedLine}`}>{trimmedLine.slice(2)}</h4>;
      }
      return <p key={`${index}-${trimmedLine}`}>{trimmedLine}</p>;
    });
}

function JsonArtifactPreview({ content }: { content: string }) {
  const rows = getJsonPreviewRows(content);

  return (
    <table className="preview-table" aria-label="JSON 制品预览">
      <tbody>
        {rows.map(([key, value]) => (
          <tr key={key}>
            <th scope="row">{key}</th>
            <td>{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CodeArtifactPreview({ content }: { content: string }) {
  return (
    <pre className="preview-code" role="region" aria-label="代码制品预览">
      <code>{content}</code>
    </pre>
  );
}

function HtmlArtifactPreview({ content }: { content: string }) {
  return (
    <iframe
      className="preview-frame"
      sandbox=""
      srcDoc={content}
      title="HTML 制品预览"
    />
  );
}

function PlainTextArtifactPreview({ content }: { content: string }) {
  return (
    <pre className="preview-code" role="region" aria-label="纯文本制品预览">
      {content}
    </pre>
  );
}

function ImageArtifactPreview({ content, filename }: { content: string; filename: string }) {
  return (
    <img className="preview-media" src={content} alt={`图像制品预览：${filename}`} />
  );
}

function PdfArtifactPreview({ content, filename }: { content: string; filename: string }) {
  return (
    <iframe className="preview-frame" src={content} title={`PDF 制品预览：${filename}`} />
  );
}

function getJsonPreviewRows(content: string): Array<[string, string]> {
  try {
    const parsed = JSON.parse(content) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return [["value", formatJsonPreviewValue(parsed)]];
    }

    return Object.entries(parsed).map(([key, value]) => [key, formatJsonPreviewValue(value)]);
  } catch {
    return [["value", content]];
  }
}

function formatJsonPreviewValue(value: unknown) {
  if (value == null) {
    return "null";
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return JSON.stringify(value);
}

function formatSafeInputSummary(safeInput: Record<string, unknown>) {
  const query = safeInput.query;
  if (typeof query === "string") {
    return `输入：${query}`;
  }

  const entries = Object.entries(safeInput)
    .filter(([, value]) => value != null)
    .slice(0, 3);

  if (entries.length === 0) {
    return "输入：已记录安全摘要";
  }

  return `输入：${entries.map(([key, value]) => `${key}=${String(value)}`).join(" · ")}`;
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

function formatCapabilitySnapshot(name: string, isEnabled: boolean) {
  return `${name}：${isEnabled ? "已授权" : "未授权"}`;
}

function formatRunActivity(lastSeenSequence: number) {
  return lastSeenSequence > 0
    ? `运行进度：已同步 ${lastSeenSequence} 条运行更新`
    : "运行进度：暂无新活动";
}

function formatRecentRunActivity(lastSeenSequence: number) {
  return lastSeenSequence > 0
    ? `已同步 ${lastSeenSequence} 条运行更新`
    : "暂无新活动";
}

function formatConversationStatus(status: Conversation["status"]) {
  switch (status) {
    case "running":
      return "运行中";
    case "completed":
      return "已完成";
    case "failed":
      return "失败";
    case "cancelled":
      return "已停止";
    case "idle":
      return "空闲";
    default:
      return status;
  }
}

function formatStreamStatus(status: "idle" | "connected" | "unavailable") {
  switch (status) {
    case "connected":
      return "运行已连接";
    case "unavailable":
      return "运行不可用";
    case "idle":
      return "运行空闲";
    default:
      return status;
  }
}
