import { FormEvent, useMemo, useState } from "react";
import { CopilotChat } from "@copilotkit/react-core/v2";

import {
  AttachmentPreview,
  createAttachmentPreview,
  normalizeAttachmentPreviewText,
  readFileAsDataUrl,
  type UploadedAttachmentPreview,
} from "../../shared/attachment-preview";
import { useAgentRunStream } from "../../shared/ag-ui-stream";
import {
  type ConversationToolCall,
} from "../../shared/conversation-message-rendering";
import { CopilotWorkspaceBridge } from "../../shared/copilotkit-adapter";
import type { ConversationCard } from "../../shared/card-schema-contract";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

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
    name: "默认智能体",
    status: "enabled",
    allowedModels: [{ id: "openai-gpt-5", label: "OpenAI GPT-5" }],
  },
  {
    id: "research",
    name: "研究智能体",
    status: "enabled",
    allowedModels: [
      { id: "doubao-seed", label: "Doubao Seed 1.6" },
      { id: "minimax-m1", label: "MiniMax M1" },
    ],
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
  chatInputPlaceholder: "向当前智能体发送任务",
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
        id: "message-5",
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
        id: "message-6",
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
        id: "message-7",
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
        id: "message-8",
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
        id: "message-9",
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
        id: "message-10",
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
];

export function ConversationShell() {
  const [conversations, setConversations] = useState<Conversation[]>(initialConversations);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(
    initialConversations[0]?.id ?? null,
  );
  const [conversationSearch, setConversationSearch] = useState("");
  const [draftAgentId, setDraftAgentId] = useState(workspaceAgents[0].id);
  const [draftModelId, setDraftModelId] = useState(workspaceAgents[0].allowedModels[0].id);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(initialConversations[0]?.title ?? "");
  const [previewArtifactId, setPreviewArtifactId] = useState<number | null>(
    initialConversations[0]?.messages.find((message) => message.artifactReference)?.artifactReference
      ?.artifactId ?? null,
  );
  const [attachmentPreview, setAttachmentPreview] = useState<UploadedAttachmentPreview | null>(null);

  const selectedConversation = conversations.find(
    (conversation) => conversation.id === selectedConversationId,
  );
  const activeRunId = selectedConversation ? 1 : null;
  const { lastSeenSequence, status: streamStatus } = useAgentRunStream(activeRunId);
  const activeAgent = getAgent(selectedConversation?.agentId ?? draftAgentId);
  const allowedModels = activeAgent.allowedModels;
  const selectedModelId = selectedConversation?.selectedModelId ?? draftModelId;
  const selectedModelLabel =
    allowedModels.find((model) => model.id === selectedModelId)?.label ?? selectedModelId;
  const copilotThreadId = selectedConversation?.id;
  const copilotAttachments = useMemo(
    () => ({
      enabled: true,
      accept: "text/*,application/json,application/pdf,image/*,.md,.csv",
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
    setIsRenaming(false);
    setRenameValue("未命名对话");
    setPreviewArtifactId(null);
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

  function updateDraftAgent(agentId: string) {
    const nextAgent = getAgent(agentId);
    setDraftAgentId(nextAgent.id);
    setDraftModelId(nextAgent.allowedModels[0].id);
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
        setIsRenaming={setIsRenaming}
        setPreviewArtifactId={setPreviewArtifactId}
        setRenameValue={setRenameValue}
        setSelectedConversationId={setSelectedConversationId}
        streamStatus={streamStatus}
      />
      <aside className="conversation-sidebar" aria-label="智能体会话">
        <div className="brand-block">
          <a className="brand-link" href="/app/conversations" aria-label="Minimalist Agent 首页">
            <span className="brand-mark">MA</span>
            <h1 id="app-title">Minimalist Agent</h1>
          </a>
          <p>对话工作台</p>
        </div>
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

        <Card className="runtime-controls" aria-label="运行配置">
          <CardHeader>
            <CardTitle>运行配置</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <label className="flex flex-col gap-2">
              <span>智能体选择</span>
              <Select
                disabled={Boolean(selectedConversation)}
                value={activeAgent.id}
                onValueChange={updateDraftAgent}
              >
                <SelectTrigger>
                  <SelectValue placeholder={activeAgent.name} />
                </SelectTrigger>
                <SelectContent>
                  {workspaceAgents.map((agent) => (
                    <SelectItem key={agent.id} value={agent.id}>
                      {agent.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="flex flex-col gap-2">
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
            <Badge variant="secondary">能力由管理员策略决定</Badge>
          </CardContent>
        </Card>

        <section className="copilot-chat-panel" aria-label="对话消息">
          <Card className="stream-banner" role="status" aria-live="polite">
            <span>AG-UI：{streamStatus === "connected" ? "已连接" : "空闲"}</span>
            <span>{selectedConversation ? `Run ${activeRunId ?? 0}` : "无运行"}</span>
            <span>{lastSeenSequence > 0 ? `事件 ${lastSeenSequence}` : "事件 0"}</span>
          </Card>
          <div className="copilot-chat-frame" aria-label="CopilotKit 对话面板">
            <CopilotChat
              agentId={activeAgent.id}
              attachments={copilotAttachments}
              className="embedded-copilot-chat"
              labels={copilotChatLabels}
              threadId={copilotThreadId}
            />
          </div>
        </section>
      </section>

      <aside className="artifact-inspector" aria-label="检查面板">
        <Card className="app-panel preview-panel">
          <CardHeader className="inspector-header">
            <div>
              <p className="eyebrow">制品预览</p>
              <h2 id="artifact-preview-title">制品</h2>
            </div>
            <Badge variant="outline">只读</Badge>
          </CardHeader>
          <CardContent className="flex flex-col gap-4" aria-label="制品预览">
            <div className="artifact-actions">
              <Button className="artifact-tab active" type="button">预览</Button>
              <Button className="artifact-tab" type="button">元数据</Button>
            </div>
            <div className="preview-surface" role="presentation">
              {selectedArtifactReference ? (
                <>
                  <p className="preview-label">{selectedArtifactReference.previewType}</p>
                  <h3>{selectedArtifactReference.filename}</h3>
                  <p className="preview-text">
                    {previewArtifactId === selectedArtifactReference.artifactId
                      ? "# 简报\n\nalpha"
                      : "# 摘要\n\n制品正文保留在对象存储。"}
                  </p>
                </>
              ) : attachmentPreview ? (
                <AttachmentPreview preview={attachmentPreview} />
              ) : (
                <p className="preview-text">打开制品或在对话中添加文件后在此预览。</p>
              )}
            </div>
          </CardContent>
        </Card>
        <Card className="app-panel run-context-panel">
          <CardHeader className="inspector-header compact">
            <div>
              <p className="eyebrow">运行上下文</p>
              <h2>运行</h2>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3" aria-label="运行上下文">
            <div className="context-row">
              <span>AG-UI</span>
              <strong>{streamStatus === "connected" ? "已连接" : "空闲"}</strong>
            </div>
            <div className="context-row">
              <span>Run</span>
              <strong>{activeRunId ?? "无"}</strong>
            </div>
            <div className="context-row">
              <span>事件</span>
              <strong>{lastSeenSequence}</strong>
            </div>
            <div className="context-row">
              <span>策略</span>
              <strong>后端治理</strong>
            </div>
          </CardContent>
        </Card>
      </aside>
    </main>
  );
}

function getAgent(agentId: string): WorkspaceAgent {
  return workspaceAgents.find((agent) => agent.id === agentId) ?? workspaceAgents[0];
}

function formatConversationStatus(status: Conversation["status"]) {
  switch (status) {
    case "running":
      return "运行中";
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
