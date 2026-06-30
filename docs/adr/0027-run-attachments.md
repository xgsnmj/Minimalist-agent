# Run attachments as temporary context

Minimalist Agent will support Run Attachments for files uploaded from the conversation composer and used as temporary working context for an Agent Run or Agent Conversation. Run Attachments are not a long-lived project knowledge base or shared material library in the MVP; file bodies live in object storage, metadata lives in MySQL, and Agents read them through the Agent Tool Gateway. The initial file set can include images, PDF, plain text, Markdown, CSV, JSON, and code files.
