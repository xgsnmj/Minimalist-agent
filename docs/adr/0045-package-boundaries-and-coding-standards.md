# Package boundaries and coding standards

Minimalist Agent will organize production code by feature first, with explicit internal layers inside each feature package. The current flat `apps/api/app/*.py` and `apps/web/src/*.tsx` layout is acceptable as a transitional shape for the MVP, but it is not the target structure for ongoing production growth.

The target shape is:

- backend code grouped under feature packages, with a small HTTP seam at the edge;
- frontend code grouped by route and feature, with shared modules kept narrow;
- shared code reserved for true cross-cutting primitives only;
- dependency direction kept one-way so callers depend on deep modules, not on internal implementation details.

This decision favors locality, testability, and clearer ownership over minimal file count. It also creates a stable seam for future refactors without forcing a framework rewrite.

The implementation rules live in `docs/architecture/package-boundaries.md`.

**Consequences**

- New code will have an obvious home.
- Route handlers and page modules stay thin.
- Cross-feature coupling becomes visible instead of accidental.
- Some existing flat modules will need to be moved or wrapped over time.

