# Artifact storage by reference

Minimalist Agent will store generated Artifact bodies in object storage and persist Artifact metadata plus references in MySQL. Conversation Messages should reference Artifacts rather than embedding large file bodies or generated content directly in the message stream. This keeps messages lightweight, supports download and preview workflows, and gives the platform a clean boundary for artifact permissions, cleanup, and future reuse.
