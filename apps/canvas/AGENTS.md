See root AGENTS.md for shared constraints.

Canvas-specific notes:
- Reuse shared modules from `packages/common` and `packages/db` instead of duplicating logic.
- Coordinate session or email contract changes with the API Worker and update docs accordingly.
- Keep UI templates lightweight; heavy client interactions belong in `apps/web`.
