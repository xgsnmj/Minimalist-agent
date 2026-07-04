# Open Design Prototype

Minimalist Agent has an existing landed Open Design prototype that should be treated as a visual and interaction reference for frontend implementation work.

Prototype path:

```text
/Users/wuhongjie/Library/Application Support/Open Design/namespaces/release-stable/data/projects/183f5978-8c03-4aa5-a354-82cc5ef3a4eb
```

The prototype includes static HTML pages, shared CSS, responsive styles, exported artifact metadata, generated critique notes, and copied planning documents. The repository docs and ADRs remain the source of truth for product scope and architectural decisions; the Open Design prototype is the reference for concrete page composition, visual density, layout rhythm, and interaction feel.

Important prototype entries:

- `app-conversations.html`: Conversation Workspace reference with sidebar, message stream, composer, Agent Run status, and Artifact Preview.
- `login.html`, `register.html`, `approval-pending.html`: Local Account access flow references.
- `admin-overview.html`, `agent-lifecycle.html`, `model-configurations.html`, `mcp-servers.html`, `search-provider.html`, `page-read-provider.html`, `sandbox-status.html`: Administrator Console references.
- `run-audit.html`, `full-trace.html`: Run Audit and Full Trace references.
- `account-approval.html`, `account-settings.html`: account governance and user settings references.
- `styles.css`, `responsive.css`, `app.js`: shared visual and interaction behavior for the prototype.
- `critique.json`: Open Design critique notes for the prototype quality bar.

Before reshaping the React frontend, compare the target page against the matching prototype page. Diverge intentionally when the current ADRs, CopilotKit integration, accessibility requirements, or implementation constraints require it.
