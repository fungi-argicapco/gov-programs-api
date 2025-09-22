# Phase 2 Design: Live Coverage Expansion & Observability

## 1. Objectives
- Replace fixture-backed Phase 1 sources with live U.S. federal, U.S. state, and Canadian provincial feeds while preserving the source catalog and adapter abstractions in `data/sources/phase1.ts`.
- Enrich persisted programs with NAICS-derived industry tags and validate coverage so `/v1/stats/coverage` can report on program completeness and data health.
- Add ingestion observability and content diffing to measure adapter performance, catch breakages early, and support expansion to more jurisdictions and program types.

## 2. Current State Summary
- **Source ingestion** uses generic JSON, HTML table, and RSS adapters configured by fixtures that list metadata, request URLs, and sampling limits. The adapters call `upsertPrograms`, which normalizes payloads, updates relational tables (`programs`, `benefits`, `criteria`, `tags`), and writes raw payload snapshots to R2 (`snapshots` table).
- **Catalog exposure**: `/v1/sources` reads the `sources` table populated during ingestion to show metadata about each feed.
- **Coverage metrics**: `/v1/stats/coverage` currently aggregates counts by jurisdiction and benefit type directly from the `programs` table, without validating relationships or tags.
- **Observability**: Cron-triggered ingestion lacks run-level logging, success/error metrics, and automated diffing of new snapshots versus prior fetches.

## 3. Replace Fixtures with Live Feeds
### 3.1 Source Inventory & Target Feeds
| Jurisdiction | Phase 1 Fixture | Phase 2 Target Feed | Notes |
|--------------|-----------------|---------------------|-------|
| U.S. Federal | `US_FEDERAL_GRANTS_FIXTURE` | Grants.gov Opportunities API (JSON REST) with Department filter for DOE and EDA | Requires API key, pagination, status filters. |
| U.S. States  | `US_STATE_PROGRAMS_RSS` (WA sample) | Per-state economic development RSS/JSON feeds (starting with WA, CA, NY). Fallback to static HTML scraping where RSS absent. | Maintain modular source entries per state. |
| Canada Provincial | `CA_PROVINCIAL_PROGRAMS_TABLE` (ON/BC sample) | Provincial open data portals / incentives pages (HTML/CSV) for ON, BC, QC. | Some require scraping table markup; others provide CSV/JSON downloads. |

### 3.2 Catalog & Configuration Strategy
1. **Extend `data/sources/phase1.ts`** (or replace with `phase2.ts`) to return live-source descriptors that mirror the existing union shape (`json`/`html`/`rss`) but provide real URLs, authentication metadata, and rate-limit hints.
2. **Add support metadata**:
   - `auth?: { kind: 'api_key' | 'none'; envVar?: string }` for adapters to inject keys from bindings.
   - `throttle?: { maxPerMinute: number; burst: number }` for rate-limiter configuration.
   - `jurisdiction_codes: string[]` to allow one source entry to represent multiple states/provinces if feeds share infrastructure.
3. **Source catalog population**: Modify ingestion bootstrap to upsert each source into `sources` table with live metadata (licensing, update cadence, jurisdiction coverage), ensuring `/v1/sources` stays accurate.
4. **Feature flags**: Keep `enabled` flags, but support environment-based toggles (e.g., disable high-volume feeds in dev) via worker bindings.

### 3.3 Adapter Enhancements
- **JSON Adapter**: Implement pagination (page/token), query parameter templating, and rate limiting via `setTimeout` or shared worker KV counters. Support API key header injection.
- **HTML Table Adapter**: Allow CSS selectors for row scoping, column mapping, and optional post-processing to parse currency ranges and deadlines.
- **RSS Adapter**: Parse feed published dates, categories, and state-specific tags. Add deduplication by GUID.
- **Error handling**: Standardize adapter response envelopes (`{ success: boolean; items: UpsertProgramRecord[]; errors: AdapterError[] }`) so ingestion loop can log failures.

### 3.4 Incremental Rollout
1. Implement Grants.gov integration (DOE + EDA) and validate on staging.
2. Layer in top 3 states with accessible feeds; document mapping requirements.
3. Integrate ON/BC provincial feeds; add QC once parsing is stable.
4. Once live sources validated, remove fixture data from production config but retain for tests.

## 4. NAICS & Tag Enrichment with Coverage Validation
### 4.1 Data Model Updates
- **New tables**:
  - `industry_mappings` (`id`, `naics_code`, `tags[]`, `confidence`): curated mapping of NAICS to descriptive tags.
  - `coverage_audit` (`id`, `program_id`, `run_id`, `issues[]`, `created_at`): stores validation results per program per ingest run.
- **Existing tables**: Ensure `programs.industry_codes` remains JSON array; `tags` table holds derived labels.

### 4.2 Enrichment Pipeline
1. **NAICS lookup**: Use persisted `program.industry_codes` to join against `industry_mappings`, generating tag suggestions.
2. **Tag consolidation**: Merge mapping-derived tags with adapter-supplied tags, deduplicate, and write via `upsertPrograms` (update normalization to accept computed tags).
3. **Backfill job**: Scheduled worker to enrich existing programs nightly, populating tags and NAICS coverage stats.

### 4.3 Coverage Validation Rules
- **Program completeness**: Ensure each program has title, summary, link, and at least one benefit or incentive amount.
- **Temporal validity**: Flag programs with expired end dates or missing effective dates when the source provides them.
- **Industry tagging**: Track programs lacking NAICS codes or derived tags.
- **Jurisdiction coverage**: Compare number of active programs per jurisdiction against source-provided totals when available (e.g., Grants.gov API metadata).

### 4.4 `/v1/stats/coverage` Enhancements
- Return structure:
  ```json
  {
    "byJurisdiction": [...],
    "byBenefit": [...],
    "tagCoverage": { "withTags": n, "withoutTags": n },
    "naicsCoverage": { "withNaics": n, "missingNaics": n },
    "validationIssues": [{ "issue": "missing_summary", "count": 12 }, ...]
  }
  ```
- Persist aggregated stats per run in a `coverage_reports` table to support trend charts.
- Update OpenAPI schema and tests to reflect new response shape.

## 5. Observability & Diffing for Ingestion
### 5.1 Run Tracking
- **`ingest_runs` table**: (`id`, `started_at`, `finished_at`, `trigger`, `status`, `adapter`, `source_url`, `success_count`, `error_count`, `notes`).
- Wrap each adapter invocation in a run record capturing timings and counts.
- Emit worker logs with structured JSON for Cloudflare Logpush ingestion.

### 5.2 Metrics & Alerts
- Derive success/error rates per adapter by aggregating `ingest_runs`.
- Publish metrics to Grafana-compatible endpoint (e.g., Cloudflare Analytics Engine or Workers Metrics API when available).
- Configure alert thresholds (e.g., error rate >20%, missing data for 24h) surfaced in Slack/email via webhook worker.

### 5.3 Snapshot Diffing
- Extend `upsertPrograms` to:
  1. Fetch the previous snapshot for the same `program_id` ordered by `fetched_at`.
  2. Compute structured diff (fields changed, removed, added) using JSON diff utility.
  3. Store diff summary in new `snapshot_diffs` table (`snapshot_id`, `prev_snapshot_id`, `diff_json`, `breaking_change` flag).
- Use diff summaries to drive:
  - Alerting when important fields change (status, funding amount).
  - Optional API endpoint `/v1/programs/:id/history` for debugging.

### 5.4 Developer Tooling
- Provide CLI (`bun run ingest:once --source=US-FED`) that prints run metrics and diff summaries locally.
- Add Vitest coverage for diffing utility and validation rules.

## 6. Implementation Roadmap
1. **Schema migrations** for new tables (`industry_mappings`, `coverage_audit`, `coverage_reports`, `ingest_runs`, `snapshot_diffs`). Update Drizzle definitions and D1 migrations.
2. **Adapter upgrades**: implement Grants.gov integration, rate limiting, and error envelopes; backfill other adapters.
3. **Enrichment & validation**: build NAICS/tag job, integrate into `upsertPrograms`, extend stats endpoint, and add tests.
4. **Observability**: add run tracking, metrics aggregation, diffing, and alerting webhooks.
5. **Documentation & Playbooks**: update README, add runbooks for API keys, cron schedules, and alert response.
6. **Rollout**: deploy to staging, validate metrics & coverage reports, then enable in production with progressive jurisdiction rollout.

## 7. Open Questions & Risks
- **API Access**: Confirm Grants.gov API key quotas and whether DOE/EDA endpoints need separate credentials.
- **State feeds variability**: Many states lack structured feeds; may require headless browser scraping. Need legal review of scraping terms.
- **Data volume**: Snapshot storage growth with live feeds—verify R2 cost and implement retention (e.g., keep 90 days).
- **Diff noise**: Minor timestamp or ordering changes could trigger alerts—need configurable diff ignore rules.
- **Validation accuracy**: Source totals may not be published; fallback heuristics (e.g., track moving averages) might be required.

## 8. Success Metrics
- `/v1/sources` lists ≥5 live sources with current metadata.
- ≥90% of programs have NAICS codes and derived tags; coverage endpoint reports validation issue counts trending downward.
- Ingestion dashboard shows per-adapter success rate and highlights diffs for high-impact fields within 15 minutes of change.
