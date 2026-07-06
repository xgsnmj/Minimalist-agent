# Frontend state standardization plan

本计划落地前端状态标准化的六个阶段，目标是让 `@tanstack/react-query`、`zustand`、`sonner` 分别承担明确职责，替换现有手写请求去重、loading/error/saveStatus 和一部分分散 UI 状态。

## 边界

- 不改后端协议和接口路径。
- 不重写 CopilotKit 迁移，只接入现有 `CopilotConversationSurface`。
- 不引入 React Router，保留当前轻量路由。
- 不把 server state 放入 Zustand。

## 阶段 1：应用级 Provider

目标：建立统一 QueryClient、query key 和 toast 入口。

- 新增 `apps/web/src/app/query-client.ts`。
- 新增 `apps/web/src/app/query-keys.ts`。
- 新增 `apps/web/src/shared/notifications.ts`。
- 在应用根挂载 `QueryClientProvider` 和 `Toaster`。

验证：`pnpm --filter @minimalist-agent/web typecheck`。

## 阶段 2：移除手写 GET 去重

目标：保留 `authFetch` 的鉴权、超时和错误翻译职责，把请求去重交给 React Query。

- 删除 `auth-api.ts` 中的 `inFlightGetRequests`。
- 删除 `getInFlightRequestKey`。
- 保留 401 处理和 timeout 行为。

验证：认证相关测试仍通过。

## 阶段 3：Workspace server state 迁移到 React Query

目标：workspace agents、conversations、runs、artifact preview 和主要 mutation 由 React Query 承担。

- 新增 `workspace-queries.ts`。
- 用 query 替换 `refreshWorkspace` 内部手写 `Promise.all` 数据所有权。
- 用 mutation 替换新建草稿、重命名、取消运行、附件上传。
- Artifact preview 用 query cache，避免组件手写 preview map。

验证：conversation shell、MVP smoke 前端测试仍通过。

## 阶段 4：Workspace UI state 迁移到 Zustand

目标：跨工作台视图共享的 UI 状态进入 Zustand，server data 继续留在 React Query。

- 新增 `workspace-ui-store.ts`。
- 迁移选中对话、命令面板、搜索、草稿模型、重命名、制品预览、侧边栏、列表分页等 UI 状态。
- 保留局部、瞬时、组件私有状态在组件内。

验证：切换对话、新建对话、打开制品、命令面板行为不变。

## 阶段 5：Sonner 替换短暂反馈

目标：成功保存、复制、上传失败、运行取消失败等短暂反馈走 toast。

- 统一通过 `notify` helper 调用 `sonner`。
- 表单字段错误和页面阻塞加载错误仍保留 inline。
- mutation 成功/失败统一提示。

验证：交互测试能看到关键反馈，页面错误仍在原位置展示。

## 阶段 6：管理员页分批迁移

目标：优先替换管理员页的加载和保存反馈，不一次性重写页面结构。

- 为 admin routes 增加 query/mutation helper。
- 先迁移列表加载和保存 mutation 的状态来源。
- 用 Sonner 替换 `saveStatus` 类短暂反馈。

验证：管理员相关前端测试通过。
