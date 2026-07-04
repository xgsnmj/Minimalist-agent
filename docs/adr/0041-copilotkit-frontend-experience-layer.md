# CopilotKit frontend copilot experience layer

Minimalist Agent will use CopilotKit as the frontend copilot experience layer for the Agent Conversation workspace. CopilotKit better matches the intended product feel of an in-app copilot that can share page state, expose frontend actions, support generative UI, and guide human-in-the-loop interactions; Minimalist Agent will still keep Agent Runs, Agent Capability Policy, Agent Tool Gateway enforcement, Card Schema Registry validation, Artifact storage, Run Audit, and Full Trace ownership in the backend platform. AG-UI over SSE remains the Agent Event Protocol boundary, while CopilotKit provides the React interaction surface above that boundary.

The CopilotKit runtime routes are protocol adapters only: they advertise enabled backend Agents, translate CopilotKit REST/SSE requests into backend-owned Agent Conversations and Agent Runs, execute through the existing OpenAI Agents SDK Agent Runtime, and translate results back to AG-UI events without granting frontend tools direct authority over Tool Calls, policy, audit, artifacts, cards, or Full Trace.

**Considered Options**

- `assistant-ui` with `@assistant-ui/react-ag-ui`: a strong fit for a controlled conversation renderer over AG-UI, but less aligned with the desired app-copilot interaction model.
- CopilotKit: a stronger fit for application-aware copilot workflows, with the trade-off that platform governance boundaries must stay explicit to avoid frontend actions bypassing backend policy and audit.
