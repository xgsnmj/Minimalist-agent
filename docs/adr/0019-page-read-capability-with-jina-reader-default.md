# Page read capability with Jina Reader default

Minimalist Agent will use Jina Reader Provider as the default MVP implementation behind Page Read Capability. Search Capability and Page Read Capability stay separate: Doubao Search Provider finds candidate URLs, while Jina Reader Provider extracts readable content from known URLs. Administrators can configure provider credentials, limits, timeouts, content length, and domain policy without coupling Agent Conversations or AG-UI events to a specific reader implementation.
