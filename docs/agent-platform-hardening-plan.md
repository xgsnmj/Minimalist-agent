# Agent Platform 生产化整改方案

## 文档状态

- 状态：待评审
- 基线日期：2026-07-12
- 适用范围：`apps/api`、`apps/worker`、`apps/web`、PostgreSQL、Redis、MinIO、Agent Runtime 与外部能力 adapter
- 目标：把当前功能覆盖较完整的 Agent Platform MVP，推进为安全、真实、可恢复、可验证的前后端闭环框架

本文记录当前实现与既有 ADR 之间的差距，并给出可以直接拆成 GitHub Issues 的实施方案。它不引入新的产品范围，不扩展 Enterprise SSO、Knowledge Collection 或 Agent marketplace。

## 成功标准

完成本方案后，项目至少满足以下条件：

1. 任何生产配置都不能让 Agent 默认在 API 或 Agent Run Worker 的宿主环境执行命令。
2. PostgreSQL 中不保存明文密码、原始 session token 或未加密的第三方凭据。
3. Search Capability、Page Read Capability 和 MCP Server 使用真实 adapter，Administrator Console 修改的配置对 API 与 Agent Run Worker 一致可见。
4. Agent Run 的状态、消息、事件和会话占用关系由数据库事务与约束保护，而不是依赖单进程先查后写。
5. Run Cancellation 能阻止后续模型与工具工作，并且取消后的 Run 不会重新进入 completed。
6. AG-UI SSE 是可持续订阅、可恢复、不会在 URL 中暴露 session token 的事件流。
7. Full Trace 的 90 天保留策略有真实时间字段、清理任务和可观察结果。
8. 最终验证覆盖真实 PostgreSQL、Redis、MinIO、Agent Run Worker、至少一个真实模型 endpoint，以及已启用的真实外部能力 adapter。

## 已验证基线

2026-07-12 在本地开发环境完成了以下只读或非业务写入验证：

- `pnpm run ci` 通过：前端 71 个测试，后端及契约测试 141 个测试。
- PostgreSQL 18.1、Redis 与 MinIO 可连接。
- Alembic 位于 `0005_persist_mcp_config (head)`，`alembic check` 没有检测到 metadata 漂移。
- API 与 Web 能使用真实本地基础设施启动；OpenAPI 暴露 54 个 path、66 个 operation。
- 登录页、注册页及其导航可渲染；390 x 844 视口没有横向溢出。

这些结果只证明当前接口形状与模拟流程稳定。`test_mvp_smoke_workflow.py` 明确注入 fake Agent Runtime，Search、Page Read 和部分 MCP 路径也仍是模拟实现，因此不能作为真实能力闭环的最终证据。

## 优先级总览

| 编号 | 问题 | 优先级 | 发布影响 | 主要 ADR |
| --- | --- | --- | --- | --- |
| HARD-001 | Sandbox 默认落到本地执行且失去按 Agent 授权 | P0 | 阻止合并/发布 | ADR-0009、ADR-0016 |
| HARD-002 | 密码、session token 与 Secret Vault 明文存储 | P0 | 阻止外部部署 | ADR-0004、ADR-0005 |
| HARD-003 | Search/Page Read 配置仅存在于进程内存 | P1 | API 与 Worker 配置不一致 | ADR-0017、ADR-0019、ADR-0040 |
| HARD-004 | Search、Page Read、MCP discovery/invoke 仍有模拟结果 | P1 | 核心能力不真实 | ADR-0009、ADR-0017、ADR-0019、ADR-0022 |
| HARD-005 | Agent Run 缺少关系约束、并发约束和原子事务 | P1 | 产生重复 Run、乱序事件和半完成状态 | ADR-0036、ADR-0038、ADR-0040 |
| HARD-006 | Run Cancellation 不会可靠中断底层工作 | P1 | 已取消 Run 仍消耗资源或完成 | ADR-0034、ADR-0035、ADR-0037 |
| HARD-007 | SSE 是单次快照，且 token 进入 URL | P1 | 延迟、重连风暴和凭据泄露 | ADR-0035、ADR-0036 |
| HARD-008 | 90 天保留、健康检查与 Worker 可靠性仅部分落地 | P2 | 数据无限增长、故障不可见 | ADR-0012、ADR-0037 |
| HARD-009 | 扁平大模块违背 feature-first 目标结构 | P2 | 改动面和回归成本持续上升 | ADR-0045 |
| HARD-010 | 缺少真实环境端到端发布门禁 | P1 | 绿灯无法证明真实闭环 | Agent Instructions |

## HARD-001：恢复受控的 Sandbox Capability

### 当前证据

- `apps/api/app/runtime.py` 的 `_runtime_agent` 无条件创建 `SandboxAgent`。
- 未配置 runtime 时，`_coerce_sandbox_runtime_type` 默认返回 `local`。
- `local` 使用 OpenAI Agents SDK 的 `UnixLocalSandboxClient`。
- 当前工作树移除了 `AgentCapabilityPolicy.sandbox_enabled`，前端显示“沙箱能力默认启用”。
- SDK 的 Unix Local 实现会在当前宿主或 Agent Run Worker 容器内启动子进程。macOS 使用 `sandbox-exec` 做部分文件限制；非 macOS 分支直接执行命令。

这与 ADR-0016 的“Sandbox access still flows through the Agent Tool Gateway and each Agent's capability policy”直接冲突。

### 目标设计

建立一个小而深的 `SandboxRuntime` 模块，外部 interface 只暴露：

```python
class SandboxRuntime(Protocol):
    def create_session(self, request: SandboxSessionRequest) -> SandboxSession: ...
```

授权、runtime 选择、资源限制、网络策略、生命周期清理和审计全部留在模块实现内。Agent、模型配置和前端不直接操作 SDK client。

支持三类 adapter：

- `DisabledSandboxAdapter`：默认 adapter；Agent 未授权时拒绝创建 session。
- `LocalDevelopmentSandboxAdapter`：仅 `APP_PROFILE=development` 且显式开启时可用。
- `ManagedSandboxAdapter`：生产 adapter，可基于远程 Docker、独立 sandbox worker 或后续托管执行环境实现，但不能共享 API/Worker 的文件系统与凭据。

### 实施步骤

1. 恢复 `AgentCapabilityPolicy.sandbox_enabled`，并纳入 Run Capability Snapshot。
2. 默认策略改为 `sandbox_enabled=false`；旧记录缺少字段时按 false 解释。
3. 增加 `SANDBOX_RUNTIME=disabled|local-development|managed`，生产环境禁止 `local-development`。
4. 启动和 Agent readiness 检查同时验证：Agent 已授权、runtime 可用、隔离策略完整。
5. 将 SDK `SandboxAgent` 和 `SandboxRunConfig` 的构造收口到 adapter 内部。
6. Managed adapter 默认使用非 root、只读根文件系统、临时工作目录、CPU/内存/进程/时长限制和禁用网络策略。
7. 禁止挂载 Docker socket、仓库根目录、`.env*`、宿主 home 和云凭据目录。
8. Artifact 只能通过受控导出 interface 进入 MinIO；不能让 Sandbox 直接写 Artifact metadata 表。
9. Tool Call 记录 runtime 类型、session id、资源限制、网络策略和清理结果，但不记录凭据。

### 兼容与回滚

- 数据迁移只恢复 capability policy 字段，不自动给任何 Agent 开启权限。
- 本地开发需要显式配置 `SANDBOX_RUNTIME=local-development`。
- 若 Managed adapter 不可用，Run readiness 失败，不回退到 local。

### 验收标准

- 在 `APP_PROFILE=production` 下配置 local runtime 时，API 启动或 readiness 检查明确失败。
- 未授权 Agent 看不到 shell/filesystem capability，模型即使请求也会得到可审计的拒绝结果。
- 真实隔离环境中无法读取 Agent Run Worker 的环境变量、仓库文件、数据库连接配置或 MinIO root credential。
- 默认禁止网络；显式 allowlist 后只能访问允许目标。
- 超时、超内存、进程退出和 API 重启后都能清理 session。
- 使用真实隔离 runtime 完成“生成文件 -> 导出 Artifact -> 前端预览”的闭环测试。

## HARD-002：完成 Local Account 与 Secret 管理加固

### 当前证据

- `local_accounts.password` 保存原始密码，认证使用直接字符串比较。
- `local_sessions.token` 以原始 bearer token 作为主键，且没有过期时间。
- 前端将 bearer token 放入 `localStorage`。
- `secret_vault_entries.secret_value` 保存第三方明文凭据。

### 目标设计

认证模块只向调用者暴露 `register`、`authenticate`、`resolve_session`、`revoke_session` 四个用例，不暴露密码或 token 存储形状。Secret 模块只暴露：

```python
class SecretResolver(Protocol):
    def put(self, reference: str, value: SecretValue) -> None: ...
    def resolve(self, reference: str) -> SecretValue: ...
```

生产 adapter 使用外部 Secret Manager 或 envelope encryption；调用者只持有 reference。

### 实施步骤

1. 使用 Argon2id 增加 `password_hash`，注册、bootstrap 和密码变更只写 hash。
2. 增加一次性 backfill 命令，将现有明文密码转换为 hash；确认全部完成后删除 `password` 列。
3. session 表改存 `token_hash`，增加 `expires_at`、`revoked_at`、`last_seen_at` 和可选设备摘要。
4. 登录响应只返回一次原始 token；数据库使用 SHA-256/HMAC 摘要查找。
5. 为登录、注册和 session 解析增加速率限制及失败审计，避免账号枚举。
6. 浏览器认证迁移到 `Secure`、`HttpOnly`、`SameSite=Lax/Strict` cookie；同时定义 CSRF 策略。
7. Secret Vault 增加 adapter seam：测试 adapter、本地加密 adapter、外部 Secret Manager adapter。
8. 本地加密 adapter 的 master key 只能来自环境或操作系统 secret store，不能写入同一数据库。
9. API response、Full Trace、Tool Call 和日志统一执行 secret redaction。

### 兼容与回滚

- 密码迁移采用“新列 -> 双读单写 -> backfill -> 非空约束 -> 删除旧列”步骤。
- session schema 发布时主动撤销旧 session，要求用户重新登录，避免长期双协议。
- Secret adapter 切换前先验证所有 reference 可解析；失败时阻止启用对应 Model Configuration 或 MCP Server。

### 验收标准

- PostgreSQL dump 中不能搜索到测试输入的原始密码、原始 session token 或 API key。
- session 到期、账号禁用、管理员撤销和密码变更都会使现有 session 失效。
- 登录失败有速率限制和审计记录，但不会泄露账号是否存在。
- XSS 无法通过 `document.cookie` 或 `localStorage` 读取认证 token。
- Secret Manager 不可用时，依赖该 secret 的 Agent readiness 失败，不返回明文错误。

## HARD-003：持久化 Integration Configuration

### 当前证据

`SearchProviderStore` 和 `PageReadProviderStore` 在模块初始化时创建内存字典。Administrator Console 的更新只影响当前 API 进程；Celery worker、其他 API 实例和重启后的进程看不到更新。

### 目标设计

Integration Configuration 由 PostgreSQL 作为唯一事实来源。Search 与 Page Read 保持独立领域概念，但共用少量真正跨领域的配置原语，例如 credential reference、timeout、enabled、health status。

### 实施步骤

1. 为 Search Provider Configuration 与 Page Read Provider Configuration 建立 SQLAlchemy record 和 Alembic migration。
2. 为默认 Doubao/Jina 配置增加幂等 bootstrap，不在模块 import 时创建状态。
3. API 与 Worker 通过 repository interface 在每次 Run preparation 时读取配置，并写入 Run Capability Snapshot。
4. snapshot 保存非敏感运行参数和 credential reference；不保存 secret value。
5. 更新配置时写 Administrator Audit，并使 readiness 与 health status 立即可见。
6. 删除通用内存 `ProviderConfigurationStore`，测试改用 repository adapter，而不是复刻生产状态管理。

### 验收标准

- API 实例 A 修改配置后，独立 Worker 进程执行的下一个 Run 使用新配置。
- API/Worker 重启后配置不丢失。
- Run 开始后修改配置不会改变该 Run 的 snapshot。
- PostgreSQL 集成测试覆盖创建、更新、并发读取、禁用和审计。

## HARD-004：实现真实 Search、Page Read 与 MCP adapter

### 当前证据

- Search 使用 `_build_mock_results`。
- Page Read 使用 `_build_mock_content`。
- MCP discovery 固定创建 `mcp.research.search` 和 `mcp.research.fetch`。
- 非 Hosted MCP 路径只返回“tool completed”，没有发起 MCP 调用。

### 目标 interface

```python
class SearchAdapter(Protocol):
    async def search(self, request: SearchRequest) -> SearchResult: ...

class PageReadAdapter(Protocol):
    async def read(self, request: PageReadRequest) -> PageReadResult: ...

class McpClientAdapter(Protocol):
    async def discover_tools(self, server: McpServerConfig) -> list[McpTool]: ...
    async def invoke(self, request: McpInvokeRequest) -> McpInvokeResult: ...
```

Agent Tool Gateway 负责授权、凭据解析、安全投影、超时、错误翻译和事件记录；provider adapter 只负责协议交互。

### 实施步骤

1. 实现真实 Doubao Search adapter，解析 provider response 为稳定的 Search Result schema。
2. 实现真实 Jina Reader adapter，正确拼接 endpoint、认证 header、超时、内容长度和 allowed domains。
3. 对 Page Read 增加 SSRF 防护：DNS/IP 校验、重定向重新校验、拒绝 loopback/link-local/private network，除非管理员明确允许受控内网域。
4. 使用 MCP SDK 对 SSE/streamable HTTP server 执行真实 initialize、tools/list 与 tools/call。
5. discovery 采用“获取新清单 -> 校验 -> 单事务替换/标记下线”，不能在失败时覆盖上一次成功清单。
6. MCP Tool Authorization 绑定 server id、tool name 和可选 schema fingerprint；schema 改变时要求重新确认或明确显示 drift。
7. 所有外部调用统一支持 timeout、有限重试、错误分类、request id 和敏感字段 redaction。
8. 删除生产路径中的 mock builder。Mock 只保留为隔离单元测试 adapter。

### 验收标准

- 使用真实 provider credential 完成搜索和页面读取，并在 Agent Conversation 中看到真实来源、Tool Call 和结果。
- 使用本地启动的真实 MCP Server 完成 discovery、授权、调用和审计，不接受硬编码工具清单作为证据。
- provider 返回 401、429、5xx、超时和无效 schema 时，Run 得到稳定错误，不泄露 credential。
- API 与 Worker 使用同一配置，真实调用结果可从 Run Audit 追溯到 provider 和 server。

## HARD-005：用数据库保护 Agent Run 不变量

### 当前证据

- 核心 runtime 表没有外键。
- Agent Conversation Message 和 Agent Run Event 使用“查询最大 sequence + 1”，没有联合唯一约束。
- “每个会话一个活动 Run”使用先查询后插入，存在并发窗口。
- queue、message、conversation status、run、event 分别打开并提交 Session。
- Artifact 写 MinIO、Artifact metadata、Conversation Message 也不是一个可恢复工作流。

### 目标设计

`RunService` 成为创建和迁移 Agent Run 状态的唯一外部 seam。Repository 接受调用方提供的 Session，不再由每个 store 自行创建和提交事务。

### 数据库约束

至少增加：

- Conversation -> Local Account、Agent、Model Configuration 外键。
- Message -> Conversation 外键，`UNIQUE(conversation_id, sequence)`。
- Run -> Conversation、Local Account 外键。
- Event -> Run 外键，`UNIQUE(run_id, sequence)`。
- Artifact/Run Attachment -> Conversation/Run 外键。
- MCP discovered tool/authorization -> MCP Server/Agent 外键。
- PostgreSQL partial unique index：同一 conversation 在 `queued|running` 状态最多一条 Run。
- Run 增加 `version` 或使用条件更新保护状态转换。

### 实施步骤

1. 先扫描并修复现有孤儿、重复 sequence 和多活动 Run 数据，再添加约束。
2. 将字符串形式的“just now”替换为 timezone-aware `created_at`、`updated_at`、`started_at`、`finished_at`。
3. 增加 `agent_conversations.next_message_sequence` 与 `agent_runs.next_event_sequence`，使用 `UPDATE ... RETURNING` 原子分配 sequence，或使用等价的行锁方案。
4. `queue_for_conversation` 在一个事务中完成 active-run 约束、User Message、Conversation 状态、Run 和首个 Event。
5. 状态迁移使用 compare-and-set，例如只允许 `running -> completed`，并检查 version/cancel request。
6. 引入最小 outbox：Run 与 dispatch intent 同事务提交；dispatcher 发送 Celery task 后标记 delivered；reconciler 重试未投递项。
7. Artifact 使用“pending metadata -> object upload -> ready metadata -> message/event”的可恢复状态机，并增加孤儿对象清理。

### 验收标准

- 两个并发请求只能创建一个活动 Run，另一个稳定返回 409。
- 多 Worker 并发追加事件时 sequence 唯一且连续可排序。
- 在每个事务步骤注入失败，数据库不会留下 conversation running 但无 Run 等半完成状态。
- Celery broker 短暂不可用后，outbox 能最终投递且不会创建重复 Run。
- 删除或更新引用对象时由外键和明确的 delete policy 阻止孤儿数据。

## HARD-006：实现可证明的 Run Cancellation

### 当前证据

取消 endpoint 只把 Run 写为 cancelled 并释放 Conversation。Celery task 没有被撤销，`Runner.run_sync` 运行期间也不检查取消；运行结束后 success path 可以重新写 completed。

### 目标状态机

```text
queued -> running -> completed
  |          |
  v          v
cancel_requested -> cancelled
  |
  v
failed_to_cancel
```

`cancel_requested` 是持久状态，不把“用户已请求”和“底层工作已停止”混为一谈。

### 实施步骤

1. Run 增加 `celery_task_id`、`cancel_requested_at`、`cancelled_at`、`version`。
2. API 原子写入 cancel request，并向 Redis 发布取消信号。
3. Worker 在模型调用前后、每个 streamed event、每次工具调用前后检查取消状态。
4. 优先使用可取消的 async/streamed Runner；将 blocking provider 调用放到可终止的隔离执行单元。
5. 普通取消使用协作式终止；`revoke(terminate=True)` 只作为专用 Worker pool 的超时兜底，不能误杀共享工作。
6. success/failure commit 使用条件更新；状态不是 running 时不得覆盖 cancelled。
7. 取消后停止发出新的 message/tool/artifact 事件，但保留已经持久化的部分结果。
8. SSE 在确认 cancelled 后发送终态并关闭订阅。

### 验收标准

- queued Run 取消后不会开始模型调用。
- running Run 在限定时间内停止产生 token、Tool Call 和计费请求。
- 模拟“取消与模型完成同时发生”时，最终状态只能有一个，cancelled 不会被 completed 覆盖。
- Worker 崩溃或取消信号丢失后，reconciler 能根据持久 cancel request 修正状态。

## HARD-007：实现真实可恢复的 AG-UI SSE

### 当前证据

`GET /runs/{run_id}/events` 只读取一次 PostgreSQL 事件并立即结束 response。前端依赖 EventSource 自动重连形成轮询，并把 bearer token 放进 `access_token` 查询参数。`onerror` 仍把状态标记为 connected。

### 目标设计

SSE endpoint 执行三个阶段：

1. 从 PostgreSQL 回放 `sequence > last_seen_sequence` 的持久事件。
2. 订阅 Redis Streams/pubsub 的新事件并持续发送 heartbeat。
3. 收到终态、客户端断开或服务关闭时清理订阅。

PostgreSQL 始终是恢复与审计事实来源，Redis 只负责低延迟 fanout，符合 ADR-0036。

### 实施步骤

1. 浏览器认证改用 HttpOnly cookie；若仍需 bearer 模式，增加短期、单 Run、一次用途的 stream ticket。
2. 禁止 session token 出现在 URL、日志和 referrer。
3. endpoint 改为 async generator，先 replay，再消费 Redis 热流。
4. 每 15-30 秒发送 comment heartbeat，代理层关闭 buffering。
5. 事件写 PostgreSQL成功后再发布 Redis；客户端去重仍以 `(run_id, sequence)` 为准。
6. Redis 不可用时降级为有限频率的 PostgreSQL tail，但必须显示 degraded 状态。
7. 前端正确区分 connecting、connected、reconnecting、degraded、closed、failed。
8. Last-Event-ID 与本地 last seen 只保存非敏感 sequence；终态后清理无用状态。

### 验收标准

- 一个长 Run 只建立一个持续 SSE 连接，不依赖每几秒重连获取新事件。
- 断网后携带 Last-Event-ID 恢复，不丢失、不重复渲染事件。
- API 重启和 Redis 重启后能从 PostgreSQL 恢复。
- 访问日志、浏览器地址、历史和 referrer 中没有 session token。
- 100 个并发订阅下连接数、数据库查询频率和事件延迟有可接受的测量结果。

## HARD-008：落实保留策略、健康检查与 Worker 可靠性

### 当前证据

- `FULL_TRACE_RETENTION_DAYS = 90` 只用于 response 文案，没有基于时间的删除任务。
- Run Audit 的更新时间仍显示“just now”。
- `/health` 不检查 PostgreSQL、Redis、MinIO 或 Worker。
- Celery task 没有显式 retry、timeout、acks、worker-lost 或幂等策略。

### 实施步骤

1. Run 增加真实时间字段与 `full_trace_expires_at`。
2. Celery Beat 或独立 maintenance command 分批清理过期 Full Trace，并记录扫描、删除、失败数量。
3. Artifact 与 Run Attachment 保留策略单独定义，不与 Full Trace 误删绑定。
4. 增加 `/health/live` 与 `/health/ready`：liveness 不访问依赖，readiness 检查 PostgreSQL、Redis、MinIO 和必要配置。
5. Worker 增加独立 readiness/heartbeat 观测，不把 task 函数返回值当健康检查。
6. 配置 `acks_late`、`task_reject_on_worker_lost`、soft/hard time limit、有限重试和 retry backoff；每个 task 必须幂等。
7. 统一结构化日志字段：request_id、run_id、conversation_id、user_id、agent_id、task_id、provider、tool_name。
8. 增加核心指标：queue latency、run duration、模型/工具错误率、取消耗时、SSE reconnect、outbox backlog、retention backlog。

### 验收标准

- 人工构造过期 Full Trace 后，清理任务删除 trace 且保留 Run Audit 摘要。
- PostgreSQL、Redis 或 MinIO 任一必要依赖不可用时 readiness 返回失败并指出依赖类别。
- Worker 在模型调用中崩溃后，任务不会静默丢失，也不会重复提交 assistant message。
- 日志和指标可以从 HTTP request 追踪到 Celery task、模型调用和 Tool Call。

## HARD-009：按垂直切片恢复深模块

### 当前证据

- `apps/web/src/routes/planned-pages.tsx` 约 4925 行，同时包含路由页面、API 类型、表单序列化、状态和视图。
- `apps/api/app/runtime.py` 约 1561 行，同时处理 provider route、Sandbox、SDK event 翻译、trace 和执行流程。
- 大多数后端业务仍在 `apps/api/app/*.py`；`features` 主要是路由包装。

### 迁移原则

- 不做一次性目录重排。
- 每次只围绕一个已经要修复的垂直切片建立新 seam。
- 新模块通过外部 interface 测试；旧根模块只保留薄 shim，调用方迁完后删除。

### 推荐顺序

1. `features/runs`：状态机、service、repository、event stream、Celery adapter。
2. `features/integrations`：Search、Page Read、MCP 与 Secret resolver。
3. `features/auth`：credential、session、account approval。
4. `features/admin` 前端：按 agents/models/mcp/search/page-read/run-audit 拆页面与 query/mutation。
5. `features/workspace`：保留现有工作台模块，逐步缩小 CopilotKit adapter interface。

### 验收标准

- route 只做鉴权、schema 转换、调用 use case 和 response 映射。
- domain 不依赖 FastAPI、SQLAlchemy、Celery 或具体 SDK。
- service 不自行创建全局依赖；repository/adapter 通过构造或函数参数注入。
- 删除一个 adapter 后，复杂度只在对应 seam 后重新出现，不散落到多个调用者。
- 每次迁移前后接口行为和真实环境测试保持一致。

## HARD-010：建立真实环境发布门禁

### 测试分层

| 层级 | 目的 | 允许 mock | 最终证据 |
| --- | --- | --- | --- |
| Domain unit | 状态机、校验、投影 | 是 | 否 |
| Adapter contract | provider schema、错误映射 | 仅受控 fault injection | 否 |
| PostgreSQL integration | 事务、锁、约束、migration | 否 | 是 |
| Local stack integration | API、Worker、Redis、MinIO | 否 | 是 |
| Provider smoke | 真实模型/Search/Page Read/MCP/Sandbox | 否 | 是 |
| Browser E2E | 注册审批、配置、对话、取消、恢复、审计 | 否 | 是 |

### 必需场景

1. 注册 -> 管理员审批 -> 登录。
2. 创建真实 Model Configuration -> health check -> Agent readiness。
3. 新建 Agent Conversation -> Celery Agent Run Worker -> 真实模型响应。
4. Search -> Page Read -> Tool Call -> 引用来源展示。
5. MCP discovery -> authorization -> invoke -> Run Audit。
6. Sandbox 生成文件 -> MinIO Artifact -> 前端预览，同时证明隔离边界。
7. 页面离开/断网 -> Background Agent Run 继续 -> Stream Resume。
8. running Run 取消 -> 底层停止 -> 最终 cancelled。
9. API/Worker/Redis 重启 -> outbox、事件和 Run 状态恢复。
10. Full Trace 仅管理员可见，并按 expires_at 清理。

### CI 建议

- PR 必跑：lint、typecheck、unit、PostgreSQL integration、migration upgrade/downgrade/upgrade、浏览器核心 E2E。
- 受保护环境必跑：真实 provider smoke，需要人工管理 credential 与成本上限。
- nightly：并发 Run、SSE reconnect、Worker crash、retention、Sandbox isolation。
- 发布必须记录真实环境测试版本、配置摘要、Run id 和结果；mock 测试不能替代发布证据。

## 建议的 GitHub Issues

下列 issue 按可独立验收的垂直切片拆分。创建时使用 `ready-for-agent` 仅限规格完整、无需外部凭据或人工安全决策的任务；真实 provider credential、生产 Secret Manager 和生产 Sandbox 选型应使用 `ready-for-human`。

| 顺序 | 建议标题 | 依赖 | 建议标签 | 完成定义 |
| --- | --- | --- | --- | --- |
| 1 | `[P0] Block UnixLocalSandbox outside explicit development mode` | 无 | `ready-for-agent` | 生产配置无法回退 local，测试覆盖启动与 readiness |
| 2 | `[P0] Restore per-Agent Sandbox Capability Policy` | 1 | `ready-for-agent` | 未授权 Agent 无 Sandbox tools，snapshot 与 UI 一致 |
| 3 | `[P0] Hash Local Account passwords and migrate existing records` | 无 | `ready-for-agent` | 数据库无明文密码，Argon2id 验证与迁移测试通过 |
| 4 | `[P0] Replace raw bearer sessions with expiring hashed sessions` | 3 | `ready-for-agent` | 数据库无原始 token，过期/撤销完整 |
| 5 | `[P0] Introduce SecretResolver and encrypted/external secret adapter` | 无 | `ready-for-human` | 生产凭据不以明文进入 PostgreSQL |
| 6 | `Persist Search and Page Read Provider Configurations` | 无 | `ready-for-agent` | API/Worker/重启共享同一配置 |
| 7 | `Implement real Doubao Search and Jina Page Read adapters` | 5、6 | `ready-for-human` | 真实 credential smoke 与错误场景通过 |
| 8 | `Implement real remote MCP discovery and invocation` | 5 | `ready-for-agent` | 本地真实 MCP Server 完成 discovery/call/audit |
| 9 | `Add relational constraints and active-run partial unique index` | 无 | `ready-for-agent` | 无孤儿、重复 sequence 或并发双 Run |
| 10 | `Make Agent Run queueing and event append transactional` | 9 | `ready-for-agent` | fault injection 不产生半完成状态 |
| 11 | `Add Agent Run dispatch outbox and recovery worker` | 10 | `ready-for-agent` | broker 故障后最终投递且幂等 |
| 12 | `Implement cooperative Run Cancellation with CAS terminal states` | 9、10 | `ready-for-agent` | running Run 可停止，cancelled 不被覆盖 |
| 13 | `Replace snapshot SSE with replay plus Redis hot fanout` | 9、10 | `ready-for-agent` | 持续连接、断线恢复、Redis 降级通过 |
| 14 | `Remove session tokens from SSE URLs` | 4、13 | `ready-for-agent` | URL/日志/referrer 无 token |
| 15 | `Enforce Full Trace retention with scheduled cleanup` | 9 | `ready-for-agent` | 90 天策略可执行、可观测 |
| 16 | `Add dependency readiness and Celery reliability policy` | 11 | `ready-for-agent` | 依赖故障和 worker-lost 场景可检测、可恢复 |
| 17 | `Create real local-stack browser E2E workflow` | 6、8、10、12、13 | `ready-for-agent` | 非 mock 核心闭环进入 CI |
| 18 | `Select and validate the production Sandbox adapter` | 1、2、5 | `ready-for-human` | 隔离、资源、网络、清理和 Artifact 闭环通过 |

## 推荐实施里程碑

### Milestone 0：停止扩大风险

- 完成 Issues 1-5。
- 当前 Sandbox 默认启用改动在 Issues 1、2 完成前不进入发布分支。
- 禁止任何面向外部用户的部署。

退出条件：生产 profile 不存在 host/local command execution fallback；数据库不再新增明文密码、token 或 secret。

### Milestone 1：把能力变成真实 adapter

- 完成 Issues 6-8。
- Administrator Console、API 和 Worker 共享持久配置。
- Search、Page Read、MCP 不再返回模拟成功。

退出条件：真实模型与三类外部能力完成可审计 Agent Conversation。

### Milestone 2：保证 Run 正确性

- 完成 Issues 9-14。
- 建立数据库不变量、事务、outbox、取消与持续 SSE。

退出条件：并发、断网、broker 故障、取消竞争和服务重启测试通过。

### Milestone 3：建立生产运维与发布证据

- 完成 Issues 15-18。
- 在修复对应切片时逐步执行 HARD-009 的模块迁移，不单独发起大爆炸式重构。

退出条件：健康、保留、可观察性、真实 E2E 和生产 Sandbox 验证成为发布门禁。

## 明确不采用的方案

- 不把所有修复合并成一次大 PR。
- 不用更多 mock 测试证明真实 provider 已完成。
- 不在生产环境静默回退到 SQLite、内存配置、fake provider 或 local Sandbox。
- 不用 Celery result backend 代替 PostgreSQL Agent Run 状态。
- 不让 Redis 成为唯一事件事实来源。
- 不把所有 Integration Configuration 塞进一个无类型 JSON 表。
- 不为目录整洁先做全仓库搬迁，再开始修复行为。
- 不把 bearer token 放入 SSE URL 来绕过 EventSource header 限制。

## 决策与文档维护

实施过程中需要：

- 更新 ADR-0016，明确开发 Sandbox 与生产 Sandbox adapter 的区别；如果生产选型改变原决策，新增 superseding ADR。
- 保持 ADR-0034、ADR-0036、ADR-0037、ADR-0038 的方向，不用新 ADR 掩盖当前实现缺口。
- 生产 Secret Manager 选型确定后新增 ADR，记录 threat model、密钥轮换和不可用策略。
- 每个 issue 完成后更新本文件的状态和验证证据；只有真实环境验收完成后才能标记对应 HARD 项关闭。
