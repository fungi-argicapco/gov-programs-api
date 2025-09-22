# Phase 2 Ingestion and Coverage Design

## Objectives

Phase 2 expands the data pipeline beyond fixtures to production-grade ingestion and reporting. The release must deliver:

1. **Documentation** – capture the full ingestion, enrichment, and observability design in this document.
2. **Live source catalog** – implement `data/sources/phase2.ts` with U.S. federal and starter state feeds plus Canadian federal and starter provincial feeds.
3. **Ingestion observability schema** – ship `migrations/0003_ingest_obs.sql` defining `ingestion_runs` and `program_diffs`.
4. **Catalog-driven ingestion loop** – replace fixture loops with a dispatcher that enforces shared rate limiting, captures raw snapshots, and records ingestion run metrics.
5. **NAICS & tag enrichment with coverage validation** – enrich programs, calculate coverage metrics, and surface them through `/v1/sources` and `/v1/stats/coverage`.
6. **Automation** – ensure Bun type checking and tests pass locally and in CI.

All scripts must run with Bun only, execute in the Cloudflare Workers runtime, and respect conditional `wrangler.toml` bindings. Local scripts remain idempotent.

## Source Catalog

Phase 2 introduces a consolidated catalog consumed by the ingestion worker. Each source definition records the jurisdiction, parser, optional mapper, rate limits, schedule, and policy metadata.

```ts
export type SourceDef = {
  id: string;
  authority: 'federal' | 'state' | 'prov' | 'territory';
  country: 'US' | 'CA';
  jurisdiction: string; // e.g. US-FED, US-CA, CA-FED, CA-ON
  kind: 'json' | 'rss' | 'html';
  entrypoint: string;
  parser: 'json_api_generic' | 'rss_generic' | 'html_table_generic';
  mapFn?: string;
  rate: { rps: number; burst: number };
  schedule: '4h' | 'daily';
  license?: string;
  tosUrl?: string;
};
```

Initial Phase 2 catalog entries:

| id | Country | Authority | Entrypoint | Parser | Mapper | Schedule | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `us-fed-grants-gov` | US | federal | `https://www.grants.gov/grantsws/rest/opportunities/search?filter=active&sortBy=closeDate` | `json_api_generic` | `mapGrantsGov` | 4h | Grants.gov Search 2 JSON API; benefits classified as grants. |
| `us-fed-sam-assistance` | US | federal | `https://sam.gov/api/prod/sgs/v1/search?index=assistancelisting&q=*&sort=-modifiedDate` | `json_api_generic` | `mapSamAssistance` | daily | SAM Assistance Listings (program metadata). |
| `ca-fed-open-gov` | CA | federal | `https://open.canada.ca/data/en/api/3/action/package_search?q=assistance%20program&rows=100` | `json_api_generic` | `mapCkanGC` | daily | Open Government Proactive Disclosure CKAN endpoint. |
| `ca-on-grants` | CA | prov | `https://data.ontario.ca/en/api/3/action/package_search?q=grant&rows=100` | `json_api_generic` | `mapCkanProvON` | daily | Ontario CKAN search as starter province feed. |

The ingestion loop normalizes catalog metadata into the `sources` table so `/v1/sources` reflects authoritative properties. Additional jurisdictions reuse the same hooks and inherit rate limiting and snapshot handling.

### Rate limiting & scheduling

A per-host token bucket prevents overloading upstream APIs. The Durable Object binding name is supplied via `CF_DO_BINDING`. When the DO class is unavailable (e.g., local tests), an in-memory map on `globalThis.__rl__` simulates rate control. Each source declares an `rps` and `burst`, while the worker schedules requests on four-hour or daily cadences according to `schedule`.

### Raw snapshots

When the `RAW_R2` binding is configured, the dispatcher writes each fetched payload to R2 before parsing. Snapshot keys follow `sourceId/YYYY/MM/DD/HH/epoch.json` to simplify diffing and replay. Local runs without R2 skip snapshot writes silently.

## Adapters and mapping

Existing generic adapters (`json_api_generic`, `rss_generic`, `html_table_generic`) continue to normalize payloads. Phase 2 introduces mapper functions to translate remote schemas into the normalized program shape:

- `mapGrantsGov` – interprets Grants.gov Search 2 rows, deriving URLs, lifecycle dates, and grant status.
- `mapSamAssistance` – converts SAM Assistance Listing records into long-lived program entries with stable identifiers.
- `mapCkanGC` – adapts Canadian federal CKAN package records, selecting relevant resources as canonical URLs.
- `mapCkanProvON` – parses Ontario CKAN packages, defaulting to the first HTML or dataset resource for linking.

Mappers live beside adapters and are referenced by name from the catalog; the JSON adapter looks up mapper functions from a registry.

## Ingestion flow

1. **Catalog dispatch** – `runCatalogOnce` iterates through `SOURCES`, ensures `sources` table entries exist, enforces rate limits, fetches payloads, saves raw snapshots, invokes the configured parser, and aggregates results.
2. **Upsert** – `upsertPrograms` normalizes and enriches each program, compares to existing rows, writes only when changes occur, and records diffs in `program_diffs`.
3. **Observability** – every run inserts a row into `ingestion_runs` with counts (fetched, inserted, updated, unchanged, errors), status, and diagnostic messages. Diff rows include before/after snapshots keyed by program UID.

Errors on individual sources mark the run as `error` (no results) or `partial` (some records ingested with per-record failures) while still logging metrics.

## Enrichment and validation

### NAICS & tag enrichment

`enrichNaics` loads optional synonym dictionaries from `LOOKUPS_KV` (`naics:synonyms:v1`). It tokenizes titles, summaries, criteria values, and tags to assign up to six NAICS codes. Missing KV data results in a no-op so ingestion stays resilient. Additional enrichers can reuse the same pattern.

### Coverage metrics

The API exposes richer coverage metrics sourced from the new observability tables:

- **Coverage by jurisdiction** – counts of distinct programs per country and jurisdiction.
- **Fresh sources** – source IDs with successful ingestion runs inside the SLA window (<= 6 hours for `4h`, <= 30 hours for `daily`).
- **Completeness** – per-country booleans for federal coverage plus counts of active states/provinces with programs.
- **NAICS density** – proportion of programs carrying at least one NAICS code.
- **Deadlink rate** – placeholder metric (0% unless future link checking populates failures in `ingestion_runs` messages).

`/v1/sources` now surfaces authority level, jurisdiction codes, policy metadata, last success timestamps, and seven-day success rates calculated from `ingestion_runs`.

## Observability schema

`migrations/0003_ingest_obs.sql` adds:

- `ingestion_runs` – per-source execution records storing timing, status (`ok`, `partial`, `error`), counts, and error details.
- `program_diffs` – normalized diffs keyed by program UID and source for auditing changes.

Indexes accelerate lookups by source and chronological queries for recent diffs.

## API changes

- `/v1/sources` returns enriched source metadata, last success timestamps, and rolling success rates.
- `/v1/stats/coverage` extends the response with `fresh_sources`, `completeness`, `naics_density`, and `deadlink_rate` while preserving existing aggregates.

Both endpoints avoid breaking existing keys and remain backwards compatible with Phase 1 clients.

## Testing strategy

- **Unit tests** cover NAICS enrichment, catalog dispatch (with fixture sources and stubbed fetch responses), and query builder stability.
- **Type checking** runs via `bun run typecheck`.
- **Ingestion dry run** (optional) can reuse fixtures to simulate scheduled execution without outbound network calls.

All Bun-based tests must work in CI without requiring live API access. Fetch is stubbed in tests to keep runs deterministic.

## Rollout plan

1. Deploy schema migration and verify via `bunx wrangler d1 migrations apply DB --local` before promotion.
2. Roll out new ingestion worker with catalog dispatch behind feature flag or staged cron to monitor metrics.
3. Validate `/v1/sources` and `/v1/stats/coverage` responses for completeness and ensure dashboard/alert consumers handle new fields.
4. Expand catalog to additional jurisdictions once observability dashboards confirm healthy ingestion success rates.

## Risks and mitigations

- **Upstream rate limits** – mitigated via token bucket enforcement shared across adapters and Durable Objects in production.
- **Schema drift** – tracked through `program_diffs` alerts; raw snapshots stored per run support replay.
- **Lookup data availability** – enrichment gracefully degrades when KV entries are missing, preventing ingestion failures.
- **Cloudflare configuration gaps** – conditional logic avoids remote writes when API tokens are absent, and local scripts remain idempotent.

## Success criteria

- All catalog sources ingest successfully within their schedule SLAs.
- `/v1/sources` accurately reflects live source metadata with success metrics.
- `/v1/stats/coverage` reports enriched metrics and highlights freshness gaps.
- Bun type checking, unit tests, and local migrations succeed without network dependencies.
