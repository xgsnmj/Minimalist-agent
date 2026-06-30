# Card schema registry for message rendering

Minimalist Agent will render rich message cards through a platform-owned Card Schema Registry instead of allowing models to emit arbitrary frontend component names, props, or HTML. Agents can produce structured card data, but the backend must validate it against approved schemas before the frontend maps it to registered components such as artifact, tool result, choice, citation, status, or form request cards. This keeps Agent Conversations expressive without giving model output control over the application component tree.
