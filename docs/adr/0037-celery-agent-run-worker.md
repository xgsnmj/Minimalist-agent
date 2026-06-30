# Celery agent run worker

Minimalist Agent will execute Background Agent Runs in Celery workers using Redis as the broker. FastAPI creates the Agent Run, persists the initial state, and serves AG-UI SSE subscriptions, while the Agent Run Worker invokes the OpenAI Agents SDK and writes Agent Run Event Log entries, Conversation Messages, Tool Calls, Artifact references, status updates, and trace records to durable storage. Celery's result backend is not the source of truth for Agent Run state.
