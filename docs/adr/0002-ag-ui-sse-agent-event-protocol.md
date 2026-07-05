# AG-UI SSE for agent event streaming

Minimalist Agent will use AG-UI over Server-Sent Events as the Agent Event Protocol between the frontend and backend. The product needs ordered, user-visible Agent Run events for conversation messages, process summaries, tool calls, card rendering, artifacts, completion, and errors; SSE keeps the MVP simpler than a bidirectional WebSocket protocol while matching the WorkBuddy-like interaction model. WebSocket remains available later for global notifications or collaboration, but not as the primary Agent Conversation stream.

CopilotKit-native chat UI consumes this protocol through the Minimalist CopilotKit adapter. The adapter may translate CopilotKit REST/SSE shapes into AG-UI events, but the durable source of truth remains the backend Agent Run Event Log and persisted Agent Conversation state rather than browser-only chat state.
