# One active run per conversation

Minimalist Agent will allow only one active Agent Run per Agent Conversation in the MVP. Users can run multiple conversations in parallel, but a single conversation cannot start another run until the current run reaches completed, failed, or cancelled. This keeps message order, Tool Call attribution, Artifact association, cancellation, and Stream Resume understandable for the first version.
