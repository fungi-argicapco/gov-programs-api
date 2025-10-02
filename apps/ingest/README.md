# Ingestion Worker

The ingestion worker keeps the catalog and playbook datasets fresh. It can run on schedule (Cloudflare cron) or via CLI helpers under `scripts/`.

## Key Folders
- `src/` – Fetch adapters, normalization, upsert logic, metrics reporters.
- `src/macro/` – Macro metrics ingestion pipeline.
- `test/` – Vitest suites that exercise adapters and pipelines against an in-memory D1 stub.

## Operations
- `bun run ingest:once` runs ingestion locally using SQLite (`data/ingest.dev.sqlite`).
- Scheduled runs are triggered through the Worker entry point (`src/index.ts`) using Cloudflare cron.
- Snapshots are written to R2 for diffing; metadata is persisted in D1.

Whenever new data categories are added, update `docs/ARCHITECTURE.md` and align schema migrations in `migrations/`.
