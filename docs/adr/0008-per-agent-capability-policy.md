# Per-Agent capability policy

Minimalist Agent will configure capabilities independently for each Agent rather than relying on one runtime-inherited global policy. Model access, MCP servers, sandbox capability, search capability, and other tools have different cost, safety, and audit profiles, so permissions should be explicit at the Agent boundary. Platform defaults can help create new Agents later, but an Agent Run should resolve its effective permissions from that Agent's own capability policy.
