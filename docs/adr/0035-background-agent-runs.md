# Background agent runs

Minimalist Agent will support Background Agent Runs in the MVP. Leaving the conversation page or losing the SSE subscription should not automatically cancel the Agent Run; the run continues in backend-managed execution, persists events, messages, tool calls, artifacts, and status, and can be reattached when the User returns. AG-UI over SSE remains the live subscription protocol, while persisted run events provide result recovery and later viewing.
