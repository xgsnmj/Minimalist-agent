# OpenAI Agents SDK as the agent runtime

Minimalist Agent will use the OpenAI Agents SDK for Python as the backend Agent Runtime in the MVP. The platform should not hand-roll model orchestration, tool invocation, MCP integration, or trace plumbing when a mature SDK already covers those concerns and fits the FastAPI Python backend. The application layer will own governance, persistence, tool policy, event translation, and product-specific UI behavior around the SDK.

CopilotKit is the frontend conversation surface and protocol adapter, not a replacement Agent Runtime. CopilotKit requests must be translated into backend-owned Agent Runs, and those runs execute through the OpenAI Agents SDK path so model credentials, capability policy, Tool Gateway enforcement, audit, artifacts, and trace capture remain under Minimalist Agent control.
