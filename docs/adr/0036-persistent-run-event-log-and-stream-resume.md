# Persistent run event log and stream resume

Minimalist Agent will persist an ordered Agent Run Event Log and support Stream Resume for AG-UI over SSE. Background Agent Runs must survive page navigation and network reconnects, so each emitted run event should receive a stable sequence and be recoverable after the frontend returns with a last-seen event position. Redis Streams can serve the hot fanout path while MySQL remains the durable source for run state, messages, tool calls, artifact references, and event recovery.
