# Packages

Shared packages consumed by Workers and tooling.

- `common/` – Cross-cutting utilities (dates, lookups, shared types).
- `db/` – Drizzle ORM schema bindings and helpers for D1 access.
- `ml/` – Learning-to-rank and scoring helpers.

Coordinate schema or type changes with the corresponding Worker directories and update `docs/ARCHITECTURE.md` if new shared services are introduced.
