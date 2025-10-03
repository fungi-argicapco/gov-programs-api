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

### SAM.gov endpoint guardrails

- Validate credentials and endpoint health before scheduled runs with:
  ```bash
  SAM_API_KEY=... bun run verify:sam
  ```
- The command hits both the legacy SGS URL (expected 404) and the production opportunities v2 API. It fails fast if the latter stops returning 200s, giving operators a quick way to distinguish between credential issues and API changes.
- `scripts/maintenance.sam-synthetic.ts --purge` removes historical synthetic rows once live data is flowing.

### Synthetic fallback for SAM Assistance

Until the team secures a `SAM_API_KEY`, the catalog falls back to a synthetic payload for `us-fed-sam-assistance`. Runs that rely on this placeholder emit a `synthetic_data:SAM_API_KEY not provisioned` note and persist the generated JSON snapshot to R2. The synthetic data matches the normalized program schema so coverage metrics and downstream tests stay exercised, but it should be removed once real credentials are available. When the key arrives, set it in `.env.dev.local`/Wrangler secrets and rerun `bun run ingest:once --source us-fed-sam-assistance` to replace the placeholder rows.

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

### Dashboard checklist

- **Freshness heatmap** – build a `/v1/sources` view grouped by jurisdiction showing `last_success_at` vs. SLA windows (≤6h for `4h`, ≤30h for `daily`). Highlight stale sources (>SLA) with alert thresholds at 24 hours.
- **Coverage trends** – chart `/v1/stats/coverage.naics_density` and tag coverage over 14 days. Break out NAICS density by rollout cohort tags to watch for regressions during expansion.
- **Run stability** – overlay 7-day success rates from `ingestion_runs` with cumulative error counts. Trigger a warning when success rate drops below 85% or when error rate exceeds 20%.
- **Diff reviews** – surface `program_diffs` flagged `critical` so reviewers can sign off on impactful changes as part of rollout exit criteria.

### Alert thresholds & playbooks

- **Error rate >20%**: Page the ingestion on-call rotation. Consult adapter-specific runbooks and pause scheduled cron jobs for affected sources if errors persist beyond two runs.
- **Stale source >24h**: Trigger Slack + PagerDuty alerts. Use the post-deploy validation script to confirm the stale status and disable the source via `INGEST_SOURCES_ALLOWLIST` until backfill completes.
- **NAICS density <90%**: Notify enrichment owners. Validate KV lookups and rerun enrichment backfill if coverage drops after a rollout.
- **Diff backlog >10 critical entries**: Escalate to product/ops for review before continuing rollout.

### Post-deploy validation workflow

1. Deploy the worker and confirm metrics ingestion is active.
2. Run `bun run postdeploy:validate --base-url=<environment-url>` to capture `/v1/sources` freshness, NAICS density, and tag coverage snapshots.
3. Upload the JSON artifact to the release ticket and compare against the previous deploy to spot regressions.
4. Update dashboards with any new cohort tags or sources before widening rollout.

## Testing

Vitest covers the diff utility (`apps/ingest/src/diff/json.test.ts`) and catalog ingestion (`tests/ingest.catalog.test.ts`). Run `bun test` or `bun run typecheck` before deploying.
