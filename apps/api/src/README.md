# API Overview

The API is implemented with [Hono](https://hono.dev/) and is designed to run on Cloudflare Workers. All routes expect an `x-api-key` header that resolves to a record in the `api_keys` table. Requests without a key, or with a key that exceeded its quota, are rejected before handlers run.

## Public Routes

### `GET /v1/health`
Simple readiness probe that returns `{ ok: true, service: 'gov-programs-api' }` when the worker is running.

### `GET /v1/programs`
Returns a paginated list of programs with related benefits, criteria, and tags. Supports filtering by:

- `country` — two-letter code such as `US`, `CA`, or `UK`.
- `state`/`province` — combined with country to build a jurisdiction filter.
- `industry` — accepts repeated query params (`industry[]`) to filter by NAICS codes.
- `benefit_type`, `status`, `from`, `to`, `sort`, `page`, and `page_size`.

The handler hydrates relations via `fetchProgramRelations` so that clients receive denormalized program records.

### `POST /v1/match`
Scores programs for a provided business profile and returns the top matches. The payload must contain a `profile` with:

- `country_code` (`US`, `CA`, or `UK`).
- Optional `jurisdiction_code`, `capex_cents`, `start_date`, and `end_date` values.
- `naics` — array of industry codes.

Optional `filters` further constrain the candidate pool. Up to 100 programs are scored, and the response returns at most `MATCH_RESULT_LIMIT` (currently 50) entries including score reasons for transparency.

### `POST /v1/stacks/suggest`
Builds an optimized stack of programs for the supplied profile. The endpoint reuses the matching pipeline to source candidates, then calls `suggestStack` to respect mutual exclusion tags, duplicate source guards, and profile capital expenditure (`capex_cents`) constraints. The response includes the selected stack, cumulative USD value, coverage ratio, and any triggered constraints.

## Admin Routes

Administrative endpoints are protected by the same middleware and require an `admin` role.

- `GET /v1/admin/sources/health` — surfaces ingestion health metrics with the latest error state per source.
- `POST /v1/admin/ingest/retry?source=<id>` — enqueues a retry for a failed ingestion source after validating existence.

Additional admin sub-routes (e.g., `/v1/alerts`, `/v1/saved-queries`) share the rate limiting and authentication middleware but are implemented in their respective modules.

## Matching & Scoring Notes

`match.ts` contains the scoring engine used by both `/v1/match` and `/v1/stacks/suggest`.

- **Jurisdiction and industry** scores compute simple overlaps based on country, jurisdiction code, and NAICS sets.
- **Timing** score measures the overlap between profile and program time windows. The overlap duration is normalized by the shortest finite duration to ensure that fully overlapping short windows receive full credit, while open-ended ranges do not exaggerate alignment.
- **Size** score compares the program's USD-denominated benefit value against the profile's `capex_cents`.
- **Freshness** score decays from 1 to 0 over a 180-day window based on the program `updated_at` timestamp.

`loadWeights` retrieves configurable weights from `LOOKUPS_KV`, defaulting to `DEFAULT_WEIGHTS` when the lookup fails.

## Stack Suggestion Notes

`suggestStack` sorts candidates by score and greedily selects programs while:

- Enforcing country/jurisdiction alignment and deduplicating sources.
- Respecting `exclude:` tags for mutual exclusions and tagging selected programs.
- Honoring `cap:max:%` tags which cap the stack contribution of tagged programs relative to the profile's available capex.
- Checking remaining capex before processing each program to exit early once funds are exhausted.

The algorithm keeps track of applied constraints and reports them alongside the final stack so clients can expose reasoning to end users.
=======
# API service

This package hosts the HTTP surface for the worker that powers program matching,
stack suggestions, and administrative tooling.

## Matching endpoints

### `POST /v1/match`

Returns a list of scored programs for a sanitized profile. The endpoint consults
the weighting configuration returned by `loadWeights` and limits the number of
entries sent back to clients via the `DEFAULT_MATCH_RESPONSE_LIMIT` constant in
`index.ts`. The limit currently defaults to 50 results so that clients always
receive a predictable payload size. Increase the limit by updating the constant
(or by extending the handler to read from configuration) before deploying if a
larger response window is required.

### Timing score rationale

The matching engine evaluates several sub-scores, one of which is the timing
score calculated in `computeTimingScore`. The function measures the overlap of
the profile and program availability windows, computes the duration of the
intersection, and divides it by the shorter finite duration of the two windows.
Using the shortest duration as the denominator ensures that a short-lived
profile or program is not unfairly penalised when compared with an open-ended
range. Open-ended or unbounded ranges are treated as always available and earn a
perfect score whenever there is any overlap.

### `POST /v1/stacks/suggest`

Builds a stack of programs ordered by score while honouring CAPEX and mutual
exclusion constraints. The handler now checks the remaining CAPEX before doing
any expensive per-program work so the loop terminates as soon as the budget is
exhausted.
