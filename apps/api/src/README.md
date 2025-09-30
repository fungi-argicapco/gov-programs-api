# API Module Overview

The `apps/api/src` package exposes the HTTP interface for the government programs platform. It
provides program discovery, scoring, stack recommendation, saved queries, alert management, and
administrative health endpoints. Each handler composes shared utilities for persistence, request
sanitisation, and scoring.

## Match Scoring

The `/v1/match` endpoint accepts a business profile and optional filters, returning scored program
candidates. Scoring is executed by `match.ts`, which combines jurisdiction, industry, timing, size,
and freshness dimensions into a single weighted value.

### Timing Score Algorithm

`computeTimingScore` evaluates how well a program's availability window aligns with a profile's
eligible timeline. It calculates the overlap between the two windows and compares that duration to
the shortest finite window between them. The resulting ratio is capped at `1.0`, so a program that
fully covers the shorter availability period earns full credit, while partial overlaps receive a
proportional score.

### Stack Suggestions

The `/v1/stacks/suggest` endpoint leverages the scored program list to assemble a recommended stack
subject to CAPEX and tag-based constraints. The algorithm exits early as soon as the remaining CAPEX
is exhausted, ensuring unnecessary iterations are avoided.

## Saved Queries & Alerts

Saved queries and alert subscriptions share authentication and rate-limiting middleware. They rely
on the same sanitisation helpers used by the matching endpoints to guarantee consistent validation.

## Administrative Health

Admin endpoints expose health insights such as source freshness and coverage statistics. These
endpoints are authenticated and rate-limited to align with operational access requirements. The
Phase 5 observability additions extend this surface with request metrics, SLO tracking, an audit
trail for API key mutations, and a lightweight `/admin` console that consumes the new operator
APIs directly from the Worker.
=======
# API Service Overview

This document describes the government programs API that powers program discovery, scoring, and operational monitoring. It is intended for engineers who need to understand how the Worker is structured, how clients authenticate, what endpoints are available, and how the scoring and stack suggestion engines behave internally.

## Runtime and Operational Conventions

- **Runtime:** Cloudflare Workers using the [Hono](https://hono.dev) framework. All handlers must remain compatible with the Workers runtime (no Node-specific APIs).
- **Database:** Cloudflare D1. Queries always use prepared statements and fan out to `benefits`, `criteria`, and `tags` for enrichment.
- **Content types:** All endpoints accept and return JSON. Requests that include a body must set `Content-Type: application/json`.
- **Base path:** All routes documented below are prefixed with `/v1` and are deployed behind a Cloudflare-protected hostname.

## Authentication, Quotas, and Rate Limits

- **API keys:** Mutating and sensitive routes require an `x-api-key` header. Keys are SHA-256 hashed and stored in the `api_keys` table, so rotated secrets are fully opaque to the service.
- **Roles:** Keys carry a `role` (`admin`, `partner`, or `read`) that gates access to privileged routes. Admin-only routes are explicitly called out in the reference section.
- **Quota enforcement:** Every authenticated request writes `usage_events` (route, timestamp, cost=1). The middleware compares recent usage against `quota_daily` and `quota_monthly` columns before invoking business logic. When the quota exceeds the API returns `429 { "error": "quota_exceeded", "scope": "daily" | "monthly" }`.
- **Rate limiting:** During local development a per-key token bucket allows 60 requests/minute (`apps/api/src/mw.rate.ts`). In production Cloudflare edge rules apply the external rate policy; the Worker middleware still records usage events.
- **Self-service usage:** `GET /v1/usage/me` exposes day/month counters, window start timestamps, and configured quota ceilings so clients can proactively stay below limits.

## Shared Data Shapes

### Program resource

All endpoints that return program data share the same enriched structure:

```jsonc
{
  "id": 123,
  "uid": "us-sba-123",
  "source_id": 42,
  "country_code": "US",
  "jurisdiction_code": "US-CA",
  "authority_level": "state",
  "industry_codes": ["31-33", "541511"],
  "start_date": "2024-01-01",
  "end_date": "2024-12-31",
  "updated_at": 1716508800,
  "title": "Sample Grant",
  "summary": "Short description",
  "benefit_type": "grant",
  "status": "open",
  "url": "https://example.gov/program",
  "benefits": [{
    "type": "grant",
    "notes": "Up to $50k",
    "min_amount_cents": 500000,
    "max_amount_cents": 5000000,
    "currency_code": "USD"
  }],
  "criteria": [{ "kind": "employees", "operator": "<=", "value": "500" }],
  "tags": ["exclude:canada", "cap:max:50%"]
}
```

## Endpoint Reference

Each section lists request requirements, query parameters, response envelopes, and notable error codes. Unless stated otherwise responses are JSON objects.

### `GET /v1/health`
- **Purpose:** Liveness/readiness probe.
- **Authentication:** Not required.
- **Response:** `{ "ok": true, "service": "gov-programs-api" }`.

### `GET /v1/programs`
- **Purpose:** Retrieve catalogued programs with pagination, filtering, and enrichment.
- **Authentication:** Not required.
- **Query parameters:**
  - `country` (ISO alpha-2), `state`/`province` (`US-CA` style codes, combined into `jurisdiction` internally).
  - `industry[]` or repeated `industry` (NAICS codes), `benefit_type[]`, `status[]`.
  - `from`, `to` (ISO dates) filter by `start_date`/`end_date` overlap.
  - `sort` defaults to `-updated_at` (`updated_at` ascending available).
  - `page` (default `1`) and `page_size` (max `100`).
  - `q` free-text search routed to the SQL builder.
- **Response:** `{ "data": Program[], "meta": { "total": number, "page": number, "pageSize": number } }`.

### `GET /v1/programs/:id`
- **Purpose:** Fetch a single enriched program by numeric ID or stable `uid`.
- **Authentication:** Not required.
- **Errors:** `404 { "error": "not_found" }` when neither lookup succeeds.

### `POST /v1/match`
- **Purpose:** Score programs for a business profile.
- **Authentication:** Required (`x-api-key`). Counts toward quota and rate limits.
- **Request body:**

```jsonc
{
  "profile": {
    "country_code": "US" | "CA" | "UK",
    "jurisdiction_code": "US-CA",         // optional
    "naics": ["string"],                   // deduplicated server-side
    "capex_cents": 1250000,                // optional >= 0
    "start_date": "2024-01-01",           // optional ISO
    "end_date": "2024-12-31"              // optional ISO
  },
  "filters": {
    "country": "override country",        // optional
    "jurisdiction": "override juris",    // optional
    "industry": ["string"],               // optional array or string
    "from": "ISO date",
    "to": "ISO date",
    "limit": 150                           // optional hard cap (<= 100 used in response)
  }
}
```

- **Response:** `{ "data": [{ "program": Program, "score": number, "reasons": MatchReasons }] }` with at most 50 entries sorted by score.
- **Errors:**
  - `400 { "error": "invalid_json" | "invalid_profile" }` for malformed payloads.
  - `401 { "error": "unauthorized" }` when auth middleware is bypassed (should not occur with valid key).

`MatchReasons` includes `jurisdiction`, `industry`, `timing`, `size`, and `freshness` contributions plus any debug notes returned from `scoreProgramWithReasons`.

### `POST /v1/stacks/suggest`
- **Purpose:** Build a recommended stack using the same scoring pipeline, layering stacking constraints and coverage math.
- **Authentication:** Required (`x-api-key`).
- **Request body:** Same structure as `/v1/match`; `filters.limit` can extend to 150 candidates.
- **Response:**

```jsonc
{
  "stack": [{
    "program": Program,
    "score": number,
    "stack_value_usd": number,
    "constraints": string[]
  }],
  "value_usd": number,
  "coverage_ratio": number,          // capped at 1 when capex is met
  "constraints_hit": string[]         // e.g. ["capex_exhausted", "exclude:duplicated"]
}
```

- **Algorithm:** Scores up to 150 candidates, retains the top 100, and greedily selects until capex is exhausted or constraints block further picks. Duplicate `source_id` entries and conflicting tags are skipped.

### Saved query lifecycle

All saved-query routes require authentication.

- `POST /v1/saved-queries`
  - **Body:** `{ "name": string, "query_json": string }` (`query_json` should be a JSON string the ingest worker can replay).
  - **Response:** `{ "id": number }` of the stored query.
  - **Errors:** `400 { "error": "invalid_payload" }` for missing name/body.
- `GET /v1/saved-queries/:id`
  - **Response:** Full saved query record scoped to the calling API key.
  - **Errors:** `404 { "error": "not_found" }` if the query does not exist or belongs to another key.
- `DELETE /v1/saved-queries/:id`
  - **Response:** `{ "ok": true }` on success.
  - **Errors:** `404 { "error": "not_found" }` if already removed.

### `POST /v1/alerts`
- **Purpose:** Register alert subscriptions that will be fulfilled by the ingest/notifications worker.
- **Body:** `{ "saved_query_id": number, "sink": "email|webhook", "target": string }`.
- **Response:** `{ "id": number }` for the new subscription.
- **Errors:**
  - `400 { "error": "invalid_payload" }` for missing fields.
  - `404 { "error": "not_found" }` if the referenced saved query is not accessible.

### `GET /v1/usage/me`
- **Purpose:** Return quota usage counters for the calling key.
- **Response:**

```jsonc
{
  "day": { "used": number, "window_started_at": epochSeconds },
  "month": { "used": number, "window_started_at": epochSeconds },
  "limits": { "daily": number | null, "monthly": number | null, "last_seen_at": epochSeconds }
}
```

### Admin endpoints

These routes require `role === 'admin'` in addition to a valid API key.

- `GET /v1/admin/sources/health`
  - Combines ingest success metrics with the most recent error string per source.
  - Response: `{ "data": [{ "id": number, "name": string, "jurisdiction_code": string | null, "last_success_at": number | null, "success_rate_7d": number | null, "last_error": string | null }] }`.
- `POST /v1/admin/ingest/retry?source={id}`
  - Validates that the `source` exists and enqueues a `partial` ingest run with the message `queued for admin retry`.
  - Response: `{ "queued": true, "source_id": number }`.
  - Errors: `400 { "error": "invalid_source" }` or `404 { "error": "not_found" }`.

- `GET /v1/ops/metrics`
  - Aggregates 5-minute request buckets into `5m` or `1h` intervals with weighted percentile math.
  - Query parameters: `route`, `from`, `to`, `bucket`. Default window covers the trailing 24 hours.
  - Response: `{ "data": OpsMetricPoint[], "meta": { "from": ISO8601, "to": ISO8601, "bucket": "5m" | "1h" } }`.
- `GET /v1/ops/slo`
  - Returns daily SLO windows plus an overall summary of availability, p99 latency, and per-route aggregates.
  - Query parameters: `from`, `to` (YYYY-MM-DD). Defaults to the most recent 7 days.
  - Response: `{ "data": OpsSloRow[], "summary": OpsSloSummary }`.
- `GET /v1/ops/alerts`
  - Lists unresolved operational alerts sourced from `ops_alerts`.
  - Response: `{ "data": OpsAlert[] }` (empty when there are no active alerts).
- `POST /v1/ops/alerts/resolve`
  - Body: `{ "ids": number[] }`. Sets `resolved_at` for matching alert IDs and returns the count of changed rows.
  - Response: `{ "resolved": number }`.
- `GET /v1/admin/api-keys`
  - Lists API keys without returning the hashed secret. Includes quota ceilings and timestamps.
  - Response: `{ "data": AdminApiKey[] }`.
- `POST /v1/admin/api-keys`
  - Body: `{ "name"?: string, "role"?: "admin" | "partner" | "read", "quota_daily"?: number | null, "quota_monthly"?: number | null }`.
  - Generates a 40-character secret, hashes it, and records an `admin_audits` row with the creation metadata.
  - Response: `{ "id": number, "raw_key": string }` (the plaintext secret is only returned once).
- `PATCH /v1/admin/api-keys/:id`
  - Updates any combination of `name`, `role`, `quota_daily`, or `quota_monthly`. Writes an `admin_audits` entry for changed fields.
  - Response: Updated `AdminApiKey` record.
- `DELETE /v1/admin/api-keys/:id`
  - Removes the record and appends an `admin_audits` entry. Response: `{ "deleted": boolean }`.
- `GET /admin`
  - Serves a minimal HTML console that lets administrators fetch metrics, review SLOs, and manage API keys inline.
  - The console stores the admin key in localStorage and issues requests to the `/v1/ops/*` and `/v1/admin/api-keys*` APIs.

### Metadata and metrics

- `GET /v1/sources`
  - Authentication: Not required.
  - Response:

    ```jsonc
    {
      "data": [
        {
          "id": "us-fed-grants-gov",
          "source_id": 1,
          "country_code": "US",
          "authority": "federal",
          "jurisdiction_code": "US-FED",
          "kind": "json",
          "parser": "json_api_generic",
          "schedule": "4h",
          "rate": { "rps": 2, "burst": 5 },
          "url": "https://www.grants.gov/grantsws/rest/opportunities/search?filter=active&sortBy=closeDate",
          "license": "https://www.grants.gov/help/html/help/Register/SAM.gov-Data-Usage-Agreement.htm",
          "tos_url": "https://www.grants.gov/web/grants/policy/policy-guidance/sam-gov-data-usage-agreement.html",
          "last_success_at": 1700000000,
          "success_rate_7d": 0.95
        }
      ]
    }
    ```
- `GET /v1/stats/coverage`
  - Authentication: Not required.
  - Response: Daily coverage metrics produced by `buildCoverageResponse`, including per-country totals and ingest cadence information.

## Match Scoring Details

`apps/api/src/match.ts` defines the core scoring pipeline. Scores are weighted percentages (0–100) that combine five factors:

| Factor | Weight (defaults) | Description |
| --- | --- | --- |
| Jurisdiction | 30 | Exact country match and optional sub-jurisdiction alignment. |
| Industry | 25 | Jaccard similarity between profile and program industry codes. |
| Timing | 20 | Measures how well the program dates overlap the profile window. |
| Size | 15 | Compares program benefit value (converted to USD) against profile capex. |
| Freshness | 10 | Prefers recently updated programs, with a 7-day sweet spot and 180-day cutoff. |

Weights are sourced from Cloudflare KV (`match:weights:v1`) with `DEFAULT_WEIGHTS` as a fallback. When KV is unavailable the defaults guarantee deterministic scoring for development and testing.

### Timing score rationale

The timing score converts temporal overlap into a 0–1 ratio. After deriving the overlap window, the algorithm measures the duration of that overlap against the *shortest finite duration* between the profile and the program windows. Using the shortest duration as the reference ensures:

- Programs that exactly match a narrow profile window score highly even if they have a longer overall eligibility period.
- Profiles without explicit bounds, or programs with open-ended dates, default to full credit because there is no meaningful finite baseline.

If there is no overlap the score is `0`; when overlap covers the shortest duration or longer it caps at `1`.

### Size and currency handling

Benefit amounts are normalized to USD using lookup rates from `loadFxToUSD`. When both maximum and minimum amounts are missing or the currency is unknown, the benefit contributes `0` to the size score. Programs with multiple benefits sum their converted USD amounts before comparing against profile capex.

### Freshness decay

`computeFreshnessScore` linearly decays from `1` at 7 days old to `0` at 180 days. Programs older than six months are effectively stale for ranking.

### Match reasons payload

`scoreProgramWithReasons` returns a `reasons` object that mirrors the weight table. Each key includes the raw ratio (`0`–`1`), the applied weight, and supplemental fields such as the overlapping day counts or currency conversions performed.

## Stack Suggestion Details

`suggestStack` reuses the scored program records to assemble a complementary portfolio:

- Programs are cloned to avoid mutating cached relations.
- Tag processing enforces mutual exclusions and applies `exclude:*` directives across the selected stack.
- Percentage caps reduce the USD value of a program when tags specify `cap:max:NN%`. The cap is calculated against the profile's available capex.
- Duplicate ingest sources are suppressed so that multiple records from the same feed do not dominate results.
- Once capex is exhausted the algorithm exits the iteration early, marking `capex_exhausted` in the constraint list. This avoids unnecessary evaluation of the remaining programs.
- The helper annotates each stack entry with the constraints that caused it to be skipped or capped, which bubbles up in the API response for easier debugging.

The function returns both the selected entries with their capped `stack_value_usd` and aggregated metrics (`value_usd`, `coverage_ratio`).

## Error Handling and Status Codes

- `400` — Invalid JSON payloads or failed validations (`invalid_json`, `invalid_profile`, `invalid_payload`, `invalid_source`).
- `401` — Missing API key (`missing_api_key`) or unauthenticated access to protected routes (`unauthorized`).
- `403` — Role-based access denials (`forbidden`).
- `404` — Resource lookups that do not exist or fall outside the caller's scope (`not_found`).
- `429` — Rate or quota limits (`rate_limited`, `quota_exceeded`).
- `5xx` — Unhandled errors propagate through Hono's default exception handler; callers should retry idempotent operations with backoff.

## Development Notes

- Run `bun run typecheck` and `bun test` before deploying changes to ensure the Worker compiles and tests pass.
- `bunx wrangler dev` runs the Worker locally with Bun-powered middleware, exercising the token bucket limiter.
- Use `bun --watch` locally for quicker iteration when modifying the Worker runtime.