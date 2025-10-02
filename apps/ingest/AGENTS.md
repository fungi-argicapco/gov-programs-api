Use Bun + Workers-compatible tooling only (see root AGENTS.md). Additional guidelines:

- Keep adapters idempotent and rate-limit compliant; document source configuration in `data/sources`.
- Add Vitest coverage for each new ingestion path before wiring it into the catalog runner.
- Coordinate schema changes with `packages/db` and `migrations/` when persisting new tables/columns.
- Refresh `docs/ARCHITECTURE.md` if the ingestion topology changes (new cron triggers, storage, etc.).
