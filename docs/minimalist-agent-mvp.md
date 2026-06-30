# Minimalist Agent MVP Blueprint

Minimalist Agent is a single-workspace agent platform for WorkBuddy-like agent conversations and administrator-governed agent capabilities. The MVP focuses on reliable background Agent Runs, a quiet product UI, model and tool governance, artifact preview, and local account access.

## Product Goals

- Provide a minimal agent conversation workspace with message history, process summaries, tool call display, card rendering, run cancellation, background execution, and artifact preview.
- Give Administrators a governance console for users, Agents, models, MCP servers, sandbox capability, search capability, page reading, and run audit.
- Prefer mature ecosystem standards and SDKs over hand-rolled agent orchestration, protocol, sandbox, or rendering systems.
- Keep MVP scope single-workspace, local-account based, and free of projects, spaces, collaboration, marketplace, and long-lived knowledge base concepts.

## Non-Goals

- No organizations, tenants, shared workspaces, projects, spaces, folders, or collaboration containers.
- No enterprise SSO sign-in flow, only an Enterprise SSO Boundary for later integration.
- No MCP marketplace, stdio MCP servers, or local command execution transport in the MVP.
- No long-lived knowledge base, vector collection, or project material library.
- No arbitrary model-rendered frontend components or unsafe HTML in conversation messages.
- No hidden chain-of-thought disclosure.
- No user-side tool capability toggles in the composer.
- No Agent Instruction versioning workflow, draft publishing, or rollback.

## Confirmed Stack

- Frontend: React, TypeScript, Vite, pnpm workspace, TanStack Query, Zustand.
- UI foundation: Tailwind CSS with Radix primitives or shadcn-style owned components, not Ant Design as the primary UI system.
- Backend: Python 3.12, FastAPI, Pydantic v2, SQLAlchemy 2, Alembic, uv.
- Middleware: MySQL, Redis, MinIO, Celery.
- Agent runtime: OpenAI Agents SDK for Python.
- Agent event protocol: AG-UI over SSE with persisted run event recovery.

See ADR-0003, ADR-0006, ADR-0007, ADR-0036, and ADR-0037.

## Core User Experience

The first screen should be the usable Agent Conversation workspace, not a landing page. It should borrow the WorkBuddy shape: quiet left sidebar, spacious central conversation, compact composer, optional right-side artifact preview, and low-noise controls.

Primary user capabilities:

- Register and sign in with a Local Account after Administrator approval.
- Start a new Agent Conversation with an enabled Agent.
- Continue, rename, and soft-delete conversations.
- Choose a model from the selected Agent's Allowed Model Selection.
- Upload Run Attachments as temporary working context.
- Watch messages stream in, inspect Process Summaries, see Tool Calls, and open Artifacts.
- Stop an active Agent Run.
- Leave the page and return later to see the completed or still-running result.

## Conversation Information Architecture

The sidebar uses Agent Conversations as the first-level object.

Required sidebar elements:

- New conversation action.
- Search or filter for existing conversations.
- Recent conversation list with title, Agent identity, status, and updated time.
- Administrator Console entry for Administrators.
- User account/settings entry.

The MVP does not include projects, spaces, folders, collaboration channels, or an agent marketplace.

## Agent Model

The platform initializes a Default Agent and allows Administrators to create additional enabled Agents.

An Agent includes:

- Name, description, icon/avatar, enabled state.
- Agent Instruction, edited directly without version workflow.
- Default Model Configuration and Allowed Model Selection.
- Agent Capability Policy.
- Process Visibility Policy.
- MCP Tool Authorization.

Existing conversations remain bound to the Agent used when they were created. New conversations use lightweight Agent Selection.

## Agent Run Lifecycle

An Agent Run is a durable background execution, not a browser-bound request.

Flow:

1. FastAPI authenticates the user and validates there is no active run in the conversation.
2. Backend creates the Agent Run, Run Capability Snapshot, initial Conversation Message, and initial Agent Run Event Log entry.
3. Backend enqueues a Celery task.
4. Agent Run Worker invokes the OpenAI Agents SDK.
5. Worker writes ordered run events, message deltas, Process Summaries, Tool Calls, Artifact References, status updates, and Full Trace records.
6. Frontend subscribes through AG-UI SSE.
7. If the user leaves, the run continues.
8. On return, frontend loads current conversation state and resumes the event stream from the last seen sequence.

Run statuses:

- `queued`
- `running`
- `completed`
- `failed`
- `cancelled`

MVP constraint: one active Agent Run per Agent Conversation. Multiple conversations can run in parallel.

## Event Streaming And Recovery

AG-UI over SSE is the live Agent Event Protocol. Events must also be persisted in an Agent Run Event Log.

Requirements:

- Every run event has a stable run ID and monotonic sequence.
- SSE emits the sequence as the event ID.
- Frontend can reconnect with last seen sequence.
- Redis Streams may support hot fanout.
- MySQL remains the durable source for run state, messages, tool calls, artifacts, and event recovery.
- Stream Resume must handle page refresh, navigation away and back, and temporary network disconnect.

## Process Visibility

The UI can show user-facing execution transparency through Process Summary, Tool Calls, evidence summaries, progress, retries, errors, and artifacts.

It must not show hidden chain of thought. Process Visibility Policy can control minimal, standard, or verbose summary depth, but all levels stay within safe execution summaries.

## Tool And Capability Governance

Agents never receive raw tool inventories, provider credentials, object storage credentials, database access, or host environment access.

All external capabilities flow through the Agent Tool Gateway:

- MCP tools.
- Sandbox Capability.
- Search Capability.
- Page Read Capability.
- Run Attachment access.
- Artifact creation.

The Agent Tool Gateway owns:

- Per-Agent authorization checks.
- Credential isolation.
- Safe input and output projection.
- Tool call audit.
- Error normalization.
- AG-UI event translation.

Users cannot enable or disable tool capabilities in the MVP composer. The run uses the Agent's policy snapshot at run start.

## Models

Administrators manage Model Configurations.

The Model Provider Catalog starts with:

- OpenAI
- Anthropic
- Google Gemini
- DeepSeek
- Qwen / Alibaba Cloud DashScope
- Moonshot / Kimi
- ByteDance Doubao
- Zhipu / GLM
- MiniMax
- OpenRouter
- Custom OpenAI-compatible endpoint

Provider catalog entries include display name, logo, endpoint template, compatibility notes, recommended model examples, and documentation links. A provider is not usable until an Administrator supplies credentials and enables a Model Configuration.

Users can choose a model only from the current Agent's Allowed Model Selection.

## MCP

MVP MCP support is administrator-registered, not marketplace-based.

Supported connection types:

- SSE
- Streamable HTTP

Not supported initially:

- stdio MCP server transport
- MCP marketplace install/update lifecycle

Administrator workflow:

- Register MCP Server.
- Configure URL, headers or secret references, timeout, and enabled state.
- Run discovery check.
- Review discovered tools.
- Authorize specific tools per Agent.
- Inspect tool usage through Run Audit.

## Search And Page Reading

Search and page reading are separate capabilities with separate provider configurations.

Search Capability:

- Default MVP provider: Doubao Search Provider.
- Finds candidate URLs and snippets.
- Configurable credentials, availability, limits, and operational settings.

Page Read Capability:

- Default MVP provider: Jina Reader Provider.
- Fetches and extracts readable content from known URLs.
- Configurable credentials, limits, timeouts, content length, and domain policy.

Both capabilities are invoked through Agent Tool Gateway and represented as separate Tool Calls.

## Sandbox

Sandbox Capability uses the sandbox support available from OpenAI Agents SDK.

The MVP does not build a production host-Docker sandbox. Sandbox access still flows through Agent Tool Gateway and Agent Capability Policy so the application can enforce authorization, audit, artifact capture, and cleanup.

## Attachments And Artifacts

Run Attachments:

- Uploaded by users as temporary context.
- Not a knowledge base or project material library.
- Stored in MinIO with metadata in MySQL.
- Read by Agents only through Agent Tool Gateway.
- Initial supported inputs: images, PDF, plain text, Markdown, CSV, JSON, and code files.

Artifacts:

- Durable outputs produced by Agent Runs.
- Artifact bodies live in MinIO.
- MySQL stores metadata, owner conversation, run, type, filename, size, preview type, and timestamps.
- Conversation Messages store Artifact References, not large embedded bodies.

Artifact Preview supports:

- Markdown
- Plain text
- Images
- PDF
- Code files
- JSON or table-like data
- Sandboxed HTML in iframe

Office documents are downloadable unless converted to a supported preview format.

## Card Rendering

Agent messages can include structured cards only through the Card Schema Registry.

MVP candidate schemas:

- `artifact_card`
- `tool_result_card`
- `choice_card`
- `citation_card`
- `status_card`
- `form_request_card`

Models may emit structured card data, but backend Pydantic validation must approve it before the frontend maps it to registered components. Arbitrary component names, arbitrary props, and unsafe HTML are not allowed.

## Trace And Audit

Full Trace is retained for 90 days by default and visible only to Administrators in the MVP.

Regular Users do not get a separate redacted trace viewer. They see Process Summaries, visible Tool Calls, cards, and Artifacts.

Run Audit in the Administrator Console should support:

- Run status and timestamps.
- User, Agent, model, and capability snapshot.
- Failure and cancellation inspection.
- Tool Call sequence and summaries.
- Artifact list.
- Full Trace access.
- Storage and retention awareness.

## Local Accounts

MVP authentication uses Local Accounts.

Flow:

- User registers with username/email and password.
- Account starts pending.
- Administrator approves, rejects, or disables the account.
- Approved users can sign in.
- Initial Administrator is bootstrapped outside normal registration.

Enterprise SSO is only a reserved future boundary.

## Administrator Console

The Administrator Console is a governance workspace, not a BI dashboard.

MVP modules:

- Account Approval.
- Agent Lifecycle and Agent Capability Policy.
- Model Provider Catalog and Model Configurations.
- MCP Server registration and MCP Tool Authorization.
- Search Provider Configuration.
- Page Read Provider Configuration.
- Sandbox status.
- Run Audit and Full Trace.

Lightweight overview:

- Pending accounts.
- Recent failed runs.
- Provider health.
- Storage usage.

## Suggested Data Objects

Initial tables or aggregates:

- `users`
- `account_approvals`
- `agents`
- `agent_capability_policies`
- `model_provider_catalog_entries`
- `model_configurations`
- `mcp_servers`
- `mcp_discovered_tools`
- `mcp_tool_authorizations`
- `search_provider_configurations`
- `page_read_provider_configurations`
- `agent_conversations`
- `agent_runs`
- `agent_run_events`
- `conversation_messages`
- `tool_calls`
- `run_attachments`
- `artifacts`
- `full_traces`

Implementation can refine names, but it should preserve the domain boundaries in `CONTEXT.md`.

## First Implementation Slices

1. Repository scaffold:
   React/Vite web app, FastAPI API, Celery worker, shared contracts, Docker Compose, env checks, CI scripts.

2. Local accounts:
   Registration, login, bootstrap Administrator, Account Approval, protected routes.

3. Agent administration:
   Default Agent, Agent CRUD, Agent Instruction, model selection policy, capability policy skeleton.

4. Model configuration:
   Model Provider Catalog, Custom Model Endpoint, credential reference storage, enabled model configs.

5. Conversation shell:
   WorkBuddy-like sidebar, Agent Selection, conversation creation, rename, soft delete, composer, message list.

6. Background Agent Run foundation:
   Agent Run Worker, Celery queue, run status, one-active-run guard, Run Cancellation, Agent Run Event Log.

7. AG-UI SSE:
   Live event subscription, sequence IDs, Stream Resume, message persistence, reconnect behavior.

8. OpenAI Agents SDK integration:
   Default Agent run path, selected model use, Process Summary events, Full Trace persistence.

9. Tool Gateway:
   Tool Call records, safe event projection, capability snapshot, error normalization.

10. Artifacts and previews:
    Artifact storage by reference, preview panel, Markdown/text/image/PDF/code/JSON/table/HTML sandbox renderers.

11. MCP remote tools:
    SSE and streamable HTTP server registration, discovery, authorization, invocation through gateway.

12. Search and page read:
    Doubao Search Provider, Jina Reader Provider, separate Tool Calls, provider configuration UI.

13. Admin run audit:
    Run list, trace access, failure inspection, tool calls, artifacts, storage and retention controls.

## Design Direction

The product UI should feel like a quiet desktop-grade agent workspace:

- Light, spacious, low-noise layout.
- Left conversation sidebar and central work area.
- Right artifact preview that can open and close without disturbing the message stream.
- Compact controls with clear icons and tooltips.
- No marketing hero page as the first screen.
- No heavy enterprise dashboard styling for the conversation workspace.
- Administrator Console can be denser and more utilitarian than the conversation surface.

Design dials for the conversation workspace:

- `DESIGN_VARIANCE: 5`
- `MOTION_INTENSITY: 3`
- `VISUAL_DENSITY: 5`

Motion should be restrained: hover/active states, progressive message appearance, and loading skeletons. Avoid decorative animation that competes with reading and tool inspection.

## ADR Index

The decisions behind this blueprint live in `docs/adr/0001-*.md` through `docs/adr/0039-*.md`.
