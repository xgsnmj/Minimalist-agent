# 对话工作台重构设计文档

调研日期：2026-07-04  
调研对象：豆包 `https://www.doubao.com/chat/` 登录态对话页  
适用页面：Minimalist Agent 的 Conversation Workspace

## 目标

将当前对话页面重构为 agent 对话工作台，而不是宣传页、首页或普通聊天页。

成功标准：

- 登录后第一屏直接进入可工作的 Agent Conversation Workspace。
- 用户能快速创建、继续、搜索 Agent Conversation，并发起 Agent Run。
- 用户能在发送前看清模型、附件、运行状态和可用能力边界。
- 长时间运行的过程、工具调用、附件和 Artifact 不淹没在聊天气泡里，而能被稳定检查。
- 不违反现有 MVP 约束：用户不能在 composer 中启停 Search、Sandbox、MCP 等工具能力，能力由 Administrator 的 Agent Capability Policy 决定。

本轮确认的产品边界：

- 左侧 sidebar 只保留“新对话”，不设计“新任务”或“新办公任务”，因为当前系统没有任务概念。
- 当前版本不展示推荐 chip，避免把工作台做成提示词广场。
- Composer 的发送前选择收敛为系统已配置、且被当前策略允许的 provider/model；不增加独立的中部运行配置区。
- Search、Sandbox、MCP 等能力只读展示，不提供用户侧开关。
- Artifact 必须作为消息流中的文件/制品卡片出现；点击后右侧预览打开，对话区和 composer 继续保留。

## 豆包真实页面调研记录

### 整体结构

豆包对话页是典型工作台结构：

- 左侧固定 sidebar：搜索、新对话、办公任务、AI 创作、云盘、更多、历史对话、账号入口。
- 中央主画布：顶部对话标题，中间欢迎语和推荐问题，底部固定输入框。
- 右上轻操作：自动播报、分享等低频动作。
- 输入框是页面核心，不只是文本框，还承载附件、模式、技能、语音和发送。

可迁移判断：Minimalist Agent 应采用这种“左侧会话导航 + 中央对话画布 + 底部 composer + 右侧检查面板”的工作台结构，但不迁移豆包的消费级内容入口、娱乐型能力和“新任务”概念。

### 左侧 sidebar

豆包左侧包含：

- 顶部搜索框，显示快捷键 `⌘ K`。
- 品牌/主智能体入口。
- “新对话”，显示快捷键 `⇧ ⌘ K`。
- “新办公任务”，用于进入 agent 任务模式。
- “AI 创作”“云盘”等能力页面。
- “更多/收起”，展开后出现“发现智能体”。
- 历史对话列表。
- 底部账号入口。

设计启发：

- 搜索应是全局命令面板，不只是筛选左侧列表。
- “新对话”应该是一等入口；当前产品没有任务概念，不单独设计“新任务”。
- 历史对话要保留在 sidebar 内，适合长时间运行后的恢复。
- 低频能力可折叠，避免把工作台变成入口集合。

### 搜索命令面板

点击豆包搜索后出现居中浮层：

- 顶部搜索输入。
- “快捷创建”区域，至少包含新对话。
- “最近对话”区域。
- 背景遮罩保留当前工作台上下文。

设计启发：

- Minimalist Agent 应提供 `⌘ K` 命令面板，优先支持搜索对话、创建新对话、跳转最近 Agent Run 或 Artifact。
- 命令面板不替代 sidebar，它解决键盘用户和高频跳转。

### 中央对话画布

豆包新对话空态包含：

- 顶部标题：“新对话”。
- 标题下方风险提示：“AI 生成可能有误 请核实”。
- 中部问候语：“有什么我能帮你的吗？”。
- 多行推荐问题 chip，点击即可填入/发起对话。

设计启发：

- Empty state 不要做营销文案，应服务对话启动。
- 当前版本暂不设计推荐 chip，避免把首屏做成提示词广场；后续如需要，可按当前模型或 Agent 能力生成少量建议。
- 风险提示应短、稳定、低干扰。

### 底部 composer

豆包 composer 的可见结构：

- 第一行是大 textarea，placeholder 为“发消息...”。
- 左侧 `+` 附件入口。
- 能力工具条：快速、图像生成、帮我写作、音乐生成、AI 播客、录音转写、更多。
- 右侧语音按钮和发送按钮。
- `+` 菜单包含“选择云盘文件”“上传文件或图片”。
- “更多”菜单包含视频生成、深入研究、PPT 生成、解题答疑、AI 表格。

设计启发：

- 附件入口应该专门承载上下文素材，和工具能力分开。
- composer 可以展示“可用能力”，但 Minimalist Agent 中这些能力必须是系统配置和 Agent policy 的只读结果，不允许用户临时开启或关闭。
- 低频能力放入更多菜单，避免 composer 横向拥挤。

### 运行模式

豆包“快速”菜单包含：

- 快速：适用于大部分情况。
- 专家：研究级专业问答。
- 办公任务：执行 agent 任务。

设计启发：

- 发送前的“运行方式”选择很重要，但 Minimalist Agent 不应复制消费级模式名。
- 当前版本应把它收敛为模型选择：展示系统中已配置、且当前 Agent 或默认工作台允许使用的 provider/model。
- 已有会话继续使用当前模型；如果允许切换模型，也必须来自系统已配置的 provider/model 列表。

### 办公任务模式

点击“新办公任务”后，豆包页面变化为：

- 标题变为“新办公任务”。
- 推荐 chip 从问答变成可执行产物，例如画板、App 图标、飞书文档、表格、HTML、PPT、旅行攻略。
- composer 工具条变为“办公任务 / 本地电脑 / 技能”。
- “本地电脑”弹出下载电脑端引导，说明可整理桌面文件、查找并下载 PDF、处理本地文档。
- “技能”弹出分类列表：文档、表格、PPT、创意设计、可视化、创建技能。

设计启发：

- 当前 Minimalist Agent 不引入“办公任务”或“新任务”入口；这部分仅作为豆包能力分层参考。
- 本地电脑能力对应 Minimalist Agent 的 Sandbox Capability 或本地运行环境状态，应在右侧 inspector 或 composer 附近只读展示。
- 技能选择对应 Agent 可用能力分类，但 MVP 不做用户自选工具开关。

### 生成文件与预览

在实际对话页中，豆包的生成文件不是普通链接，而是对话流内的文件卡片：

- 文件卡片出现在 Agent 回复正文下方。
- 卡片左侧显示文件图标、文件标题和创建时间。
- 卡片右侧显示文档缩略预览。
- 点击文件卡片后不离开当前对话 URL。
- 页面进入左右分屏：左侧对话区被压缩为窄列，右侧打开文档预览区。
- 左侧对话仍保留当前消息、文件卡片、追问建议和 composer，用户能边看制品边继续追问。
- 右侧预览区以 aside 形式占据主要宽度，直接渲染文档内容。
- 预览顶部有独立操作栏，显示修改时间，并提供复制、下载、分享等操作。
- 右上角提供关闭入口，关闭后可回到普通对话布局。

设计启发：

- 生成文件应该作为 Artifact Reference 内嵌在消息流中，而不是只出现在右侧面板或下载列表。
- 点击 Artifact Reference 后，工作台应进入“对话 + Artifact Preview”的分屏状态。
- Artifact Preview 需要有自己的顶部工具栏，展示更新时间、复制、下载、打开独立预览等操作。
- 对话上下文不能在预览时消失；用户应能基于当前 Artifact 继续提问、要求修改或生成派生版本。
- 对于 Markdown、文档、HTML、表格等可阅读产物，优先做内联渲染预览，而不是只展示文件元信息。

## Minimalist Agent 设计定位

页面定位：

- 这是 Agent Conversation Workspace。
- 不是营销首页。
- 不是消费级 AI 创作入口合集。
- 不是 Administrator Console。

用户进入页面后第一件事应该是继续一个 Agent Conversation 或创建一个新对话，而不是阅读产品介绍。

核心对象关系：

- Agent Conversation 是线程容器。
- Agent Run 是一次执行。
- Run Attachment 是临时上下文。
- Tool Call 是后端授权能力调用记录。
- Artifact 是可检查、可下载、可引用的产物。
- Process Summary 是用户可见过程说明，不是隐藏链路。

## 信息架构

### 桌面端布局

| 区域 | 建议宽度 | 作用 |
| --- | --- | --- |
| 左侧 sidebar | 280px | 会话导航、全局搜索、新建入口、账号入口 |
| 中央 workspace | 自适应，最大内容宽 880px | 标题、消息流、运行状态、composer |
| 右侧 inspector | 360px，可收起 | Artifact Preview、Run Context、Tool Calls、Process Summary |

桌面端默认三栏。右侧 inspector 可收起，但不应被完全删除，因为长时间运行和 Artifact 检查需要独立区域。

### 左侧 sidebar 设计

顶部：

- 搜索按钮：文案“搜索对话、运行或制品”，右侧显示 `⌘ K`。
- 主导航：对话工作台。
- 新对话按钮。

中部：

- 最近对话列表。
- 每个列表项展示：标题、Agent 名称、运行状态、更新时间。
- running 状态需要有轻量 live indicator。
- failed/cancelled 状态使用低饱和 warning，不抢主区域注意力。

底部：

- 用户账号入口。
- Administrator 可见“管理控制台”入口。

不建议：

- 不做“发现智能体”市场。
- 不做公开评分、分类发现、模板商店。
- 不在 sidebar 放大量管理员入口。

### 全局命令面板

触发：

- 点击搜索。
- `⌘ K`。

内容：

- 搜索输入。
- 快捷创建：新对话。
- 最近对话。
- 最近 Artifact。
- 可选：跳转 Administrator Console，仅管理员可见。

空态：

- 无搜索结果时提示“没有匹配的对话或制品”。

### Conversation header

新会话：

- 标题：新对话。
- 副标题：发送第一条消息后创建 Agent Conversation。
- 模型选择放在 composer 内，不在 header 重复放置。

已有会话：

- 标题：Conversation title，可重命名。
- 元信息：Agent、Model、Run status、最后更新时间。
- 操作：重命名、删除、停止运行、展开/收起 inspector。
- 当前版本不在对话页暴露 Agent 切换。

连接状态：

- AG-UI SSE connected/reconnecting/unavailable 用小状态点展示。
- 不展示内部 URL、sequence 等技术细节给普通用户。

### 中央消息流

消息类型：

- User message。
- Agent response。
- Process Summary。
- Tool Call summary。
- Artifact Reference。
- Card Rendering。
- Error / failed / cancelled 状态消息。

运行态：

- queued：显示“等待运行”。
- running：显示当前阶段、最近工具调用、停止按钮。
- completed：显示完成时间和 Artifact 快捷入口。
- failed：显示可理解错误和重试入口。
- cancelled：显示已停止，并保留已有输出。

空态：

- 问候语使用工作台语言，例如“开始一个新对话”。
- 当前版本不展示推荐 chip；空态保持克制，只提示用户输入问题或上传附件。

### Composer

基础结构：

- 多行 textarea。
- 左侧附件按钮。
- 模型选择控件。
- 右侧发送/停止按钮。

模型选择：

- 新会话：允许选择系统中已配置、且当前 Agent policy 允许的 provider/model。
- 已有会话：展示当前模型；是否允许切换按后端策略决定。
- 模型选项展示 provider 和 model label，例如 `OpenAI / GPT-5`、`Doubao / Seed`。
- 能力边界不作为 composer 中部配置；如需展示，放在右侧 inspector 的运行面板中只读说明，不提供用户侧开关。

附件：

- 入口文案：添加上下文。
- 支持 Run Attachments：图片、PDF、文本、Markdown、CSV、JSON、代码文件。
- 附件上传后在 composer 上方形成文件 chip，可移除。
- 附件是临时工作上下文，不叫知识库、不叫项目文件。

发送/停止：

- 空消息不可发送。
- 当前 conversation 有 active run 时，发送按钮变为停止按钮。
- 一个 conversation 同时只允许一个 active Agent Run。

不做：

- 不提供“启用搜索”“启用沙盒”“启用 MCP”这类用户侧工具开关。
- 不把娱乐型入口放进 MVP composer，例如音乐、播客、视频生成。

### 右侧 inspector

默认 tabs：

- 制品：Artifact Preview。
- 运行：Run Context、Run status、Process Summary。
- 工具：Tool Calls、能力来源、safe input/output。

制品面板：

- 展示文件名、类型、大小、创建时间。
- 支持预览 Markdown、plain text、image、PDF、code、JSON/table-like data、sandboxed HTML。
- 顶部工具栏展示更新时间或生成时间。
- 顶部工具栏提供复制、下载、打开独立预览等操作。
- Artifact 从消息流卡片打开时，中央对话区应保持可见并压缩，右侧 inspector 承载预览。
- Artifact Reference 卡片自身展示文件图标、文件名、生成/创建时间、预览缩略图或类型标识。
- Markdown 和文档类 Artifact 默认渲染成可阅读版式，不只显示源码。
- 关闭预览后回到普通 conversation 布局，保留当前滚动位置。

运行面板：

- 当前 Run 状态。
- Agent、Model、Run Capability Snapshot 摘要。
- 已上传 Run Attachments。
- AG-UI 连接状态。

工具面板：

- Tool Call 列表按时间排序。
- 展示 tool name、status、safe input summary、safe output summary、provenance。
- 不展示 raw credentials。
- Full Trace 仅管理员通过 Run Audit 查看。

## 视觉与交互原则

整体风格：

- 白底、近黑文字、细边框、低饱和强调色。
- 工作台密度适中，避免 marketing hero、渐变大背景、装饰卡片。
- 卡片只用于列表项、浮层、Artifact 预览，不把页面区块套成卡片。

尺寸建议：

- sidebar：280px。
- header：56px。
- composer 最大宽度：840px。
- composer 圆角：16px 或 20px，避免过度胶囊化。
- inspector：360px。
- 主内容左右 padding：24px。

交互细节：

- Hover 显示会话更多操作，但不要导致列表宽度跳动。
- 长标题单行省略，hover 或详情区展示全名。
- 当前版本不展示推荐 chip。
- composer 内模型选择和附件控件在窄宽度下折叠为图标或菜单。
- 所有 icon button 要有 tooltip。

## 与现有文档/ADR 的关系

本设计遵循：

- `docs/adr/0024-conversation-list-before-projects.md`
- `docs/adr/0025-user-model-selection-within-agent-policy.md`
- `docs/adr/0026-no-user-tool-toggles-in-mvp.md`
- `docs/adr/0027-run-attachments.md`
- `docs/adr/0032-lightweight-agent-selection.md`
- `docs/adr/0035-background-agent-runs.md`
- `docs/adr/0036-persistent-run-event-log-and-stream-resume.md`
- `docs/adr/0044-production-workbench-interface-principles.md`

如果后续实现与本文档冲突，以 ADR 为准。

## 建议实现切片

1. 重排页面骨架：三栏布局、顶部 header、底部 composer、右侧 inspector。
2. 重做 sidebar：搜索入口、新建入口、最近对话列表、账号/管理入口。
3. 重做 composer：textarea、附件 chip、provider/model 选择、发送/停止。
4. 重做消息流：明确 User、Agent、Process Summary、Tool Call、Artifact Reference。
5. 重做 inspector：制品、运行、工具三个 tab。
6. 增加命令面板：搜索对话、快捷创建、最近制品。

首个可验收版本只需要覆盖文本输入、provider/model 选择、Run Attachment、运行状态、Artifact Preview；推荐 chip、语音、图片生成、技能市场、云盘和本地电脑下载引导不进入 MVP。
