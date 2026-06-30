# OpenAI Agents SDK as the agent runtime

Minimalist Agent will use the OpenAI Agents SDK for Python as the Agent Runtime in the MVP. The platform should not hand-roll model orchestration, tool invocation, MCP integration, or trace plumbing when a mature SDK already covers those concerns and fits the FastAPI Python backend. The application layer will own governance, persistence, tool policy, event translation, and product-specific UI behavior around the SDK.
