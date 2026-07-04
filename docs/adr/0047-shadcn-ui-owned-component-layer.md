# shadcn/ui for page refactoring with the project's unified product language

Minimalist Agent will use shadcn/ui to refactor the current frontend pages in `apps/web`. The implementation should prefer existing shadcn/ui base components whenever they fit the interaction, and only build custom components when the existing set does not cover the need. The final result must keep the project's agreed product design language consistent across the Agent Conversation workspace and the Administrator Console.

This decision refines ADR-0006, ADR-0042, and ADR-0044 without changing their product intent.

## Decision

1. Use shadcn/ui as the primary source of reusable frontend components when refactoring current pages.
2. Reuse existing shadcn/ui base components first, then build custom components only where the current set is insufficient.
3. Keep the product design language aligned with the existing project agreements instead of introducing a new visual system.
4. Apply the same component vocabulary and visual rhythm across the workbench surfaces so the refactor reads as one product.

## Consequences

- Page refactors can move faster by reusing proven base components.
- The frontend remains visually coherent instead of drifting into mixed patterns.
- Some screens will still need custom components for domain-specific workbench behavior.
- The design system becomes an implementation rule, not just a visual guideline.
