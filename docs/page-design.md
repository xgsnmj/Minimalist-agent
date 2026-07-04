# Minimalist Agent 页面设计文档

本文档把现有产品蓝图、ADR、领域词汇、Open Design 落地原型和当前前端实现整理成页面级设计规范。它用于指导后续前端拆页、视觉重构、接口对接和验收，不替代 `docs/minimalist-agent-mvp.md` 的产品范围说明。

Open Design 原型路径记录在 `docs/open-design-prototype.md`。后续实现 React 页面前，应先对照对应的原型 HTML、CSS、artifact metadata 和 critique notes，再决定是否因 CopilotKit 集成、可访问性、现有 ADR 或工程约束而有意偏离。

## 当前截图为什么是这样

当前登录后的页面效果像脚手架，原因不是浏览器异常，而是前端实现还停留在 MVP scaffold 阶段：

- `apps/web/src/App.tsx` 只导出 `ConversationShell`，当前没有真实路由、登录页、管理员页分离。
- `ConversationShell` 同时承载 Agent Conversation、Artifact Preview、Local Account 注册、Agent Lifecycle、Model Configurations、Run Audit 等多个入口，所以截图会显得信息堆叠。
- 页面数据主要是前端静态演示数据，例如 `Market research`、`Default Agent`、`OpenAI GPT-5`、`Run 1`，用于满足 smoke workflow 和组件合同测试。
- 视觉层只使用 `apps/web/src/styles.css` 中的轻量 CSS，没有接入完整设计系统、图标体系、导航层级和权限态。
- Local Account 在当前 UI 中是右侧 rail 的注册/待审批卡片，还不是完整的登录、注册、审批流页面。
- 原生文件选择器、英文按钮、测试态文案和管理入口同屏展示，说明功能合同已经被放进界面，但产品级信息架构尚未完成。

结论：当前页面符合 MVP 蓝图里“第一屏是可用 Agent Conversation workspace，不做营销首页”的方向，但它还是一个功能原型壳，不是最终登录后工作台视觉方案。

## 设计依据

页面设计必须遵守这些既有决策：

- 单工作区 MVP：不引入组织、租户、项目、空间、文件夹和协作容器。
- 第一层导航对象是 Agent Conversation，不是 Project。
- 登录与注册使用 Local Account；新注册账号必须经过 Administrator 批准。
- 普通 User 的主界面是 WorkBuddy-like Agent Conversation workspace。
- Administrator Console 是治理工作台，不是 BI dashboard。
- Agent Run 是后台执行，可离开页面后继续运行，并通过 AG-UI SSE 恢复事件流。
- 前端 agent 体验层采用 CopilotKit，但 Agent Run、能力策略、工具治理、卡片白名单、审计和 Full Trace 仍由 Minimalist Agent 后端平台负责。
- Tool Call、Process Summary、Card Rendering 和 Artifact Preview 可展示给用户，但不暴露隐藏 chain-of-thought。
- 用户不能在 composer 中启停工具能力；工具和模型能力由 Administrator 按 Agent 管理。
- UI 走自有产品界面，不以 Ant Design 作为主 UI 系统。

## 信息架构

MVP 推荐把当前单组件拆成三组页面：

| 页面组 | 推荐路径 | 用户 | 说明 |
| --- | --- | --- | --- |
| 访问入口 | `/login`、`/register`、`/approval-pending` | 未登录或未批准用户 | Local Account 登录、注册、待审批状态 |
| Conversation Workspace | `/app/conversations`、`/app/conversations/new`、`/app/conversations/:id` | 已批准 User、Administrator | 默认登录后第一屏 |
| Administrator Console | `/admin/*` | Administrator | 账号、Agent、模型、工具、审计治理 |

Artifact Preview 默认是 Conversation Workspace 的右侧检查面板，不作为主导航页面。可在后续支持 `/app/conversations/:id/artifacts/:artifactId` 作为可分享或可恢复的深链接。

## 全局布局原则

产品应该像安静的桌面级工作台，而不是营销站或传统后台首页。

- 主要背景使用低饱和暖灰或中性浅色，内容表面为白色或近白色。
- 左侧导航保持窄而稳定，中心工作区承载主要任务，右侧检查面板用于预览和上下文。
- 不在用户工作台堆放所有管理员入口；管理员能力进入独立 Administrator Console。
- 控制密度适中，按钮文案短，二级信息弱化。
- 对话、工具调用、Artifact、附件和运行状态应该能被快速扫读。
- 常用动作使用图标按钮加 tooltip；危险动作需要二次确认。
- 页面状态必须覆盖 empty、loading、success、error、disabled、pending、running、cancelled。
- 移动端优先保留会话阅读和 composer，侧栏和预览面板转为 drawer 或 bottom sheet。

## 视觉规格

| 项目 | 规范 |
| --- | --- |
| 字体 | 系统无衬线字体；中文界面优先使用系统中文字体回退 |
| 字号 | 页面标题 24-28；区域标题 16-20；正文 14；辅助信息 12 |
| 圆角 | 普通控件 6-8px；不要大面积胶囊卡片化 |
| 间距 | 工作台外边距 16-20；模块内部 12-20；列表项 10-14 |
| 边框 | 使用浅灰细边框区分区域，少用重阴影 |
| 主色 | 用于焦点、选中、链接和运行状态，不应铺满页面 |
| 状态色 | success、warning、danger、info 只用于状态，不作为大面积背景 |
| 动效 | 悬停、选中、streaming message、loading skeleton；避免装饰性动画 |

## 页面 1：Login

### 目标

让已批准的 Local Account 进入 Agent Platform。

### 访问权限

未登录用户可访问。已登录且已批准用户进入 `/app/conversations`；Administrator 可进入同一工作台并拥有 Administrator Console 入口。

### 页面结构

- 左上角品牌：Minimalist Agent。
- 中央登录面板：用户名或邮箱、密码、登录按钮。
- 次级入口：Create Local Account。
- 状态反馈：账号待审批、被拒绝、被禁用、账号或密码错误。

### 交互

- 提交 `POST /auth/login`。
- 成功后保存 access token，调用 `GET /auth/me` 确认状态。
- pending 跳转 `/approval-pending`。
- rejected 或 disabled 留在当前页面并展示明确说明。

### 空态与错误

- 首次进入不显示营销文案，只保持简短说明。
- 登录失败使用 inline error，不弹全局 toast 代替字段错误。
- 密码输入支持显示/隐藏切换。

## 页面 2：Register

### 目标

创建 Local Account，并告知用户需要 Administrator approval。

### 页面结构

- 用户名、邮箱、密码、确认密码。
- Request Access 主按钮。
- 返回 Login 的次级链接。

### 交互

- 提交 `POST /auth/register`。
- 成功后进入 `/approval-pending`。
- 用户名或邮箱重复时在对应字段展示错误。

### 设计重点

注册页不要承诺立即可用。主文案应说明账号创建后需要管理员批准，避免用户把 pending 状态理解成故障。

## 页面 3：Approval Pending

### 目标

解释新 Local Account 当前无法使用工作台的原因。

### 页面结构

- 状态标题：Account pending approval。
- 简短说明：Administrator 批准后才能进入 Agent Platform。
- 操作：Back to login、Refresh status。

### 交互

- Refresh status 调用 `GET /auth/me` 或重新登录检查账号状态。
- 账号被批准后跳转 `/app/conversations`。

## 页面 4：Conversation Workspace

### 目标

这是登录后的默认页面。用户在这里创建、继续、命名、删除 Agent Conversation，并发起 Agent Run。

### 桌面布局

| 区域 | 内容 |
| --- | --- |
| 左侧 sidebar | 品牌、New Conversation、搜索、Recent Conversations、User account、Administrator Console 入口 |
| 中央 workspace | conversation header、message stream、run status、composer |
| 右侧 inspector | Artifact Preview、Run Attachment Preview、Agent/Run context |

### 左侧 sidebar

必需元素：

- New Conversation。
- Search conversations。
- Recent conversation list：标题、Agent 名称、运行状态、更新时间。
- User account/settings 入口。
- Administrator 可见的 Administrator Console 入口。

列表状态：

- empty：还没有 conversation，提示创建第一条。
- filtered empty：搜索无结果。
- running：列表项显示运行中状态。
- deleted：软删除后从列表消失。

### Conversation header

新会话：

- 标题：New conversation。
- 说明：选择 Agent 并发送第一条消息会创建 Agent Conversation。
- Agent Selection 和 Allowed Model Selection 可编辑。

已有会话：

- 标题：conversation title。
- 展示绑定的 Agent、选中模型、最后运行状态。
- Rename、Delete、Stop Run 在合适状态出现。
- 已有会话的 Agent 不可更换；模型按当前 Agent policy 控制。

### Message stream

消息类型：

- User message。
- Agent response。
- Process Summary。
- Tool Call。
- Artifact Reference。
- Card Rendering：`artifact_card`、`tool_result_card`、`choice_card`、`citation_card`、`status_card`、`form_request_card`。
- Error、cancelled、failed 状态消息。

运行态：

- queued：显示排队状态。
- running：显示 live indicator、最近事件序号、Stop Run。
- completed：显示完成时间和可打开 artifacts。
- failed：显示用户可理解错误和重试入口。
- cancelled：显示已停止，保留已产生内容。

AG-UI SSE：

- 前端应显示轻量连接状态，但不要把内部 URL 暴露给普通用户。
- reconnect 时从 last seen sequence 恢复。
- 页面刷新后先加载 conversation 当前状态，再恢复 stream。

### Composer

组件：

- Message textarea。
- Agent Selection：仅新会话可选。
- Allowed Model Selection：仅展示当前 Agent 允许的模型。
- Run Attachment picker。
- Send Message。
- Stop Run：仅当前 conversation 有 active run 时出现。

限制：

- 不提供 Enable Search、Enable Sandbox、Enable MCP 等用户侧工具开关。
- 一个 conversation 同时只能有一个 active Agent Run。
- 空消息不可提交。
- 上传附件是临时工作上下文，不叫 knowledge base 或 project file。

### 右侧 inspector

默认内容：

- 未选中 Artifact 时显示空态：选择 Artifact 或上传 Run Attachment 后预览。
- 有 Artifact 时显示类型、文件名、大小、下载按钮、预览内容。
- 有 Run Attachment 时显示附件预览、文件元信息和移除入口。

支持预览：

- Markdown。
- Plain text。
- Image。
- PDF。
- Code。
- JSON 或 table-like data。
- Sandboxed HTML iframe。

移动端：

- Sidebar 转为左侧 drawer。
- Inspector 转为右侧 drawer 或 bottom sheet。
- Composer 固定在底部，textarea 高度受限。

## 页面 5：Account Settings

### 目标

让用户查看 Local Account 状态和退出登录。

### 页面结构

- 当前用户名、邮箱、角色、账号状态。
- Sign out。
- 未来可扩展密码修改，但不属于当前 MVP 必需项。

### 权限

User 和 Administrator 都可访问自己的账号信息。管理员审批其他账号必须在 Administrator Console 完成。

## 页面 6：Administrator Console Overview

### 目标

给 Administrator 一个治理入口，而不是数据看板。

### 布局

- 左侧 admin navigation。
- 顶部概览：pending accounts、provider health、recent failed runs、storage usage。
- 中央放置需要处理的治理任务。

### 导航模块

- Account Approval。
- Agent Lifecycle。
- Model Configurations。
- MCP Servers。
- Search Provider Configuration。
- Page Read Provider Configuration。
- Sandbox Status。
- Run Audit。

### 设计重点

Administrator Console 可以比会话工作台更密集，但仍然避免把所有表单堆在一个页面。每个模块有明确的列表页、详情页和编辑面板。

## 页面 7：Account Approval

### 目标

批准、拒绝或禁用 Local Account。

### 数据

当前后端已有 approve、reject、disable 操作接口，但列表接口需要在前端落地前补齐或确认。

### 页面结构

- Tabs：Pending、Enabled、Rejected、Disabled。
- Account table：username、email、status、created time、last action。
- 操作：Approve、Reject、Disable。
- 详情 drawer：账号信息、审批历史、风险提示。

### 状态

- Pending account 为空时显示“暂无待审批账号”。
- 操作成功后更新列表并显示轻量反馈。
- 禁用当前 Administrator 自己账号应被阻止或要求额外确认。

## 页面 8：Agent Lifecycle

### 目标

管理 Agent 的创建、启用、禁用、退休和核心配置。

### 页面结构

- Agent list：名称、状态、Default Model、Allowed Model Selection 数量、capability summary。
- Agent detail：
  - name、description、icon/avatar。
  - Agent Instruction。
  - Process Visibility Policy。
  - Default Model Configuration。
  - Allowed Model Selection。
  - Agent Capability Policy。
  - MCP Tool Authorization。

### 交互

- Create Agent：打开表单 drawer 或独立页面。
- Disable Agent：禁止新会话使用，已有会话按策略继续或提示。
- Retire Agent：从新建入口隐藏，保留历史 conversation 绑定。
- Edit instruction：直接编辑，不做版本工作流，但 Agent Run 需要记录 instruction snapshot。

### 设计重点

Agent Selection 不是 marketplace。不要做评分、分类发现、公开模板商店等超出 MVP 的体验。

## 页面 9：Model Configurations

### 目标

让 Administrator 管理模型提供商目录和可用 Model Configuration。

### 页面结构

- Model Provider Catalog：OpenAI、Anthropic、Google Gemini、DeepSeek、Qwen/DashScope、Moonshot/Kimi、Doubao、Zhipu/GLM、MiniMax、OpenRouter、Custom OpenAI-compatible endpoint。
- Model Configuration list：provider、model、credential reference、enabled、default parameters、last updated。
- Create/Edit panel：provider、base URL、model name、credential reference、temperature 等运行参数。

### 交互

- Provider catalog 只是创建配置的入口，不代表 provider 已可用。
- 禁用配置后，依赖它的 Agent 应显示配置风险。
- User 只在 Conversation Composer 中看到当前 Agent 允许的模型。

### 状态

- 未配置 provider：显示 provider catalog 和创建引导。
- Credential 缺失：显示 admin-only 错误，不暴露 secret。
- 配置不可用：在 Agent detail 和 composer 中显示受限状态。

## 页面 10：MCP Servers

### 目标

注册远程 MCP Server，发现工具，并授权给指定 Agent。

### 页面结构

- MCP Server list：名称、connection type、URL、enabled、discovery status、tool count。
- Create/Edit MCP Server：SSE 或 Streamable HTTP、URL、headers 或 secret references、timeout、enabled。
- Tool discovery result：tool name、description、schema summary、last discovered。
- Authorization panel：选择 Agent，授权具体 tools。

### 限制

- MVP 不支持 stdio MCP server。
- 不做 MCP marketplace。
- 不允许 Agent 直接拿到 raw MCP credentials。

## 页面 11：Search Provider Configuration

### 目标

配置 Search Capability 的具体 provider。MVP 默认 Doubao Search Provider。

### 页面结构

- Provider status card：enabled、availability、credential reference、limits。
- Edit panel：endpoint、credential reference、rate limit、result limit、timeout。
- Health check result：最近一次检查状态、错误摘要。

### 设计重点

Search Capability 只负责找候选 URL 和摘要，不负责读取完整页面。完整页面读取属于 Page Read Capability。

## 页面 12：Page Read Provider Configuration

### 目标

配置 Page Read Capability 的具体 provider。MVP 默认 Jina Reader Provider。

### 页面结构

- Provider status card：enabled、availability、credential reference、limits。
- Domain policy editor：允许或禁止的域名规则。
- Runtime settings：timeout、content length、extract mode。
- Health check result。

### 设计重点

Page Read 是读取已知 URL，不是 Search。UI 文案必须避免把两者混成“浏览器模式”。

## 页面 13：Sandbox Status

### 目标

展示 Sandbox Capability 可用性、授权关系和执行风险。

### 页面结构

- Sandbox runtime status。
- Agent capability table：哪些 Agent 可用 Sandbox Capability。
- Recent sandbox tool calls。
- Artifact capture summary。

### 限制

MVP 使用 OpenAI Agents SDK sandbox support，不展示或暗示生产级 host Docker sandbox。

## 页面 14：Run Audit

### 目标

让 Administrator 审计 Agent Run 状态、失败、工具调用、Artifacts 和 Full Trace。

### 页面结构

- Filter bar：status、user、Agent、model、date range。
- Run list：run id、conversation、user、Agent、model、status、started、duration、tool count、artifact count。
- Run detail：
  - status timeline。
  - Conversation Message references。
  - Process Summary。
  - Tool Call sequence。
  - Run Capability Snapshot。
  - Artifacts。
  - failure/cancellation detail。
  - Full Trace entry。

### 权限与保留

- 只有 Administrator 可访问 Full Trace。
- Full Trace 默认保留 90 天。
- 普通 User 不看 Full Trace，只看 Process Summary、Tool Call 状态、cards 和 artifacts。

## 页面 15：Full Trace Detail

### 目标

为 Administrator 提供单次 Agent Run 的诊断细节。

### 页面结构

- Trace header：run id、status、Agent、model、user、时间。
- Event timeline：runtime events、model interactions、tool calls、errors。
- Raw diagnostic payload：折叠展示，默认不铺满页面。
- Artifact references。

### 设计重点

Full Trace 是治理和调试工具，不应进入普通用户 conversation UI，也不应展示为分析 dashboard。

## 当前实现到目标设计的差距

| 当前实现 | 目标设计 |
| --- | --- |
| 一个 `ConversationShell` 承载所有界面 | 拆成访问入口、Conversation Workspace、Administrator Console |
| 右侧 rail 混放账号、预览和管理员功能 | 普通工作台右侧只放 preview/context，管理员功能进入 `/admin/*` |
| 静态演示数据 | 通过 API 加载真实 conversations、runs、artifacts、admin resources |
| 没有真实登录页 | 独立 Login/Register/Pending 页面 |
| 原生文件选择器外露 | 自定义 attachment control，保留可访问性 |
| SSE URL 等内部信息可见 | 普通用户只看连接/运行状态，技术细节进调试或 admin |
| 英文 scaffold 文案 | 统一产品文案和术语，必要时支持中英文配置 |
| 管理模块只有卡片入口 | 每个治理模块拆成列表、详情、编辑状态 |

## 前端落地顺序

1. 建立 app routing 和 auth guard：Login、Register、Approval Pending、Conversation Workspace、Administrator Console。
2. 将 `ConversationShell` 拆成 sidebar、workspace、composer、message stream、inspector。
3. 接入 Local Account 登录态和真实 conversation API。
4. 从右侧 rail 移出 Administrator panels，建立 `/admin` 模块导航。
5. 接入 Artifact Preview、Run Attachment、Agent Run、AG-UI SSE resume。
6. 补齐 Administrator Console 的 Account Approval、Agent Lifecycle、Model Configurations。
7. 补齐 MCP、Search、Page Read、Sandbox、Run Audit 和 Full Trace。
8. 做视觉系统整理：按钮、输入、select、drawer、table、status chip、message card、tool call row。
9. 添加响应式规则和 Playwright 视觉检查。

## 验收清单

- 登录后第一屏是 Conversation Workspace，不是营销首页或管理员大屏。
- 普通 User 不会看到 Administrator Console 内容。
- Administrator 有明确入口进入治理工作台。
- 用户新建 Agent Conversation 时可以选择 enabled Agent 和 Allowed Model Selection。
- 已有 conversation 保持原 Agent binding。
- 用户不能从 composer 启停工具能力。
- 一个 conversation 同时只能有一个 active Agent Run。
- 离开并返回页面后可以恢复 run state 和 stream。
- Artifact Preview 支持 MVP 定义的文件类型。
- Run Attachment 被表达为临时工作上下文，不是知识库。
- Full Trace 只在 Administrator Run Audit 中可见。
- 页面在 desktop、tablet、mobile 下不重叠、不溢出、不丢失主操作。
