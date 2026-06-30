# OpenAI Agents SDK sandbox capability

Minimalist Agent will implement Sandbox Capability through the sandbox support available from the OpenAI Agents SDK rather than building a production host-Docker sandbox in the MVP. Sandbox access still flows through the Agent Tool Gateway and each Agent's capability policy, so the application can enforce authorization, audit, artifact capture, and lifecycle cleanup around SDK-provided execution. Local Docker isolation can be useful for development or later extensions, but it is not the production sandbox boundary for the first version.
