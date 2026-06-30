# Minimalist Agent Context

Minimalist Agent is a minimal agent platform for configuring agent capabilities and running WorkBuddy-like agent conversations. This context records the product language shared by the frontend, backend, and documentation.

## Language

**Agent Platform**:
The product surface where users run agent conversations and administrators govern agent capabilities.
_Avoid_: agent framework, agent system

**User**:
A person who can sign in and use the agent conversation workspace.
_Avoid_: customer, client, member

**Local Account**:
A username and password based account created and authenticated inside the Agent Platform.
_Avoid_: internal user, password user

**Account Approval**:
The administrator decision that enables, rejects, or disables a Local Account after registration.
_Avoid_: user review, signup moderation

**Administrator**:
A privileged user who manages account access and platform capability configuration.
_Avoid_: superuser, operator

**Administrator Console**:
The governance workspace where administrators configure models, tools, sandboxes, search capability, MCP servers, and user access.
_Avoid_: admin backend, management panel

**Run Audit**:
The administrator workflow for inspecting Agent Run status, failures, tool activity, artifacts, and Full Trace records.
_Avoid_: analytics dashboard, BI report

**Enterprise SSO Boundary**:
The reserved integration boundary for a future enterprise identity provider. It is not part of the MVP sign-in flow.
_Avoid_: SSO login, OAuth account

**Agent**:
A configured AI worker that can respond in conversations and use the capabilities granted by the platform.
_Avoid_: bot, assistant instance

**Default Agent**:
The initial Agent created by the platform and used as the primary conversation entry point for Users.
_Avoid_: built-in bot, system assistant

**Agent Lifecycle**:
The administrator-managed creation, configuration, enablement, disablement, and retirement of Agents.
_Avoid_: agent marketplace, bot management

**Agent Selection**:
The user-facing choice of which enabled Agent starts a new Agent Conversation.
_Avoid_: agent marketplace, expert catalog

**Agent Instruction**:
The administrator-authored instruction text that shapes an Agent's behavior.
_Avoid_: prompt template, system prompt version

**Agent Runtime**:
The execution layer that runs Agents, coordinates model calls, invokes approved tools, and emits Agent Run events.
_Avoid_: agent framework, orchestrator

**Agent Run Worker**:
The background worker process that executes Agent Runs and writes run events, messages, tool calls, artifacts, and status updates.
_Avoid_: request handler, result backend

**Agent Tool Gateway**:
The backend-controlled boundary through which Agents invoke approved MCP tools, sandbox capability, search capability, file access, and other external capabilities.
_Avoid_: direct MCP access, raw tool access

**Capability Configuration**:
The administrator-owned policy that controls which capabilities an Agent may use.
_Avoid_: feature switches, tool settings

**Agent Capability Policy**:
The per-Agent policy that determines whether that Agent may use model configurations, MCP servers, sandbox capability, search capability, and other approved tools during an Agent Run.
_Avoid_: global tool policy, inherited permissions

**Run Capability Snapshot**:
The resolved set of capabilities available to an Agent Run, derived from the Agent's policy at run start.
_Avoid_: user tool toggles, runtime permissions

**Run Attachment**:
A user-provided file attached to an Agent Run or Agent Conversation as temporary working context.
_Avoid_: knowledge base file, project material

**Model Configuration**:
The administrator-owned provider, model, credential reference, and runtime parameter definition available to Agents.
_Avoid_: LLM config, provider config

**Allowed Model Selection**:
The set of Model Configurations an Administrator permits a specific Agent to use, including the default model for new Agent Runs.
_Avoid_: user model marketplace, unrestricted model picker

**Model Provider Catalog**:
The curated list of common model providers shown in the Administrator Console with display metadata such as name, logo, default endpoint, and documentation link.
_Avoid_: hard-coded providers, model marketplace

**Custom Model Endpoint**:
An administrator-defined model provider endpoint, usually a self-hosted gateway, proxy, or OpenAI-compatible relay.
_Avoid_: custom model, private model

**MCP Server**:
A Model Context Protocol server registered by an administrator as a source of tools or context for Agents.
_Avoid_: plugin server, tool server

**MCP Connection Type**:
The administrator-selected remote transport used to connect to an MCP Server.
_Avoid_: local command transport, plugin install

**MCP Tool Authorization**:
The administrator-managed allowlist that controls which discovered MCP tools an Agent may invoke through the Agent Tool Gateway.
_Avoid_: MCP marketplace install, raw MCP tools

**Sandbox Capability**:
The controlled workspace capability that lets an Agent execute code, access files, and produce artifacts without exposing the host environment.
_Avoid_: local shell, code runner

**Search Capability**:
The controlled web search capability available to an Agent when enabled by an administrator.
_Avoid_: internet mode, browser mode

**Search Provider Configuration**:
The administrator-owned configuration for a concrete search provider used behind Search Capability.
_Avoid_: search engine setting, web search key

**Doubao Search Provider**:
The default MVP search provider implementation behind Search Capability.
_Avoid_: hard-coded web search, built-in browser

**Page Read Capability**:
The controlled capability for fetching and extracting readable content from a known URL.
_Avoid_: web search, browser mode

**Page Read Provider Configuration**:
The administrator-owned configuration for a concrete page reading provider used behind Page Read Capability.
_Avoid_: reader setting, webpage parser key

**Jina Reader Provider**:
The default MVP page reading provider implementation behind Page Read Capability.
_Avoid_: hard-coded webpage reader, browser fetch

**Agent Conversation**:
A user-facing thread of messages, process events, tool calls, and artifacts produced while working with an Agent.
_Avoid_: chat, task

**Conversation Management**:
The user-facing actions for renaming, deleting, and continuing an Agent Conversation.
_Avoid_: history editor, prompt editor

**Deleted Conversation**:
An Agent Conversation hidden from normal user lists while its runs, messages, tool call records, artifacts, and trace retention rules remain intact.
_Avoid_: hard-deleted conversation, erased conversation

**Agent Run**:
A single execution of an Agent inside an Agent Conversation, beginning with a user request and ending in completion, cancellation, or failure.
_Avoid_: job, request

**Background Agent Run**:
An Agent Run that continues after the user leaves the conversation page and can be reattached for progress or result viewing later.
_Avoid_: detached chat, browser-bound run

**Agent Run Event Log**:
The persisted ordered event record for an Agent Run, used to recover messages, tool calls, artifacts, status, and stream progress.
_Avoid_: transient stream, debug log

**Stream Resume**:
The ability for the frontend to continue receiving Agent Run events after reconnecting from the last acknowledged event position.
_Avoid_: realtime-only stream, best-effort reconnect

**Run Cancellation**:
The user-initiated stop action that moves an active Agent Run into a cancelled state while preserving already emitted messages, tool calls, and artifacts.
_Avoid_: failed run, interrupted chat

**Agent Event Protocol**:
The frontend-backend event stream that carries Agent Run lifecycle events, message updates, process summaries, tool calls, cards, artifacts, and errors.
_Avoid_: websocket protocol, streaming API

**Conversation Message**:
A user input, Agent response, process summary, or system-visible status entry inside an Agent Conversation.
_Avoid_: chat bubble, log line

**Process Summary**:
A user-visible explanation of how the Agent approached the work, selected context, and used capabilities. It is not the model's hidden chain of thought.
_Avoid_: thinking, chain of thought

**Process Visibility Policy**:
The per-Agent policy that controls how much user-visible execution detail appears during an Agent Run, without exposing hidden chain of thought.
_Avoid_: chain-of-thought switch, reasoning disclosure

**Full Trace**:
The administrator-visible record of an Agent Run's execution details, including model interactions, tool activity, runtime events, and diagnostic context.
_Avoid_: user-facing process, conversation history

**Tool Call**:
A recorded invocation of an Agent capability, including status, inputs safe to show, outputs safe to show, and provenance.
_Avoid_: action, function call

**Artifact**:
A durable output produced by an Agent Conversation, such as a document, file, preview, report, code bundle, or structured result.
_Avoid_: attachment, deliverable

**Artifact Reference**:
A Conversation Message's pointer to an Artifact, carrying enough metadata for display without embedding the artifact body in the message.
_Avoid_: inline file, message attachment

**Artifact Preview**:
The in-app rendering surface for inspecting an Artifact without leaving the Agent Conversation.
_Avoid_: file viewer, preview pane

**Card Rendering**:
The structured message rendering pattern for displaying domain objects, choices, citations, status, or artifacts as cards inside an Agent Conversation.
_Avoid_: rich text block, widget

**Card Schema Registry**:
The platform-owned whitelist of structured card schemas that can be rendered inside an Agent Conversation after backend validation.
_Avoid_: dynamic component registry, model-rendered components
