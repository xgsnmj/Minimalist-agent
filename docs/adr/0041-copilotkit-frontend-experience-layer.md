# CopilotKit-native frontend conversation surface

Minimalist Agent will use CopilotKit-native React UI as the frontend conversation rendering surface for the Agent Conversation workspace. CopilotKit better matches the intended product feel of an in-app copilot that can share page state, expose UI-only frontend actions, render suggestions and tool-call progress, support attachments, and guide human-in-the-loop interactions; Minimalist Agent will still keep Agent Runs, Agent Capability Policy, Agent Tool Gateway enforcement, Card Schema Registry validation, Artifact storage, Run Audit, and Full Trace ownership in the backend platform. AG-UI over SSE remains the Agent Event Protocol boundary, while CopilotKit provides the React interaction surface above that boundary.

The CopilotKit runtime routes are protocol adapters only: they advertise enabled backend Agents, translate CopilotKit REST/SSE requests into backend-owned Agent Conversations and Agent Runs, execute through the existing OpenAI Agents SDK Agent Runtime, and translate results back to AG-UI events without granting frontend tools direct authority over Tool Calls, policy, audit, artifacts, cards, or Full Trace. The first implementation path should prefer `CopilotChatView` or equivalent CopilotKit v2 slot composition so Minimalist Agent can keep its sidebar, Allowed Model Selection, and Artifact Preview while replacing the self-built chat form and transcript.

**Considered Options**

- `assistant-ui` with `@assistant-ui/react-ag-ui`: a strong fit for a controlled conversation renderer over AG-UI, but less aligned with the desired app-copilot interaction model.
- Self-built React composer and transcript over Minimalist REST/SSE routes: easy to control in the short term, but it duplicates CopilotKit's chat UI, attachments, suggestions, tool-call rendering, and page-context model.
- CopilotKit-native UI: a stronger fit for application-aware copilot workflows, with the trade-off that platform governance boundaries must stay explicit to avoid frontend actions bypassing backend policy and audit.

See `docs/copilotkit-native-openai-agents-runtime-design.md` for the migration design.
