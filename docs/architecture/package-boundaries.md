# 分包与编码规范

本文档定义 Minimalist Agent 的生产级分包、依赖方向与编码规范。它适用于后端 `apps/api`、前端 `apps/web`，以及未来新增的服务和共享模块。

## 总则

1. 以 `feature` 为第一分包维度，再在 feature 内部分层。
2. 接口保持小而深，内部实现可以复杂，但不要把复杂度暴露给调用方。
3. 任何跨模块协作都必须经过明确 seam，不允许直接穿透到别的模块内部。
4. `main`、启动脚本和路由装配只负责组装，不写业务规则。
5. `shared` 只能放真正的跨领域原语，不放业务流程。
6. 新代码优先进入规范目录，旧的扁平模块只作为迁移期兼容层。

## 后端分包规范

后端建议按下面的形状组织：

```text
apps/api/app/
  main.py
  shared/
  features/
    auth/
    agents/
    conversations/
    runs/
    artifacts/
    admin/
    integrations/
```

每个 feature 内部推荐这样分层：

```text
features/<name>/
  routes.py
  schemas.py
  service.py
  domain.py
  repository.py
  adapters.py
  tests/
```

职责划分：

- `routes.py`：HTTP seam，只做鉴权、参数解析、调用 use case、返回响应。
- `schemas.py`：请求和响应模型，只描述 seam 输入输出。
- `service.py`：应用层，编排流程、事务、校验顺序。
- `domain.py`：领域层，放实体、枚举、状态转换、不变量。
- `repository.py`：持久化 adapter。
- `adapters.py`：外部系统 adapter，例如对象存储、Celery、第三方 SDK。

依赖方向必须是：

- `routes -> service -> domain`
- `service -> repository/adapters`
- `domain -> 无外部依赖`
- `shared -> 只能被上层依赖，不能反向依赖 feature`

禁止事项：

- 路由直接访问数据库、对象存储、队列或第三方 SDK。
- service 直接拼 SQL、拼 HTTP 请求或操作框架全局对象。
- 一个 feature 直接导入另一个 feature 的内部实现文件。
- `domain.py` 依赖 FastAPI、Celery、HTTP 客户端或 ORM。

迁移期规则：

- 现有 `apps/api/app/*.py` 可以保留，但只允许作为薄 shim。
- 新增功能不得继续往扁平根目录堆文件。
- 当一个扁平模块开始同时承担路由、规则和适配时，先拆成 feature package，再继续开发。

## 前端分包规范

前端建议按下面的形状组织：

```text
apps/web/src/
  app/
  routes/
  features/
  shared/
```

推荐职责：

- `app/`：应用装配、全局 provider、路由挂载、启动逻辑。
- `routes/`：页面级模块，只负责页面组合和路由参数。
- `features/<name>/`：单个业务能力的状态、视图模型、交互逻辑、页面片段。
- `shared/ui/`：可复用的基础 UI 原语。
- `shared/api/`：类型化接口客户端。
- `shared/lib/`：纯工具函数、格式化、常量、类型辅助。

依赖方向必须是：

- `app -> routes -> features -> shared`
- `shared` 不能依赖任何 feature 或 route
- feature 之间不要互相抓内部实现，最多依赖对方公开的 seam

页面模块规则：

- 页面模块只做布局拼装，不写复杂业务状态机。
- 交互逻辑优先下沉到 feature 模块。
- API 调用优先放进 `shared/api` 或 feature 专属 client，不要散落在页面细节里。

## 命名规则

### Python

- 文件名使用 `snake_case.py`。
- 类型、类、枚举使用 `PascalCase`。
- 函数名使用动词开头，表达一个明确动作。
- 布尔值命名要能直接读出来，例如 `is_default`、`can_run`、`has_access`。

### TypeScript / React

- 文件名继续使用 `kebab-case.ts` / `kebab-case.tsx`。
- 组件和 hook 使用 `PascalCase` / `useXxx`。
- 导出名要稳定，避免同义词四处漂移。
- 共享类型集中到可复用模块，不在页面文件里反复重写。

### 通用

- 一个文件只承载一个清晰的 seam 或一个紧密相关的模块群。
- 不要用 `utils`、`helpers`、`misc` 当作永久收纳箱。
- 不要用缩写命名业务概念，除非仓库里已经形成稳定约定。

## 编码规则

1. 优先写纯函数，把副作用留在 seam 边缘。
2. 依赖通过参数传入，不要在函数内部偷偷 new 出来。
3. 业务规则放在最靠近概念本身的模块里。
4. 公开函数、公开类型和 seam 输入输出要写清楚不变量。
5. 错误在 seam 处翻译成用户或调用方能理解的形式。
6. 不写跨层穿透的临时逻辑，哪怕它只是一行。
7. 不在同一个模块里混放太多职责，除非它确实是一个深模块。
8. 代码注释默认使用简体中文，且只解释代码无法直接表达的信息；注释规范见 [ADR-0046](../adr/0046-chinese-code-commenting-standard.md)。

## 测试规则

- `domain` 和 `service` 优先写单元测试。
- `routes` 和 `routes` 级页面优先写 seam 测试。
- 外部 adapter 通过替身或契约测试验证。
- 不要只测内部实现细节；优先测接口和可观察行为。
- 对跨模块行为，测试应尽量落在最稳定的 seam 上。

## 落地顺序

1. 新能力先建 feature package。
2. 再把 route / page 薄化。
3. 最后把共享原语抽进 `shared`。
4. 旧的扁平模块只在迁移窗口保留，迁完就删。
