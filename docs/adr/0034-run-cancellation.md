# Run cancellation

Minimalist Agent will support Run Cancellation in the MVP. Users can stop an active Agent Run from the conversation interface, the backend should close the AG-UI SSE stream, attempt to cancel the underlying Agent Runtime work, and persist the run as cancelled rather than failed. Messages, Tool Calls, Artifacts, and trace fragments already produced before cancellation remain attached to the Agent Conversation for review and administrator debugging.
