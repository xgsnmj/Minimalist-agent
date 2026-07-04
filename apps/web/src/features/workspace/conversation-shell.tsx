import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { CopilotChat } from "@copilotkit/react-core/v2";
import { Copy, Download, ExternalLink, Paperclip, X } from "lucide-react";

import {
  AttachmentPreview,
  createAttachmentPreview,
  normalizeAttachmentPreviewText,
  readFileAsDataUrl,
  type UploadedAttachmentPreview,
} from "../../shared/attachment-preview";
import { useAgentRunStream } from "../../shared/ag-ui-stream";
import {
  ConversationCardView,
  type ConversationToolCall,
  ToolCallView,
} from "../../shared/conversation-message-rendering";
import { CopilotWorkspaceBridge } from "../../shared/copilotkit-adapter";
import type { ConversationCard } from "../../shared/card-schema-contract";
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

type ModelOption = {
  id: string;
  label: string;
};

type WorkspaceAgent = {
  id: string;
  name: string;
  status: "enabled";
  allowedModels: ModelOption[];
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
  status: "idle" | "running" | "completed" | "failed" | "cancelled";
  updatedAt: string;
  selectedModelId: string;
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

type InspectorTab = "artifact" | "run" | "tools";
type ArtifactPanelView = "preview" | "metadata";

const workspaceAgents: WorkspaceAgent[] = [
  {
    id: "default",
    name: "默认智能体",
    status: "enabled",
    allowedModels: [{ id: "openai-gpt-5", label: "OpenAI / GPT-5" }],
    capabilitySnapshot: {
      mcpServerCount: 1,
      sandbox: true,
      search: true,
    },
  },
  {
    id: "research",
    name: "研究智能体",
    status: "enabled",
    allowedModels: [
      { id: "doubao-seed", label: "Doubao / Seed 1.6" },
      { id: "minimax-m1", label: "MiniMax / M1" },
    ],
    capabilitySnapshot: {
      mcpServerCount: 0,
      sandbox: false,
      search: true,
    },
  },
];

const copilotChatLabels = {
  assistantMessageToolbarCopyCodeCopiedLabel: "已复制",
  assistantMessageToolbarCopyCodeLabel: "复制代码",
  assistantMessageToolbarCopyMessageLabel: "复制消息",
  assistantMessageToolbarReadAloudLabel: "朗读",
  assistantMessageToolbarRegenerateLabel: "重新生成",
  assistantMessageToolbarThumbsDownLabel: "反馈无效",
  assistantMessageToolbarThumbsUpLabel: "反馈有效",
  chatDisclaimerText: "策略约束由管理员配置",
  chatInputPlaceholder: "向当前智能体发送消息",
  chatInputToolbarAddButtonLabel: "添加",
  chatInputToolbarCancelTranscribeButtonLabel: "取消语音",
  chatInputToolbarFinishTranscribeButtonLabel: "结束语音",
  chatInputToolbarStartTranscribeButtonLabel: "开始语音",
  chatInputToolbarToolsButtonLabel: "工具",
  chatToggleCloseLabel: "关闭 Copilot",
  chatToggleOpenLabel: "打开 Copilot",
  modalHeaderTitle: "工作台 Copilot",
  userMessageToolbarCopyMessageLabel: "复制消息",
  userMessageToolbarEditMessageLabel: "编辑消息",
  welcomeMessageText: "当前会话由 CopilotKit 渲染。运行与权限由后端治理。",
};

const runAttachmentAccept = "text/*,application/json,application/pdf,image/*,.md,.csv";

const initialConversations: Conversation[] = [
  {
    id: "conversation-1",
    title: "市场调研",
    agentId: "default",
    status: "idle",
    updatedAt: "刚刚",
    selectedModelId: "openai-gpt-5",
    messages: [
      {
        id: "message-1",
        role: "user",
        content: "调研生产级 AI 工作台的会话、运行和制品设计逻辑。",
      },
      {
        id: "message-2",
        role: "assistant",
        content:
          "已建立调研范围：会话线程、运行状态、工具调用、附件和制品预览。",
      },
      {
        id: "message-3",
        role: "assistant",
        content: "制品已生成：brief.md",
        artifactReference: {
          artifactId: 1,
          filename: "brief.md",
          previewType: "markdown",
        },
      },
      {
        id: "message-4",
        role: "assistant",
        content: "制品已生成：metrics.json",
        artifactReference: {
          artifactId: 2,
          filename: "metrics.json",
          previewType: "json",
        },
      },
      {
        id: "message-4-code",
        role: "assistant",
        content: "制品已生成：analysis.ts",
        artifactReference: {
          artifactId: 5,
          filename: "analysis.ts",
          previewType: "code",
        },
      },
      {
        id: "message-4-html",
        role: "assistant",
        content: "制品已生成：demo.html",
        artifactReference: {
          artifactId: 6,
          filename: "demo.html",
          previewType: "html",
        },
      },
      {
        id: "message-4-text",
        role: "assistant",
        content: "制品已生成：notes.txt",
        artifactReference: {
          artifactId: 7,
          filename: "notes.txt",
          previewType: "plaintext",
        },
      },
      {
        id: "message-4-image",
        role: "assistant",
        content: "制品已生成：diagram.png",
        artifactReference: {
          artifactId: 8,
          filename: "diagram.png",
          previewType: "image",
        },
      },
      {
        id: "message-4-pdf",
        role: "assistant",
        content: "制品已生成：report.pdf",
        artifactReference: {
          artifactId: 9,
          filename: "report.pdf",
          previewType: "pdf",
        },
      },
      {
        id: "message-5",
        role: "assistant",
        content: "工具调用：search.web 已完成",
        toolCall: {
          toolName: "search.web",
          status: "completed",
          safeInput: {
            query: "Minimalist Agent WorkBuddy patterns",
          },
          safeOutput: {
            summary: "search.web 已完成。",
          },
          provenance: {
            gateway: "agent_tool_gateway",
            provider: "mock",
          },
        },
      },
      {
        id: "message-6",
        role: "assistant",
        content: "制品卡片：artifact_card",
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
        id: "message-7",
        role: "assistant",
        content: "工具结果卡片：tool_result_card",
        card: {
          schema: "tool_result_card",
          payload: {
            tool_name: "doubao_search",
            status: "completed",
            summary: "找到 4 条相关结果。",
          },
        },
      },
      {
        id: "message-8",
        role: "assistant",
        content: "选择卡片：choice_card",
        card: {
          schema: "choice_card",
          payload: {
            prompt: "选择输出格式。",
            options: [
              { id: "brief", label: "简报" },
              { id: "table", label: "表格", description: "结构化对比。" },
            ],
          },
        },
      },
      {
        id: "message-9",
        role: "assistant",
        content: "引用卡片：citation_card",
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
        id: "message-10",
        role: "assistant",
        content: "状态卡片：status_card",
        card: {
          schema: "status_card",
          payload: {
            status: "running",
            title: "读取来源",
            detail: "智能体正在收集证据。",
          },
        },
      },
      {
        id: "message-11",
        role: "assistant",
        content: "表单请求卡片：form_request_card",
        card: {
          schema: "form_request_card",
          payload: {
            title: "需要补充输入",
            fields: [
              { id: "audience", label: "目标用户", type: "text", required: true },
            ],
          },
        },
      },
    ],
  },
  {
    id: "conversation-2",
    title: "竞品分析",
    agentId: "default",
    status: "running",
    updatedAt: "2 分钟前",
    selectedModelId: "openai-gpt-5",
    messages: [
      {
        id: "conversation-2-message-1",
        role: "user",
        content: "对比三个同类产品的对话工作台信息架构。",
      },
      {
        id: "conversation-2-message-2",
        role: "assistant",
        content: "正在整理竞品的会话导航、运行状态和制品预览差异。",
        card: {
          schema: "status_card",
          payload: {
            status: "running",
            title: "分析进行中",
            detail: "智能体正在归纳竞品页面结构。",
          },
        },
      },
    ],
  },
  {
    id: "conversation-3",
    title: "行业报告",
    agentId: "default",
    status: "failed",
    updatedAt: "5 分钟前",
    selectedModelId: "openai-gpt-5",
    runError: "模型网关超时，运行未完成。可重新运行或调整输入。",
    messages: [
      {
        id: "conversation-3-message-1",
        role: "user",
        content: "生成一份行业报告结构和关键数据清单。",
      },
      {
        id: "conversation-3-message-2",
        role: "assistant",
        content: "模型网关超时，运行未完成。可重新运行或调整输入。",
        card: {
          schema: "status_card",
          payload: {
            status: "failed",
            title: "运行失败",
            detail: "模型网关超时，运行未完成。可重新运行或调整输入。",
          },
        },
      },
    ],
  },
  {
    id: "conversation-4",
    title: "品牌简报",
    agentId: "default",
    status: "completed",
    updatedAt: "12 分钟前",
    selectedModelId: "openai-gpt-5",
    completedAt: "12 分钟前",
    messages: [
      {
        id: "conversation-4-message-1",
        role: "user",
        content: "整理品牌定位简报，输出 Markdown 文档。",
      },
      {
        id: "conversation-4-message-2",
        role: "assistant",
        content: "已完成品牌定位简报，并生成可预览制品。",
      },
      {
        id: "conversation-4-message-3",
        role: "assistant",
        content: "制品已生成：brand-brief.md",
        artifactReference: {
          artifactId: 3,
          filename: "brand-brief.md",
          previewType: "markdown",
        },
      },
    ],
  },
  {
    id: "conversation-5",
    title: "资料整理",
    agentId: "default",
    status: "cancelled",
    updatedAt: "8 分钟前",
    selectedModelId: "openai-gpt-5",
    cancelledAt: "8 分钟前",
    messages: [
      {
        id: "conversation-5-message-1",
        role: "user",
        content: "整理上传材料，先输出可复用的中间笔记。",
      },
      {
        id: "conversation-5-message-2",
        role: "assistant",
        content: "运行已停止，已有输出已保留。",
      },
      {
        id: "conversation-5-message-3",
        role: "assistant",
        content: "制品已保留：partial-notes.md",
        artifactReference: {
          artifactId: 4,
          filename: "partial-notes.md",
          previewType: "markdown",
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
  const [commandSearch, setCommandSearch] = useState("");
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [draftAgentId] = useState(workspaceAgents[0].id);
  const [draftModelId, setDraftModelId] = useState(workspaceAgents[0].allowedModels[0].id);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(initialConversations[0]?.title ?? "");
  const [previewArtifactId, setPreviewArtifactId] = useState<number | null>(
    initialConversations[0]?.messages.find((message) => message.artifactReference)?.artifactReference
      ?.artifactId ?? null,
  );
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("artifact");
  const [artifactPanelView, setArtifactPanelView] = useState<ArtifactPanelView>("preview");
  const [isInspectorCollapsed, setIsInspectorCollapsed] = useState(false);
  const [attachmentPreview, setAttachmentPreview] = useState<UploadedAttachmentPreview | null>(null);
  const [copiedArtifactId, setCopiedArtifactId] = useState<number | null>(null);

  const selectedConversation = conversations.find(
    (conversation) => conversation.id === selectedConversationId,
  );
  const activeRunId = selectedConversation
    ? conversations.findIndex((conversation) => conversation.id === selectedConversation.id) + 1
    : null;
  const { lastSeenSequence, status: streamStatus } = useAgentRunStream(activeRunId);
  const activeAgent = getAgent(selectedConversation?.agentId ?? draftAgentId);
  const allowedModels = activeAgent.allowedModels;
  const selectedModelId = selectedConversation?.selectedModelId ?? draftModelId;
  const selectedModelLabel =
    allowedModels.find((model) => model.id === selectedModelId)?.label ?? selectedModelId;
  const selectedToolCalls = useMemo(
    () =>
      selectedConversation?.messages.flatMap((message) =>
        message.toolCall ? [message.toolCall] : [],
      ) ?? [],
    [selectedConversation],
  );
  const processSummaries = useMemo(
    () =>
      selectedConversation?.messages
        .filter((message) => message.role === "assistant" && message.content.startsWith("已建立"))
        .map((message) => message.content) ?? [],
    [selectedConversation],
  );
  const selectedArtifactReferences = useMemo(
    () =>
      selectedConversation?.messages
        .map(getMessageArtifactReference)
        .filter((artifact): artifact is ArtifactReference => Boolean(artifact)) ?? [],
    [selectedConversation],
  );
  const completedArtifactReference =
    selectedConversation?.status === "completed" ? selectedArtifactReferences[0] ?? null : null;
  const retainedArtifactReference =
    selectedConversation?.status === "cancelled" ? selectedArtifactReferences[0] ?? null : null;
  const copilotThreadId = selectedConversation?.id;
  const copilotAttachments = useMemo(
    () => ({
      enabled: true,
      accept: runAttachmentAccept,
      maxSize: 20 * 1024 * 1024,
      onUpload: async (file: File) => {
        setPreviewArtifactId(null);
        await updateAttachmentPreview(file);

        return {
          type: "data" as const,
          value: await readFileAsDataUrl(file),
          mimeType: file.type || "application/octet-stream",
          metadata: { filename: file.name },
        };
      },
      onUploadFailed: ({ message }: { message: string }) => {
        console.warn("[copilotkit attachments]", message);
      },
    }),
    [],
  );
  const selectedArtifactReference =
    previewArtifactId != null
      ? selectedArtifactReferences.find((artifact) => artifact.artifactId === previewArtifactId) ?? null
      : null;
  const visibleConversations = useMemo(
    () =>
      conversations.filter((conversation) =>
        conversation.title.toLowerCase().includes(conversationSearch.toLowerCase()),
      ),
    [conversationSearch, conversations],
  );
  const commandArtifacts = useMemo(() => collectCommandArtifacts(conversations), [conversations]);
  const commandRuns = useMemo(() => collectCommandRuns(conversations), [conversations]);
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
    function openCommandPaletteFromKeyboard(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setIsCommandPaletteOpen(true);
      }
    }

    window.addEventListener("keydown", openCommandPaletteFromKeyboard);
    return () => window.removeEventListener("keydown", openCommandPaletteFromKeyboard);
  }, []);

  function startNewConversation() {
    setSelectedConversationId(null);
    setIsRenaming(false);
    setRenameValue("未命名对话");
    setPreviewArtifactId(null);
    setInspectorTab("artifact");
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
    setPreviewArtifactId(
      conversation?.messages.find((message) => message.artifactReference)?.artifactReference
        ?.artifactId ?? null,
    );
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
    setInspectorTab("run");
    setIsInspectorCollapsed(false);
    closeCommandPalette();
  }

  function closeCommandPalette() {
    setCommandSearch("");
    setIsCommandPaletteOpen(false);
  }

  function openArtifactPreview(artifactId: number) {
    setPreviewArtifactId(artifactId);
    setInspectorTab("artifact");
    setArtifactPanelView("preview");
    setIsInspectorCollapsed(false);
  }

  function removeAttachmentPreview() {
    setAttachmentPreview(null);
    setPreviewArtifactId(null);
  }

  async function copyArtifactPreview(reference: ArtifactReference) {
    const content = getArtifactPreviewContent(reference);
    try {
      await navigator.clipboard?.writeText(content);
    } finally {
      setCopiedArtifactId(reference.artifactId);
    }
  }

  async function uploadContextAttachment(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    setPreviewArtifactId(null);
    await updateAttachmentPreview(file);
    input.value = "";
  }

  async function updateAttachmentPreview(file: File) {
    const preview = createAttachmentPreview(file);
    setInspectorTab("artifact");
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
          ? { ...conversation, title: nextTitle, updatedAt: "刚刚" }
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
    setRenameValue(remainingConversations[0]?.title ?? "未命名对话");
    setIsRenaming(false);
  }

  return (
    <main className={isInspectorCollapsed ? "app-shell inspector-collapsed" : "app-shell"}>
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
        setIsRenaming={setIsRenaming}
        setPreviewArtifactId={setPreviewArtifactId}
        setRenameValue={setRenameValue}
        setSelectedConversationId={setSelectedConversationId}
        streamStatus={streamStatus}
      />
      <aside className="conversation-sidebar" aria-label="智能体会话">
        <div className="brand-block">
          <a className="brand-link" href="/app/conversations" aria-label="Minimalist Agent 首页">
            <span className="brand-mark" aria-hidden="true">
              <img className="brand-logo" src="/brand-mark.svg" alt="" />
            </span>
            <h1 id="app-title">Minimalist Agent</h1>
          </a>
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
        <nav className="workspace-nav" aria-label="工作台导航">
          <a className="workspace-nav-item active" href="/app/conversations">会话</a>
          <a className="workspace-nav-item" href="/admin/run-audit">运行审计</a>
          <a className="workspace-nav-item" href="/admin">管理员控制台</a>
        </nav>
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
              const conversationAgent = getAgent(conversation.agentId);

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
        <footer className="conversation-sidebar-footer">
          <a className="user-pill" href="/account-settings">
            <span className="brand-mark">oil</span>
            <span>oil</span>
          </a>
          <a className="secondary-button full-width" href="/admin">管理员控制台</a>
        </footer>
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
              disabled={!selectedConversation || selectedConversation.status !== "running"}
              type="button"
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
              className="secondary-button"
              type="button"
              onClick={() => setIsInspectorCollapsed((isCollapsed) => !isCollapsed)}
            >
              {isInspectorCollapsed ? "展开检查面板" : "收起检查面板"}
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

        <section className="copilot-chat-panel" aria-label="对话消息">
          <Card className="stream-banner" role="status" aria-live="polite">
            <span>AG-UI：{streamStatus === "connected" ? "已连接" : "空闲"}</span>
            <span>{selectedConversation ? `Run ${activeRunId ?? 0}` : "无运行"}</span>
            <span>{formatRunActivity(lastSeenSequence)}</span>
          </Card>
          <section className="conversation-transcript" aria-label="消息记录">
            {selectedConversation ? (
              selectedConversation.messages.map((message) => (
                <article className={`message-row ${message.role}`} key={message.id}>
                  <span className="message-role">
                    {message.role === "user" ? "你" : activeAgent.name}
                  </span>
                  {hasPlainMessageContent(message) ? (
                    <p className="message-content">{message.content}</p>
                  ) : null}
                  {message.artifactReference ? (
                    <ArtifactReferenceCard
                      isActive={message.artifactReference.artifactId === previewArtifactId}
                      reference={message.artifactReference}
                      onOpen={openArtifactPreview}
                    />
                  ) : null}
                  {message.toolCall ? <ToolCallView toolCall={message.toolCall} /> : null}
                  {message.card ? (
                    <ConversationCardView
                      card={message.card}
                      onOpenArtifact={openArtifactPreview}
                    />
                  ) : null}
                </article>
              ))
            ) : (
              <div className="draft-state">
                <h3>开始一个新对话</h3>
                <p>输入问题或添加上下文附件，发送后创建 Agent Conversation。</p>
              </div>
            )}
          </section>
          <section className="conversation-composer" aria-label="对话输入区">
            <div className="composer-model-row">
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
              <div className="composer-context-actions">
                <label className="context-upload-control">
                  <Paperclip aria-hidden="true" />
                  <span>添加上下文</span>
                  <input
                    aria-label="添加上下文"
                    accept={runAttachmentAccept}
                    type="file"
                    onChange={uploadContextAttachment}
                  />
                </label>
                <Badge variant="secondary">能力边界由管理员策略决定</Badge>
              </div>
            </div>
            {attachmentPreview ? (
              <section className="composer-attachment-list" aria-label="已添加上下文附件">
                <div className="composer-attachment-chip">
                  <Paperclip aria-hidden="true" />
                  <span className="composer-attachment-meta">
                    <strong>{attachmentPreview.filename}</strong>
                    <span>{attachmentPreview.previewType}</span>
                  </span>
                  <Button
                    aria-label={`移除附件 ${attachmentPreview.filename}`}
                    className="attachment-remove-button"
                    type="button"
                    onClick={removeAttachmentPreview}
                  >
                    <X aria-hidden="true" />
                  </Button>
                </div>
              </section>
            ) : null}
            <CopilotChat
              agentId={activeAgent.id}
              attachments={copilotAttachments}
              className="embedded-copilot-chat"
              labels={copilotChatLabels}
              threadId={copilotThreadId}
            />
          </section>
        </section>
      </section>

      {isInspectorCollapsed ? null : (
        <aside className="artifact-inspector" aria-label="检查面板">
          <Card className="app-panel preview-panel inspector-panel">
            <CardHeader className="inspector-header">
              <div>
                <p className="eyebrow">检查面板</p>
                <h2 id="artifact-preview-title">
                  {inspectorTab === "artifact" ? "制品" : inspectorTab === "run" ? "运行" : "工具"}
                </h2>
              </div>
              <div className="inspector-actions">
                <Badge variant="outline">只读</Badge>
                {inspectorTab === "artifact" ? (
                  <Button
                    className="artifact-tab"
                    disabled={!selectedArtifactReference}
                    type="button"
                    onClick={() => setPreviewArtifactId(null)}
                  >
                    关闭预览
                  </Button>
                ) : null}
              </div>
            </CardHeader>
            <div className="inspector-tab-list" role="tablist" aria-label="检查面板分组">
              <button
                aria-controls="inspector-panel-artifact"
                aria-selected={inspectorTab === "artifact"}
                className={inspectorTab === "artifact" ? "inspector-tab active" : "inspector-tab"}
                id="inspector-tab-artifact"
                role="tab"
                type="button"
                onClick={() => setInspectorTab("artifact")}
              >
                制品
              </button>
              <button
                aria-controls="inspector-panel-run"
                aria-selected={inspectorTab === "run"}
                className={inspectorTab === "run" ? "inspector-tab active" : "inspector-tab"}
                id="inspector-tab-run"
                role="tab"
                type="button"
                onClick={() => setInspectorTab("run")}
              >
                运行
              </button>
              <button
                aria-controls="inspector-panel-tools"
                aria-selected={inspectorTab === "tools"}
                className={inspectorTab === "tools" ? "inspector-tab active" : "inspector-tab"}
                id="inspector-tab-tools"
                role="tab"
                type="button"
                onClick={() => setInspectorTab("tools")}
              >
                工具
              </button>
            </div>
            {inspectorTab === "artifact" ? (
              <CardContent
                aria-label="制品预览"
                className="flex flex-col gap-4"
                id="inspector-panel-artifact"
                role="tabpanel"
                aria-labelledby="inspector-tab-artifact"
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
                    disabled={!selectedArtifactReference}
                    type="button"
                    onClick={() => setArtifactPanelView("metadata")}
                  >
                    元数据
                  </Button>
                </div>
                <div className="preview-surface" role="presentation">
                  {selectedArtifactReference && artifactPanelView === "metadata" ? (
                    <ArtifactMetadataView
                      conversationTitle={selectedConversation?.title ?? "未命名对话"}
                      reference={selectedArtifactReference}
                    />
                  ) : selectedArtifactReference ? (
                    <GeneratedArtifactPreview
                      copiedArtifactId={copiedArtifactId}
                      reference={selectedArtifactReference}
                      onCopy={copyArtifactPreview}
                    />
                  ) : attachmentPreview ? (
                    <AttachmentPreview preview={attachmentPreview} />
                  ) : (
                    <p className="preview-text">打开制品或在对话中添加文件后在此预览。</p>
                  )}
                </div>
              </CardContent>
            ) : null}
            {inspectorTab === "run" ? (
              <CardContent
                aria-label="运行上下文"
                className="flex flex-col gap-3"
                id="inspector-panel-run"
                role="tabpanel"
                aria-labelledby="inspector-tab-run"
              >
                <div className="context-row">
                  <span>AG-UI</span>
                  <strong>{streamStatus === "connected" ? "已连接" : "空闲"}</strong>
                </div>
                <div className="context-row">
                  <span>Run</span>
                  <strong>{activeRunId ?? "无"}</strong>
                </div>
                <div className="context-row">
                  <span>运行状态</span>
                  <strong>{selectedConversation ? formatConversationStatus(selectedConversation.status) : "未开始"}</strong>
                </div>
                <div className="context-row">
                  <span>最近活动</span>
                  <strong>{formatRecentRunActivity(lastSeenSequence)}</strong>
                </div>
                {selectedConversation?.status === "completed" ? (
                  <div className="context-row">
                    <span>完成时间</span>
                    <strong>{selectedConversation.completedAt ?? selectedConversation.updatedAt}</strong>
                  </div>
                ) : null}
                {selectedConversation?.status === "cancelled" ? (
                  <div className="context-row">
                    <span>停止时间</span>
                    <strong>{selectedConversation.cancelledAt ?? selectedConversation.updatedAt}</strong>
                  </div>
                ) : null}
                <div className="context-row">
                  <span>智能体 / 模型</span>
                  <strong>{activeAgent.name} · {selectedModelLabel}</strong>
                </div>
                <div className="context-row">
                  <span>策略</span>
                  <strong>后端治理</strong>
                </div>
                <div className="context-row">
                  <span>附件</span>
                  <strong>{attachmentPreview ? attachmentPreview.filename : "无"}</strong>
                </div>
                <section className="run-detail-block" aria-label="过程摘要">
                  <h3>过程摘要</h3>
                  {processSummaries.length > 0 ? (
                    processSummaries.map((summary) => (
                      <p className="run-summary-text" key={summary}>{summary}</p>
                    ))
                  ) : (
                    <p className="run-summary-text">当前运行还没有可见过程摘要。</p>
                  )}
                </section>
                {selectedConversation?.status === "failed" ? (
                  <section className="run-detail-block failed-run-block" aria-label="失败恢复">
                    <h3>失败恢复</h3>
                    <p className="run-summary-text">{selectedConversation.runError}</p>
                    <Button className="secondary-button" type="button">
                      重新运行
                    </Button>
                  </section>
                ) : null}
                {completedArtifactReference ? (
                  <section className="run-detail-block" aria-label="完成输出">
                    <h3>完成输出</h3>
                    <p className="run-summary-text">运行已完成，可直接打开生成制品继续检查或追问。</p>
                    <Button
                      className="secondary-button"
                      type="button"
                      onClick={() => openArtifactPreview(completedArtifactReference.artifactId)}
                    >
                      打开完成制品 {completedArtifactReference.filename}
                    </Button>
                  </section>
                ) : null}
                {retainedArtifactReference ? (
                  <section className="run-detail-block" aria-label="已保留输出">
                    <h3>已保留输出</h3>
                    <p className="run-summary-text">运行已停止，已有输出已保留。</p>
                    <Button
                      className="secondary-button"
                      type="button"
                      onClick={() => openArtifactPreview(retainedArtifactReference.artifactId)}
                    >
                      打开保留制品 {retainedArtifactReference.filename}
                    </Button>
                  </section>
                ) : null}
                <section className="run-detail-block" aria-label="能力快照">
                  <h3>能力快照</h3>
                  <div className="capability-snapshot-list">
                    <span>{formatCapabilitySnapshot("Search", activeAgent.capabilitySnapshot.search)}</span>
                    <span>{formatCapabilitySnapshot("Sandbox", activeAgent.capabilitySnapshot.sandbox)}</span>
                    <span>MCP：{activeAgent.capabilitySnapshot.mcpServerCount} 个服务器</span>
                  </div>
                  <p className="capability-policy-note">由管理员策略控制</p>
                </section>
              </CardContent>
            ) : null}
            {inspectorTab === "tools" ? (
              <CardContent
                aria-label="工具调用"
                className="flex flex-col gap-3"
                id="inspector-panel-tools"
                role="tabpanel"
                aria-labelledby="inspector-tab-tools"
              >
                {selectedToolCalls.length > 0 ? (
                  selectedToolCalls.map((toolCall, index) => (
                    <article className="tool-inspector-card" key={`${toolCall.toolName}-${index}`}>
                      <div className="tool-inspector-head">
                        <strong>{toolCall.toolName}</strong>
                        <span className={`tool-call-status ${toolCall.status}`}>
                          {formatToolCallStatus(toolCall.status)}
                        </span>
                      </div>
                      <p className="preview-text">{formatSafeInputSummary(toolCall.safeInput)}</p>
                      {toolCall.safeOutput?.summary ? (
                        <p className="tool-call-meta">输出：{String(toolCall.safeOutput.summary)}</p>
                      ) : null}
                      <p className="tool-call-meta">
                        网关：{toolCall.provenance.gateway} · 提供方：{toolCall.provenance.provider}
                      </p>
                    </article>
                  ))
                ) : (
                  <p className="empty-state">当前对话暂无工具调用。</p>
                )}
              </CardContent>
            ) : null}
          </Card>
        </aside>
      )}
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

function getAgent(agentId: string): WorkspaceAgent {
  return workspaceAgents.find((agent) => agent.id === agentId) ?? workspaceAgents[0];
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

function collectCommandRuns(conversations: Conversation[]): CommandRun[] {
  return conversations.map((conversation, index) => ({
    conversationId: conversation.id,
    conversationTitle: conversation.title,
    runId: index + 1,
    status: conversation.status,
    updatedAt: conversation.updatedAt,
  }));
}

function hasPlainMessageContent(message: ConversationMessage) {
  return !message.artifactReference && !message.toolCall && !message.card;
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

function ArtifactReferenceCard({
  isActive,
  onOpen,
  reference,
}: {
  isActive: boolean;
  onOpen: (artifactId: number) => void;
  reference: ArtifactReference;
}) {
  return (
    <Button
      aria-label={`打开制品 ${reference.filename}`}
      className={isActive ? "artifact-reference-card active" : "artifact-reference-card"}
      type="button"
      onClick={() => onOpen(reference.artifactId)}
    >
      <span className="artifact-reference-icon" aria-hidden="true">
        {formatArtifactType(reference.previewType)}
      </span>
      <span className="artifact-reference-body">
        <strong>{reference.filename}</strong>
        <span>刚刚生成 · 点击预览</span>
      </span>
      <span className="artifact-reference-thumb" aria-hidden="true">
        # 简报
      </span>
    </Button>
  );
}

function ArtifactMetadataView({
  conversationTitle,
  reference,
}: {
  conversationTitle: string;
  reference: ArtifactReference;
}) {
  const content = getArtifactPreviewContent(reference);
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
  reference,
}: {
  copiedArtifactId: number | null;
  onCopy: (reference: ArtifactReference) => void;
  reference: ArtifactReference;
}) {
  const content = getArtifactPreviewContent(reference);

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
            href={`/artifacts/${reference.artifactId}/preview`}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink aria-hidden="true" />
            <span>打开</span>
          </a>
        </div>
      </div>
      {reference.previewType === "markdown" ? (
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

function getArtifactPreviewContent(reference: ArtifactReference) {
  switch (reference.artifactId) {
    case 1:
      return "# 简报\n\nalpha";
    case 2:
      return JSON.stringify({ coverage: 82, latency_ms: 184, sources: 4 }, null, 2);
    case 3:
      return "# 品牌简报\n\n定位：面向团队的 Agent 对话工作台。";
    case 4:
      return "# 中间笔记\n\n已保留的中间输出：材料索引、摘要和待确认问题。";
    case 5:
      return "export function summarize(items: string[]) {\n  return items.length;\n}\n";
    case 6:
      return "<!doctype html><html><body><main><h1>Agent Workspace Demo</h1><p>Sandboxed preview.</p></main></body></html>";
    case 7:
      return "调研笔记\n\n保留给下一轮追问的上下文。";
    case 8:
      return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";
    case 9:
      return "data:application/pdf;base64,JVBERi0xLjEKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCAyMDAgMjAwXSA+PgplbmRvYmoKeHJlZgowIDQKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDA5IDAwMDAwIG4gCjAwMDAwMDAwNTggMDAwMDAgbiAKMDAwMDAwMDExNSAwMDAwMCBuIAp0cmFpbGVyCjw8IC9TaXplIDQgL1Jvb3QgMSAwIFIgPj4Kc3RhcnR4cmVmCjE4OQolJUVPRgo=";
    default:
      return "# 摘要\n\n制品正文保留在对象存储。";
  }
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

function formatArtifactType(previewType: string) {
  switch (previewType) {
    case "markdown":
      return "MD";
    case "json":
      return "JSON";
    case "pdf":
      return "PDF";
    case "image":
      return "IMG";
    case "code":
      return "CODE";
    case "html":
      return "HTML";
    case "plaintext":
      return "TXT";
    default:
      return "FILE";
  }
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
