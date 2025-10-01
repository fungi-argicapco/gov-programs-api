# Ingestion Observability & Diffing

This document explains how to monitor catalog ingestion runs, interpret diff records, and run the local CLI tooling added in Sprint 3.

## Run lifecycle

Each catalog dispatch writes a row to `ingestion_runs` capturing:

- `source_id`, `started_at`, `ended_at`, and execution `status` (`ok`, `partial`, `error`).
- Counters for `fetched`, `inserted`, `updated`, `unchanged`, and `errors`.
- `critical` flag whenever a run produces critical content changes.
- `notes` array with contextual messages (initialization issues, HTTP errors, etc.).

The ingestion worker wraps each source with lifecycle hooks. Structured run summaries are emitted through the metrics adapter (console logging by default), and each run persists diffs via `program_diffs` and `snapshot_diffs`.

### Program & snapshot diffs

`upsertPrograms` normalizes every payload, compares it to the previous persisted snapshot, and records:

- `program_diffs`: before/after snapshots, changed paths, and whether any critical fields (status, funding, dates) changed.
- `snapshot_diffs`: links to raw payload snapshots when R2 storage is enabled, including references to the previous snapshot.

Diffs use a JSON utility that ignores noisy fields (e.g., summaries) while flagging critical fields. Critical changes appear in both tables (`critical = 1`).

## CLI usage

Use the new Bun script to run the catalog once against a local SQLite database:

```bash
bun run ingest:once             # run all sources into data/ingest.dev.sqlite
bun run ingest:once --source=us-fed-grants-gov --db=.data/custom.sqlite
```

The CLI applies all SQL migrations, executes the ingestion loop, and prints human-readable summaries:

```
✅ us-fed-grants-gov – fetched 12, inserted 5, updated 3, unchanged 4, errors 0
   duration 1.24s; changed 8 program(s), 2 critical
   • program-uid-1 (critical): status, end_date
   • program-uid-2: benefits, tags
```

Notes appear when HTTP or adapter errors occur. The CLI disables structured metrics output to avoid duplicate console entries.

## Alerting & dashboards

The ingestion worker logs JSON payloads such as:

```json
{
  "type": "ingest_run",
  "sourceId": "us-fed-grants-gov",
  "status": "ok",
  "durationMs": 1240,
  "fetched": 12,
  "inserted": 5,
  "updated": 3,
  "unchanged": 4,
  "errors": 0,
  "criticalChanges": 2,
  "totalChanges": 14,
  "totalProgramsChanged": 8,
  "notes": []
}
```

These logs can be consumed by Cloudflare Logpush or Workers Analytics to create dashboards and alert on error or critical-change thresholds.

## Testing

Vitest covers the diff utility (`apps/ingest/src/diff/json.test.ts`) and catalog ingestion (`tests/ingest.catalog.test.ts`). Run `bun test` or `bun run typecheck` before deploying.
