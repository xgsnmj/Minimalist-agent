# Administrator Console 与会话运行链路解决方案

## 结论

当前 Administrator Console 已经从“API-backed demo shell”推进到可操作的管理员设置工作台雏形：模型配置、智能体配置、账号审批、运行审计、CopilotKit 适配和真实 OpenAI-compatible runtime adapter 已经形成闭环。模型、智能体、账号、账号审计、管理员审计、session token、模型健康检查和本地 Secret Vault 已经具备 PostgreSQL schema 与 Alembic migration。后续如进入企业生产环境，仍建议把本地 Secret Vault 替换为 KMS/云 Secret Manager，并补充审计查询 UI。

需要优先处理三件事：

1. 控制台信息架构已从“宣传/解释型页面”改成高密度 master-detail 管理员工作台；后续可继续抽象统一 `AdminObjectPage`。
2. 模型配置、智能体配置、账号审批已经具备创建、编辑、启停、健康/就绪检查、持久化、密钥引用、账号审核事件和跨对象管理员审计闭环。
3. 会话控制台已收紧 selected model 与 Agent allowed models 的运行契约，CopilotKit runtimeUrl/query 404 问题已修复。仍需在目标环境确认 `gpt-5.5` 凭据可解析且真实 endpoint 可访问。

## 当前已落地状态

- 启动时会创建或复用默认模型配置并绑定到 Default Agent。默认模型名为 `gpt-5.5`，可通过 `DEFAULT_MODEL_NAME`、`DEFAULT_MODEL_ENDPOINT`、`DEFAULT_MODEL_CREDENTIAL_REFERENCE` 覆盖。
- 模型配置、智能体配置、账号、账号审计、管理员审计、session token、模型健康检查和 Secret Vault 已落到 SQLAlchemy/PostgreSQL schema；测试环境仍使用 SQLite fallback。
- CopilotKit 前端 `runtimeUrl` 固定为 `/api/copilotkit`，token 通过 Authorization header 传递，避免 `/api/copilotkit?access_token=.../info` 这种错误路径。
- 后端 runtime 默认使用管理员配置的 OpenAI-compatible `endpoint`、`model_name` 和 `credential_reference`，测试环境仍可注入 fake provider；`secret://...` 引用会先从 Secret Vault 解析，`env:...` 引用仍从环境变量解析。
- Conversation draft、conversation create、run create 和 CopilotKit run 均校验 selected model 必须属于 Agent allowed model selection。
- Model Configuration response 增加 `health_status`、`last_checked_at`、`last_error`，并提供 `POST /admin/model-configurations/{id}/health-check`。
- 禁用被 enabled Agent 引用的模型配置会返回 409，避免线上智能体被误停模型。
- Agent 创建、编辑、启用前会做 readiness 校验：默认模型、允许模型、模型启用状态和 MCP server 引用都必须有效。
- Account Approval 支持 note、reason、enable、role patch、created/updated timestamp 和 account audit events；reject/disable 必须带 reason，管理员不能禁用自己或最后一个 enabled admin；禁用账号会撤销该账号已有 session token。
- 前端 `/admin/models`、`/admin/agents`、`/admin/account-approval` 已改为更高密度的 master-detail 工作台，并接入健康检查、就绪检查、原因/备注保存和审计时间线。
- Run Audit 的 capability snapshot 和 Full Trace 会记录运行时模型配置快照，不只保存配置 id。

## 调研范围

本次调研覆盖这些文件和设计依据：

- `CONTEXT.md`
- `docs/page-design.md`
- `docs/adr/0041-copilotkit-frontend-experience-layer.md`
- `apps/web/src/routes/planned-pages.tsx`
- `apps/web/src/features/workspace/conversation-shell.tsx`
- `apps/web/src/features/workspace/workspace-api.ts`
- `apps/web/src/shared/copilotkit-adapter.tsx`
- `apps/web/src/components/ui/select.tsx`
- `apps/web/vite.config.ts`
- `apps/api/app/features/admin/routes.py`
- `apps/api/app/features/workspace/routes.py`
- `apps/api/app/model_configurations.py`
- `apps/api/app/agents.py`
- `apps/api/app/auth.py`
- `apps/api/app/features/auth/routes.py`
- `apps/api/app/copilotkit_runtime.py`
- `apps/api/app/runtime.py`
- 相关 API 和前端测试：`test_model_configurations.py`、`test_agents.py`、`test_local_accounts.py`、`test_agent_runs.py`、`test_agent_runtime.py`、`test_copilotkit_runtime.py`、`model-configuration.test.tsx`、`admin-agent-lifecycle.test.tsx`、`conversation-shell.test.tsx`

## 1. 管理控制台 UI 与信息架构问题

### 现状判断

项目文档已经明确 Administrator Console 是治理工作台，不是营销页，也不是 BI dashboard。`docs/page-design.md` 也要求页面文案只保留对象、状态、动作、约束和反馈。

当前实现偏离了这个方向：

- 页面顶部有大标题、eyebrow、解释性 intro，视觉更像产品介绍页。
- 每个配置页都有大量说明文本，例如“维护模型提供商、凭据引用、端点和默认参数”“先选智能体，再调整策略”“提供商目录只是创建入口”等。
- 详情区使用较多 InfoTile 和风险说明卡，首屏信息密度低，真正的可操作字段少。
- 列表、详情、创建表单、Provider catalog 同屏混排，信息层级不稳定。
- Provider catalog 作为大块区域占据模型配置页底部，但它只应该是创建表单里的辅助选择入口。
- Empty state 文案偏解释型，管理员场景应更短，例如“暂无待审批账号”“暂无模型配置”“未绑定模型”。

### 下拉框样式问题

截图里下拉框样式异常不只是局部 CSS 小问题。当前 `apps/web/src/components/ui/select.tsx` 里有两个风险点：

- `SelectTrigger` 默认 `w-fit`，表单里的选择器会按内容收缩，和管理员表单双列布局不匹配。
- `SelectContent` 的 Viewport 使用了 `data-[position=popper]:h-(--radix-select-trigger-height)`，这会让下拉内容区高度接近触发器高度，列表容易显得很矮、很怪。

建议立即改为：

- SelectTrigger 默认 `w-full`，表格筛选器再用 `className="w-fit"` 覆盖。
- SelectContent Viewport 使用 `max-h-[min(var(--radix-select-content-available-height),20rem)]`，不要设置为触发器高度。
- Content 使用 `min-w-[var(--radix-select-trigger-width)]`，长选项允许换行或截断，避免 provider 名称挤压。
- 管理员创建/编辑表单中的 Select 都给明确 `aria-label`、宽度和错误态。

### 目标页面形态

每个管理员配置页统一成高密度 master-detail：

- 左侧或主体：对象表格。列包含名称、状态、关键配置、更新时间、健康状态、最近操作人、操作。
- 右侧：详情/编辑 drawer 或 inspector。默认只读摘要，点击编辑后变成表单。
- 顶部 toolbar：搜索、状态筛选、创建按钮、批量操作。
- 底部或右侧折叠：审计时间线、最近错误、健康检查结果。

页面文案规则：

- 删除价值说明和教学解释。
- 只保留短标签：状态、凭据、端点、默认模型、可选模型、能力、最近检查、更新人。
- 风险提示只有在存在真实风险时显示，例如“凭据缺失”“默认模型已停用”“允许模型为空”。
- Provider catalog 从页面主体移入“创建模型配置”表单的 provider 选择器或帮助抽屉。

## 2. 功能完备性梳理

### 模型配置

当前已有：

- 后端 `GET /admin/model-providers`。
- 后端 `GET /admin/model-configurations`。
- 后端 `POST /admin/model-configurations`。
- 后端 `PATCH /admin/model-configurations/{configuration_id}`。
- 创建/更新请求支持 `provider_id`、`name`、`model_name`、`endpoint`、`credential_reference`、`api_key`、`default_parameters`、`enabled`。
- 前端可创建、编辑、启用、停用模型配置，并展示列表与详情。
- 前端和后端已接入健康检查，返回最近检查时间和错误摘要。
- 后端会阻止禁用仍被 enabled Agent 引用的模型配置。

当前缺口：

- 前端仍没有删除、复制配置、测试补全调用或更新 secret vault 的正式入口。
- 表单只暴露 temperature，没有 max tokens、top_p、timeout、retries、reasoning、stream、response format、tool choice 等常用参数。
- `api_key` 字段后端已写入本地 Secret Vault 并只返回 `credential_reference`；生产建议替换为 KMS/云 Secret Manager。
- 后端已改为 SQLAlchemy/PostgreSQL store，测试环境使用 SQLite fallback。
- 没有 provider/model 参数 schema 校验，也没有 endpoint 连通性校验。
- 数据库层已有 `created_at`、`updated_at`；跨对象管理员审计已记录 actor/before/after/reason，前端暂未提供统一审计查询页。

建议目标字段：

| 字段 | 必要性 | 说明 |
| --- | --- | --- |
| provider_id | 必须 | Provider catalog 中的 id 或 custom-openai-compatible |
| name | 必须 | 管理员可读名称 |
| model_name | 必须 | 实际请求模型名，例如 `gpt-5.5` |
| endpoint/base_url | 必须 | OpenAI-compatible 时通常为 `/v1` 基础地址 |
| credential_reference | 必须 | 指向 secret vault 的引用，不显示明文 |
| enabled | 必须 | 控制是否可被 Agent 使用 |
| default_parameters | 必须 | JSON 对象，保留 provider-specific 扩展 |
| timeout_seconds | 建议 | 运行超时 |
| max_retries | 建议 | 失败重试次数 |
| max_output_tokens | 建议 | 输出 token 上限 |
| temperature/top_p | 建议 | 采样参数 |
| reasoning_effort | 按 provider | 推理模型参数 |
| response_format/tool_choice/parallel_tool_calls | 按 provider | 工具和结构化输出控制 |
| health_status/last_checked_at/last_error | 必须 | 管理员判断是否可用 |
| created_at/updated_at/updated_by | 必须 | 审计 |

### 智能体配置

当前已有：

- 后端 `GET /admin/agents`。
- 后端 `POST /admin/agents`。
- 后端 `PATCH /admin/agents/{agent_id}`。
- 后端 `POST /admin/agents/{agent_id}/enable|disable|retire`。
- 后端 `POST /admin/agents/{agent_id}/prepare-run`。
- 后端模型包含 `name`、`description`、`icon`、`instruction`、`process_visibility`、`default_model_configuration_id`、`allowed_model_configuration_ids`、`capability_policy`。
- 前端可创建智能体、查看列表、查看详情、启用/停用/归档。
- 前端已支持默认模型、允许模型、能力策略、process visibility、description 和 instruction 编辑。
- 后端已校验默认模型存在、enabled、属于 allowed models，并校验 MCP server 引用。
- 前端已提供 readiness check，后端在创建、编辑和启用前也会强制 readiness 校验。

当前缺口：

- 前端没有 MCP server/tool allowlist 的完整编辑体验，只在 MCP 页面有部分授权动作。
- 后端已有管理员 mutation 审计表；还没有 Agent 配置版本 diff UI。

建议目标能力：

- 创建智能体时必须选择至少一个 enabled Model Configuration。
- default model 必须属于 allowed model selection。
- 如果 allowed models 为空，Agent 只能保存为 disabled draft，不能 enabled。
- 编辑页拆成四个 tab：基础信息、模型策略、能力策略、运行说明。
- 能力策略使用开关和 allowlist，不使用说明卡片。
- 保存前做前端校验，保存时后端二次校验。
- 启用 Agent 前执行 readiness check：默认模型可用、凭据可用、策略引用对象存在。

### 账号审批

当前已有：

- 注册后账号为 pending。
- pending 账号不能登录。
- 管理员可 `GET /admin/accounts`。
- 管理员可 approve、reject、disable、enable。
- 前端有 pending/enabled/rejected/disabled tabs。
- 前端支持 pending 批准/拒绝、enabled 非 admin 禁用，以及 rejected/disabled 重新启用。
- 后端和前端支持管理员备注、拒绝/禁用/重新启用原因、created/updated 时间和账号审计事件。
- 后端阻止管理员禁用自己或最后一个 enabled admin。

当前缺口：

- 前端没有搜索、批量审批、登录失败记录、最近登录时间。
- 账号和审计事件已落库；登录失败记录仍未持久化。

建议目标能力：

- `POST /admin/accounts/{id}/approve`：pending -> enabled。
- `POST /admin/accounts/{id}/reject`：pending -> rejected，必须带 reason。
- `POST /admin/accounts/{id}/disable`：enabled -> disabled，必须带 reason。
- `POST /admin/accounts/{id}/enable`：disabled/rejected -> enabled，需要管理员确认。
- `PATCH /admin/accounts/{id}`：备注、角色、可选 profile 字段。
- 后端强制禁止禁用自己和最后一个 enabled admin。
- 所有审批动作写入 account audit events。

## 3. 会话控制台与后端打通情况

### 当前前端数据流

会话页加载：

1. `GET /workspace/agents`
2. `GET /conversations`
3. `GET /runs`

`GET /workspace/agents` 只返回 enabled Agent，以及该 Agent 允许使用且 enabled 的模型配置。前端再把 `allowed_model_configurations` 映射为 composer 的模型下拉选项。

新建对话时：

1. 用户输入消息。
2. 前端使用当前 `draftAgentId` 和 `draftModelId` 创建 conversation draft。
3. 前端调用 `POST /conversations/{conversation_id}/runs`。
4. 后端根据 conversation 的 `selected_model_configuration_id` 创建 run capability snapshot。

### 当前后端运行链路

后端运行链路已经有 Agent Run、事件、conversation 状态、run audit、CopilotKit adapter，并且 runtime 默认使用管理员配置的 OpenAI-compatible provider：

- `apps/api/app/runtime.py` 会根据 run snapshot 中的 `selected_model_configuration_id` 解析模型配置。
- 生产默认使用 `OpenAIProvider(api_key, base_url=configuration.endpoint, use_responses=False)`。
- `credential_reference` 支持 `env:NAME` 和归一化环境变量候选；测试环境可以用 `use_fake_model_provider_for_tests()` 注入本地 provider。
- trace 会记录 `model_configuration_id`、`provider_id`、`model_name` 和 `endpoint`。

因此当前状态是：

- 前端会话控制台可以和后端的 conversation/run API 打通。
- CopilotKit runtime routes 基础存在。
- 新增的 gpt-5.5 只有在绑定到 Agent allowed models/default model 后，才会出现在前端模型选择里。
- 只要 `credential_reference` 能解析到真实 API key，runtime 会请求该模型配置的 endpoint。

### CopilotKit 404 根因分析

后端实际提供的是 REST 风格 CopilotKit runtime：

- `GET /copilotkit/info`
- `POST /copilotkit/agent/{copilot_agent_id}/connect`
- `POST /copilotkit/agent/{copilot_agent_id}/run`
- `POST /copilotkit/agent/{copilot_agent_id}/stop/{thread_id}`

Vite 代理配置会把：

- `/api/copilotkit/info` 转发为后端 `/copilotkit/info`

所以如果开发服务器代理正常，`/api/copilotkit/info` 不应该 404。

高概率问题在前端：

```tsx
const runtimeUrl = token
  ? `${copilotRuntimeUrl}?access_token=${encodeURIComponent(token)}`
  : copilotRuntimeUrl;

<CopilotKit runtimeUrl={runtimeUrl} />
```

CopilotKit 1.62.1 的 core 会直接请求：

```ts
fetch(`${this.runtimeUrl}/info`, ...)
```

当 `runtimeUrl` 是 `/api/copilotkit?access_token=TOKEN` 时，最终 URL 会变成类似：

```text
/api/copilotkit?access_token=TOKEN/info
```

这不是 `/api/copilotkit/info?access_token=TOKEN`。浏览器会把 `/info` 当成 query 的一部分，服务端看到的 path 仍是 `/api/copilotkit`，后端没有 `GET /copilotkit`，于是出现 404 或后续 single-endpoint fallback 失败。

建议修复：

```tsx
const headers = useMemo(
  () => token ? { Authorization: `Bearer ${token}` } : {},
  [token],
);

<CopilotKit
  runtimeUrl="/api/copilotkit"
  headers={headers}
  credentials="same-origin"
  useSingleEndpoint={false}
  onError={...}
/>
```

同时后端可以保留 `access_token` query 支持给 SSE fallback，但 CopilotKit provider 不应把 query 拼进 `runtimeUrl`。

### 还需要收紧的运行契约

runtime 已移除“全局第一个模型配置”或 `openai/gpt-5` 的隐式兜底。没有 selected model、模型不存在或模型已停用时，run 会失败并写入清晰错误。

目标契约应改为：

- Agent enabled 时必须有 default model。
- conversation selected model 必须属于 Agent allowed model selection。
- run snapshot 中的 selected model 必须存在、enabled、凭据可用。
- 如果模型不可用，run 应在 queue 前失败并返回清晰错误，不应进入 mock fallback。
- runtime 不允许使用“全局第一个模型配置”作为隐式兜底。

## 4. 推荐改造路线

### P0：先让 gpt-5.5 真正能跑起来

目标：修复 CopilotKit 404，确保会话运行使用管理员配置的模型。

任务：

1. 修复 `CopilotKitWorkspaceProvider`：`runtimeUrl` 固定为 `/api/copilotkit`，token 通过 `headers` 传递，设置 `useSingleEndpoint={false}`。
2. 增加前端测试：断言 CopilotKit fetch runtime info 时请求 `/api/copilotkit/info`，并带 Authorization header。
3. 在 Agent 配置里把 gpt-5.5 模型绑定到 Default Agent 的 `default_model_configuration_id` 和 `allowed_model_configuration_ids`。
4. 后端增加 conversation/run 校验：selected model 必须属于 Agent allowed models。
5. 替换 `_LocalModelProvider` 为真实 OpenAI-compatible provider adapter。
6. 建立 secret resolver：`credential_reference -> api key`，不要把明文 key 存在 model configuration response 中。
7. 增加健康检查接口：`POST /admin/model-configurations/{id}/health-check`。

验收：

- 浏览器 Network 中 `GET /api/copilotkit/info` 返回 200。
- 不再出现 `runtime_info_fetch_failed`。
- `/workspace/agents` 返回 Default Agent 且 allowed model 包含 gpt-5.5。
- 新会话的模型下拉默认选中 gpt-5.5。
- 后端 run trace 中记录 selected model configuration id、provider、model_name。
- Assistant response 来自真实 endpoint，不再是 `provider:model handled ...`。

### P1：补齐配置 CRUD 与治理校验

目标：模型配置、智能体配置、账号审批达到可管理状态。

任务：

1. 模型配置页增加编辑 drawer。
2. 模型配置页增加启用/停用、健康检查、复制配置。
3. 模型配置表单支持 default parameters JSON 和常用参数快捷字段。
4. 智能体页增加编辑 drawer。
5. 智能体页支持默认模型、允许模型、能力策略、instruction 的保存。
6. 启用 Agent 前做 readiness check。
7. 账号审批增加 enable、备注保存、原因输入、搜索和审计时间线。
8. 后端补充引用完整性校验。

验收：

- 管理员能从 UI 创建、查看、编辑、启用/停用模型配置。
- 管理员能从 UI 创建、查看、编辑、启用/停用/归档智能体。
- 新建智能体时不能保存“enabled 且无模型”的配置。
- 禁用正在被 enabled Agent 默认使用的模型时，后端返回 409 或要求确认迁移。
- 账号备注、原因和审批事件刷新后仍存在。

### P2：重构 Administrator Console 信息架构

目标：把页面从“说明型大页面”改成高密度设置页。

任务：

1. 提取统一 `AdminObjectPage` 布局：toolbar、table、detail drawer、audit rail。
2. 删除 route header 的长 intro 文案。
3. Provider catalog 改为创建表单内的 provider selector。
4. InfoTile 改为密集 definition list 或属性表。
5. Empty state 文案缩短，不再解释产品价值。
6. 修复 Select 组件默认宽度和 dropdown viewport。
7. 所有管理员表格支持搜索、状态筛选、错误态、loading skeleton。

验收：

- `/admin/models` 首屏主要展示模型配置表格和详情，不再以 provider catalog 为视觉重心。
- `/admin/agents` 首屏能直接编辑模型策略和能力策略。
- `/admin/account-approval` 能直接处理审批队列，不需要阅读说明文字。
- 所有 Select dropdown 高度、宽度、层级、滚动都正常。

### P3：生产化持久化、审计和安全

目标：从内存 store 迁移到可上线的持久化配置系统。

任务：

1. [x] 为 model_configurations、agents、local_accounts、account_audit_events、model_health_checks 增加 PostgreSQL schema 和 Alembic migration。
2. [x] 密钥进入本地 Secret Vault 或环境密钥管理，不进入普通 API 响应。
3. [x] 管理员核心 mutation 写审计事件：actor、target、before、after、reason、timestamp。
4. [x] tokens 改为可撤销 session token，禁用账号后 token 立即失效。
5. [x] run trace 中记录模型配置快照，而不是只记录 id。
6. [x] 为模型、Agent、账号配置增加集成测试和端到端 smoke test。

验收：

- 服务重启后模型、智能体、账号、备注、审计仍存在。
- 禁用账号后旧 token 不能继续访问。
- 管理员可以从 Run Audit 查到一次运行使用的模型配置快照。
- 生产环境不需要依赖内存配置 store；默认模型 bootstrap 仍保留为首次启动便利能力。

## 5. 建议的目标接口

### Model Configuration

```http
GET    /admin/model-providers
GET    /admin/model-configurations
POST   /admin/model-configurations
GET    /admin/model-configurations/{id}
PATCH  /admin/model-configurations/{id}
POST   /admin/model-configurations/{id}/enable
POST   /admin/model-configurations/{id}/disable
POST   /admin/model-configurations/{id}/health-check
POST   /admin/model-configurations/{id}/duplicate
```

### Agent Lifecycle

```http
GET    /admin/agents
POST   /admin/agents
GET    /admin/agents/{id}
PATCH  /admin/agents/{id}
POST   /admin/agents/{id}/enable
POST   /admin/agents/{id}/disable
POST   /admin/agents/{id}/retire
POST   /admin/agents/{id}/readiness-check
POST   /admin/agents/{id}/prepare-run
```

### Account Approval

```http
GET    /admin/accounts
GET    /admin/accounts/{id}
PATCH  /admin/accounts/{id}
POST   /admin/accounts/{id}/approve
POST   /admin/accounts/{id}/reject
POST   /admin/accounts/{id}/disable
POST   /admin/accounts/{id}/enable
GET    /admin/accounts/{id}/audit-events
```

### Runtime

```http
GET    /workspace/agents
POST   /conversations/drafts
POST   /conversations/{conversation_id}/runs
GET    /runs/{run_id}/events
GET    /copilotkit/info
POST   /copilotkit/agent/{agent_id}/connect
POST   /copilotkit/agent/{agent_id}/run
POST   /copilotkit/agent/{agent_id}/stop/{thread_id}
```

## 6. 实施顺序建议

推荐按以下顺序落地：

1. [x] 先修 CopilotKit runtimeUrl/query bug 和 Select dropdown 基础样式。
2. [x] 绑定 gpt-5.5 到 Default Agent，并在会话页确认模型可见。
3. [x] 实现真实 OpenAI-compatible runtime adapter。
4. [x] 收紧 selected model 与 Agent allowed models 的后端校验。
5. [x] 补齐模型配置编辑、健康检查和启停。
6. [x] 补齐智能体模型策略、能力策略、instruction 编辑。
7. [x] 补齐账号备注、原因、重新启用和审计事件。
8. [x] 先完成 Administrator Console 的高密度 master-detail 改造；后续可继续抽象统一 `AdminObjectPage`。
9. [x] 最后做 PostgreSQL 持久化、secret vault、审计和 token 生产化。

这个顺序的原因是：先确保会话链路真实可用，再补配置闭环，最后重做高密度管理体验。否则 UI 重构会掩盖运行链路仍是 mock 的问题。

## 7. 最小可验收清单

### 管理控制台

- [x] `/admin/models` 能创建、编辑、启用、停用、健康检查模型配置。
- [x] `/admin/agents` 能把 gpt-5.5 设置为 Default Agent 默认模型和允许模型。
- [x] `/admin/agents` 启用 Agent 前会校验默认模型、允许模型和能力引用。
- [x] `/admin/account-approval` 能批准、拒绝、禁用、重新启用账号，并保存原因/备注。
- [x] 控制台页面不再出现大段介绍性文案。
- [x] 所有下拉框宽度、高度、滚动、层级正常。

### 会话控制台

- [x] `GET /api/workspace/agents` 返回绑定 gpt-5.5 的 Agent。
- [x] 模型下拉显示 gpt-5.5。
- [x] 新建会话时 `selected_model_configuration_id` 是 gpt-5.5 的配置 id。
- [x] `POST /conversations/{id}/runs` 生成的 run snapshot 记录选中的模型配置。
- [x] runtime 使用真实 endpoint 和凭据调用模型。
- [x] run audit 能看到模型配置、状态、错误和 trace。

### CopilotKit

- [x] `GET /api/copilotkit/info` 返回 200。
- [x] Network 中没有 `/api/copilotkit?access_token=.../info`。
- [x] `runtime_info_fetch_failed` 的已知 query 拼接根因已修复。
- [x] CopilotKit run 能进入后端 Agent Run，而不是只停留在前端错误。
