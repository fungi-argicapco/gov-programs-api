# Packages

Shared packages consumed by Workers, the web client, and tooling.

- `common/` – Cross-cutting utilities (dates, lookups, shared types).
- `db/` – Drizzle ORM schema bindings and helpers for D1 access.
- `ml/` – Learning-to-rank and scoring helpers.
- `atlas-tokens/` – Atlas design tokens source, build pipeline, and Tailwind preset.
- `atlas-svelte/` – Atlas primitive components, shared styles, and CSS variables bundle.

Coordinate schema or type changes with the corresponding Worker directories and update `docs/ARCHITECTURE.md` if new shared services are introduced.
