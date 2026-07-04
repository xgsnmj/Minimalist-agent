# CopilotKit frontend copilot experience layer

Minimalist Agent will use CopilotKit as the frontend copilot experience layer for the Agent Conversation workspace. CopilotKit better matches the intended product feel of an in-app copilot that can share page state, expose frontend actions, support generative UI, and guide human-in-the-loop interactions; Minimalist Agent will still keep Agent Runs, Agent Capability Policy, Agent Tool Gateway enforcement, Card Schema Registry validation, Artifact storage, Run Audit, and Full Trace ownership in the backend platform. AG-UI over SSE remains the Agent Event Protocol boundary, while CopilotKit provides the React interaction surface above that boundary.

**Considered Options**

- `assistant-ui` with `@assistant-ui/react-ag-ui`: a strong fit for a controlled conversation renderer over AG-UI, but less aligned with the desired app-copilot interaction model.
- CopilotKit: a stronger fit for application-aware copilot workflows, with the trade-off that platform governance boundaries must stay explicit to avoid frontend actions bypassing backend policy and audit.
