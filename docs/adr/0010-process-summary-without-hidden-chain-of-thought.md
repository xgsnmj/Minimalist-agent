# Process summary without hidden chain of thought

Minimalist Agent will show user-visible Process Summaries, tool call status, evidence summaries, progress, errors, and retries, but it will not expose hidden chain of thought. Agents can have a Process Visibility Policy to control whether the interface is minimal, standard, or verbose, but all levels must stay within safe, auditable execution summaries rather than raw private reasoning. This gives users transparency without coupling the product to unsafe or provider-specific hidden reasoning disclosure.
