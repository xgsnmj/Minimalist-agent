# Separate search and page read capabilities

Minimalist Agent will model web search and page reading as separate Agent capabilities. Search Capability finds candidate URLs and snippets, while Page Read Capability fetches and extracts readable content from a known URL; each can use a different provider, credential, limit policy, error handling path, and audit record. Agent Tool Gateway can still combine them in a single Agent Run, but Administrators configure and authorize them independently per Agent.
