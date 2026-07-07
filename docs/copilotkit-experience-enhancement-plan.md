# CopilotKit experience enhancement implementation plan

## 结论

Minimalist Agent 可以继续纳入 CopilotKit v2 的 suggestions、activity renderers、tool-call renderers、Human-in-the-Loop、Open Generative UI / A2UI 和 threads 相关能力，但纳入方式必须服从现有平台治理边界：

- CopilotKit 负责前端交互体验、消息渲染、建议入口、UI-only frontend tools、activity / card / tool-call 展示。
- Minimalist Agent 后端继续负责 Agent Conversation、Agent Run、Agent Capability Policy、Agent Tool Gateway、Run Audit、Full Trace、Artifact storage、Card Schema Registry 和权限判断。
- OpenAI Agents SDK 继续负责后端 Agent Runtime。CopilotKit 不替代后端 runtime，不持有模型凭据，不绕过工具授权。
- AG-UI SSE 仍是前后端 Agent Event Protocol。`/api/copilotkit` 仍是协议 adapter，不成为新的业务治理核心。

本计划不要求一次性引入全部 SDK 能力。建议先做低风险体验增强，再做需要后端状态机支持的人机确认，最后再评估 CopilotKit Intelligence / durable threads 和 Open Generative UI 的生产可用范围。

## 背景

现有文档已经确定 CopilotKit-native UI 是 Conversation Workspace 的前端体验层：

- `docs/adr/0041-copilotkit-frontend-experience-layer.md`
- `docs/copilotkit-native-openai-agents-runtime-design.md`

当前实现已经具备：

- `CopilotKitWorkspaceProvider` 指向 `/api/copilotkit`。
- 前端使用 `@copilotkit/react-core/v2`、`CopilotChatView`、`useAgent`、`useFrontendTool`、`useAgentContext`、`useAttachments`、`renderCustomMessages`。
- 后端提供 `/copilotkit/info`、`/copilotkit/agent/{id}/connect`、`/run`、`/stop/{thread_id}`。
- 后端 CopilotKit adapter 会创建或续接 Agent Conversation，创建 Agent Run，并将 runtime event 翻译为 AG-UI SSE。

本计划补齐的是 CopilotKit 当前 SDK 中尚未充分纳入的体验能力。

## 能力适配判断

| SDK 能力 | 推荐状态 | 判断 |
| --- | --- | --- |
| Suggestions | 优先纳入 | 低风险，能提升空状态和 follow-up 体验，必须从 Agent Capability Policy 派生建议。 |
| Reasoning / activity renderers | 优先纳入 activity renderers | 展示过程摘要、工具进度、Artifact 创建等安全事件；不展示 hidden chain-of-thought。 |
| Tool-call renderers | 优先纳入 | 用于展示后端 Tool Call 进度和结果摘要，不执行工具。 |
| Human-in-the-Loop | 中期纳入 | 需要后端 AgentRunInterrupt 状态机，不能只靠前端 `respond()` 承担授权。 |
| Open Generative UI / A2UI | 实验性纳入 | 只放在管理员或实验能力中，默认关闭，sandbox functions 只允许只读或 UI-only 动作。 |
| useThreads | 暂不接管主线 | 当前 runtime 是自建 FastAPI SSE，不是 CopilotKit Intelligence thread backend；继续以 Minimalist Conversation Store 为主数据源。 |

## 目标架构

新增一个前端深模块，集中注册 CopilotKit 体验能力，避免把 SDK hook 散落到多个页面：

```text
apps/web/src/shared/copilotkit-experience.tsx
```

建议接口：

```tsx
type CopilotExperienceProviderProps = {
  children: React.ReactNode;
  enableOpenGenerativeUi?: boolean;
};
```

职责：

- 提供稳定的 `renderCustomMessages`。
- 提供稳定的 `renderActivityMessages`。
- 注册通用 tool-call renderers。
- 挂载全局 Human-in-the-Loop host。
- 在实验开关开启时配置 `openGenerativeUI` / A2UI。
- 不读取或突变后端治理对象。

`CopilotKitWorkspaceProvider` 继续负责 runtime URL、headers、credentials、error handler 和 CopilotKit Provider 本身。

## 阶段 1：CopilotKit Experience 模块

### 范围

新增 `copilotkit-experience.tsx`，并由 `CopilotKitWorkspaceProvider` 或其子节点挂载。

模块内先集中：

- `minimalistRichMessageRenderer`
- activity renderer 数组占位
- tool-call renderer host 占位
- suggestions host 占位
- HITL host 占位

### 设计约束

- 所有 renderer 数组必须 `useMemo` 或模块级常量，避免 Provider 稳定性警告。
- 不在 renderer 的 render 函数里做副作用。
- renderer 复用现有 shadcn/ui 组件和既有 message/card UI。
- 不引入新的后端权限路径。

### 验收

- `CopilotKitWorkspaceProvider` 测试覆盖 runtime URL、Authorization header、`useSingleEndpoint={false}` 和新体验能力注册。
- 前端 typecheck 能通过。
- 现有 CopilotKit runtime 后端测试不需要改动。

## 阶段 2：Suggestions

### 范围

在 Conversation Workspace 纳入 CopilotKit suggestions。优先做静态或规则派生 suggestions，动态 LLM suggestions 后置。

建议新增：

```text
apps/web/src/features/workspace/copilot-workspace-suggestions.tsx
```

输入：

- 当前 Agent。
- 当前 Conversation。
- 最新 Run 状态。
- 当前 Artifact Preview 状态。
- Agent Capability Policy 摘要。

输出：

- `useConfigureSuggestions(...)` 注册的建议。

### 建议规则

空对话：

- `帮我规划一个办公任务`
- `总结这次任务目标并给出步骤`

已有消息：

- `继续刚才的任务`
- `把上一次回复整理成行动清单`

最新 Run 失败：

- `解释这次运行失败的原因`
- `给我一个重试前检查清单`

当前有 Artifact：

- `总结当前制品`
- `检查当前制品是否缺少关键内容`

能力相关建议：

- Search 只有在 `search_enabled` 时出现。
- Page Read 只有在 `page_read_enabled` 时出现。
- Sandbox 只有在 `sandbox_enabled` 时出现。
- MCP 相关建议只基于 Agent 已授权 MCP tools 出现。

### 非目标

- 不让 suggestions 变成工具开关。
- 不在用户无权使用某能力时提示该能力。
- 不在 active run 期间刷新动态 suggestions。

### 验收

- 空对话能显示 starters。
- 有 Artifact 时显示 Artifact 相关建议。
- Run failed 时显示失败排查建议。
- 关闭某项 capability 后，不出现对应建议。
- 点击 suggestion 后走当前 `CopilotChatView` submit 路径。

## 阶段 3：Activity 和 Tool-call Renderers

### 范围

后端新增安全事件翻译层：

```text
apps/api/app/copilotkit_event_translator.py
```

前端新增 renderer：

```text
apps/web/src/shared/copilotkit-activity-renderers.tsx
apps/web/src/shared/copilotkit-tool-renderers.tsx
```

### 后端事件类型

建议先支持这些 activity：

| activity type | 来源 | 内容 |
| --- | --- | --- |
| `minimalist.run.phase` | Agent Run lifecycle | queued、running、finalizing、completed、failed、cancelled |
| `minimalist.tool.progress` | Tool Call event | tool name、status、safe input/output 摘要、provenance |
| `minimalist.artifact.created` | Artifact event | artifact id、filename、preview type |
| `minimalist.process.summary` | Process summary | 后端生成的安全过程摘要 |
| `minimalist.policy.notice` | Capability policy | 能力不可用、工具被策略拒绝等安全提示 |

### 安全边界

- activity payload 只包含 safe payload。
- 不包含 raw Full Trace。
- 不包含 provider request/response 原文。
- 不包含 hidden chain-of-thought。
- Tool safe input/output 继续由后端清洗。

### 前端展示

- Run phase 用轻量状态行。
- Tool progress 用折叠式工具卡。
- Artifact created 复用现有 Artifact Reference UI。
- Process summary 用简短步骤条。
- Policy notice 用中性提示，不渲染成错误堆栈。

### 验收

- `/copilotkit/agent/{id}/run` 能在 SSE 中输出 activity message。
- 前端能在消息流中渲染 activity。
- Activity payload schema mismatch 时有测试覆盖。
- Run Audit 仍能看到完整后端记录，普通 User 只看到安全摘要。

## 阶段 4：Human-in-the-Loop

### 关键判断

不能只在前端加 `useHumanInTheLoop` 就认为完成了人机确认。前端 `respond()` 只能解决 CopilotKit run 内的 Promise，不应该成为 Minimalist Agent 的授权事实来源。

必须先建立后端状态机。

### 后端模型

新增 Agent Run Interrupt 概念：

```text
AgentRunInterrupt
- id
- run_id
- conversation_id
- owner_user_id
- interrupt_type
- title
- safe_payload
- status: requested | approved | rejected | expired | cancelled
- requested_at
- responded_at
- responded_by_user_id
- decision_reason
```

### 后端接口

建议新增：

```text
GET /conversations/{conversation_id}/runs/{run_id}/interrupts
POST /conversations/{conversation_id}/runs/{run_id}/interrupts/{interrupt_id}/respond
```

响应动作：

- approve
- reject
- cancel_run

### 适用场景

优先接入这些确认：

- 执行高影响 Sandbox 操作。
- 读取或导出敏感 Artifact。
- 使用远程 MCP tool 进行外部副作用动作。
- 归档、删除、取消等改变用户工作区状态的动作。

不适合作为 HITL 的场景：

- 普通 UI 导航。
- 打开 Artifact Preview。
- 过滤 Run Audit。
- 只读 Search / Page Read。

这些仍然用 UI-only `useFrontendTool` 即可。

### 前端实现

新增：

```text
apps/web/src/shared/copilotkit-human-in-the-loop.tsx
```

职责：

- 渲染待确认请求。
- 使用 shadcn dialog/alert dialog。
- 所有 approve/reject 都调用后端 respond 接口。
- 成功后再调用 CopilotKit `respond()` 或刷新 run state。
- 组件 unmount 时不能让 run 永久挂起；需要 cancel 或恢复提示。

### 超时和恢复

- Interrupt 必须有超时策略。
- 页面刷新后可以从后端恢复 pending interrupts。
- active run 被取消时，pending interrupts 进入 `cancelled`。

### 验收

- Pending interrupt 刷新页面后仍可见。
- Approve/reject 写入 Run Audit。
- 不响应不会永久锁住 run。
- 非授权用户不能响应别人的 interrupt。
- 普通 UI-only frontend tools 不产生 interrupt。

## 阶段 5：Open Generative UI / A2UI 实验纳入

### 推荐定位

Open Generative UI 不进入默认用户对话主路径。建议放在：

- Administrator Console 的 Artifact/Card UI Preview Lab。
- 或只对启用实验能力的 Agent 开放。

新增 capability：

```text
open_generative_ui_enabled: boolean
```

默认值为 `false`。

### Provider 配置

只有实验能力开启时才传入：

```tsx
openGenerativeUI={{
  sandboxFunctions,
  designSkill,
}}
```

`sandboxFunctions` 初期只允许：

- `openArtifactPreview`
- `focusRunAudit`
- `copySafeSummary`

禁止：

- 直接调用后端 mutation API。
- 读取 raw Full Trace。
- 读取 credential、secret、provider config。
- 执行 sandbox host 操作。
- 注册或授权 MCP server/tool。

### A2UI 优先方向

相比自由生成 iframe UI，更推荐长期采用 A2UI / activity renderer：

- 结构化。
- 可 schema 校验。
- 更容易和 Card Schema Registry 对齐。
- 更适合审计。

Open Generative UI 可用于原型或预览，不直接成为生产 Artifact。若用户想保存，必须走后端 Card Schema Registry 校验后生成 Artifact。

### 验收

- 默认 `/copilotkit/info` 仍返回 `openGenerativeUIEnabled: false`。
- 实验 Agent 开启后，普通 User 仍只能调用只读 sandbox functions。
- 生成 UI 不能绕过后端 Artifact/Card schema 校验。
- 管理员可在 Run Audit 中看到 Open Generative UI 相关事件摘要。

## 阶段 6：Threads 策略

### 当前判断

当前项目是自建 FastAPI SSE runtime。CopilotKit `useThreads` 只适合 CopilotKit Intelligence runtime 或 self-managed Intelligence instance。直接用它替代现有 Conversation Store 会引入第二套持久化来源。

### 短期方案

不在主线启用 `useThreads`。

继续由 Minimalist 后端提供：

- conversation list
- rename
- archive / soft delete
- selected conversation
- message persistence

CopilotKit thread id 继续只是 adapter 映射：

- existing conversation: `conversation-{id}`
- draft conversation: `draft-agent-{agentId}-model-{modelId}`

### 中期方案

如果需要更像 CopilotKit thread UI，可新增前端 facade：

```text
apps/web/src/features/workspace/thread-facade.ts
```

它把 Minimalist Conversation 映射成 thread-like view model：

```ts
type WorkspaceThread = {
  id: string;
  conversationId: string;
  name: string;
  archived: boolean;
  updatedAt: string;
};
```

但后端 source of truth 仍是 Minimalist Conversation Store。

### 长期方案

只有当决定引入 CopilotKit Intelligence 时，才单独写 ADR：

- CopilotKit Thread 和 Agent Conversation 谁是主数据源。
- user identity 如何映射。
- rename/archive/delete 如何同步。
- historical messages 如何迁移。
- Run Audit 和 Full Trace 如何关联 thread。

## 推荐排期

### Sprint 1：体验模块与静态建议

交付：

- `copilotkit-experience.tsx`
- static suggestions
- provider registration tests

验证：

- 前端 typecheck。
- conversation shell tests。
- `test_copilotkit_runtime.py` 不回归。

### Sprint 2：Activity / Tool-call 展示

交付：

- `copilotkit_event_translator.py`
- run phase / tool progress / artifact created activity
- activity renderers
- dedicated tool-call renderers 或增强 default renderer

验证：

- 后端 SSE event tests。
- 前端 renderer tests。
- Run Audit 安全摘要校验。

### Sprint 3：AgentRunInterrupt 后端状态机

交付：

- interrupt model / store / routes
- run lifecycle 集成 pending interrupt
- interrupt audit

验证：

- approve / reject / timeout / cancel tests。
- 权限测试。
- 刷新恢复测试。

### Sprint 4：HITL 前端接入

交付：

- global HITL host
- shadcn dialog UI
- pending interrupt restore
- approve/reject flow

验证：

- 前端交互测试。
- 页面切换或刷新不挂死 run。
- 审计记录完整。

### Sprint 5：Open Generative UI / A2UI 实验入口

交付：

- capability flag
- admin preview lab
- read-only sandbox functions
- Open Generative UI / A2UI 事件审计摘要

验证：

- 默认关闭。
- 实验开启后不能调用 mutation。
- generated UI 保存前必须通过 Card Schema Registry。

### Sprint 6：Threads 评估

交付：

- ThreadFacade 设计或 CopilotKit Intelligence ADR 草案。
- 不直接替换现有 Conversation Store，除非 ADR 决策通过。

验证：

- conversation list 行为不回归。
- thread id mapping 与 CopilotKit run 继续稳定。

## 测试策略

后端：

- `test_copilotkit_runtime.py`
- 新增 `test_copilotkit_event_translator.py`
- 新增 `test_agent_run_interrupts.py`
- Run Audit 相关测试增加 interrupt / activity 摘要断言。

前端：

- `copilotkit-provider.test.tsx`
- `conversation-shell.test.tsx`
- 新增 suggestions host tests。
- 新增 activity renderer tests。
- 新增 HITL dialog tests。
- Open Generative UI 实验入口只测 capability gating 和 sandbox function 限制。

手工 smoke：

1. 登录普通 User。
2. 打开 Conversation Workspace。
3. 空对话显示 suggestions。
4. 发送消息，看到 run phase 和 tool progress activity。
5. 生成 Artifact 后能打开右侧 Artifact Preview。
6. 触发一个需要确认的动作，刷新页面后 pending HITL 仍可恢复。
7. approve/reject 后 Run Audit 记录决策。
8. 普通 User 无法看到 Full Trace raw payload。

## 风险和缓解

| 风险 | 缓解 |
| --- | --- |
| Suggestions 推荐了无权能力 | suggestions 只从 Agent Capability Policy 派生，测试覆盖关闭能力场景。 |
| Activity 泄露敏感 trace | 后端只输出 safe payload，Full Trace 不进入普通 message stream。 |
| HITL 前端 unmount 导致 run 挂死 | 后端 interrupt 有 timeout/cancel 状态，前端恢复 pending interrupts。 |
| Open Generative UI 生成 UI 绕过治理 | 默认关闭，只读 sandbox functions，保存前走 Card Schema Registry。 |
| useThreads 引入第二套持久化 | 短期禁用，继续以 Minimalist Conversation Store 为主。 |
| Provider renderer 数组不稳定 | renderer 数组模块级常量或 `useMemo`，测试覆盖。 |

## 暂不做

- 不用 `useThreads` 替代现有 conversation list。
- 不把 CopilotKit HITL 作为后端授权事实来源。
- 不把 Open Generative UI 默认开放给所有 User。
- 不展示 hidden chain-of-thought。
- 不允许 frontend tools 执行 Search、MCP、Sandbox、Page Read 等后端治理能力。
- 不把 Artifact body 嵌入 CopilotKit message。

## 成功标准

- 用户能在 CopilotKit-native Conversation Workspace 中获得建议、进度、工具摘要和 Artifact 入口。
- 后端治理边界没有被前端工具或生成 UI 绕过。
- Run Audit 能解释 suggestions、activity、tool progress、HITL 决策和实验 UI 的关键事件。
- 普通 User 只看到安全摘要；Administrator 仍通过受控入口查看 Full Trace。
- 后续是否采用 CopilotKit Intelligence / `useThreads` 有独立 ADR，而不是被前端 hook 使用倒逼。
