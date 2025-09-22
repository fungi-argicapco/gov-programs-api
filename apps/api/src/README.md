# API Service Module

This package contains the Cloudflare Worker responsible for the public API. It wires
endpoint routing with [Hono](https://hono.dev/), orchestrates database access, and
wraps the shared matching engine that scores government programs for businesses.

## HTTP Endpoints

The worker exposes the following authenticated routes under the `/v1` prefix:

| Endpoint | Description |
| --- | --- |
| `POST /match` | Scores programs against a business profile and returns the highest ranking results. |
| `POST /stacks/suggest` | Suggests a stack of programs constrained by the business profile's CAPEX. |
| `POST /saved-queries` | Persists query presets for later reuse. |
| `GET /saved-queries/:id` | Fetches a previously saved query. |
| `DELETE /saved-queries/:id` | Removes a saved query. |
| `POST /alerts/subscriptions` | Manages alert subscriptions for webhook delivery. |
| `GET /admin/sources/health` | Surfaces ingestion health diagnostics for administrators. |

### Pagination and Limits

`POST /match` honors an optional `limit` filter but never returns more than 50
programs (`MAX_MATCH_RESULTS`) in a single response. Stack suggestions request up
to 150 candidates, trim to the best 100, and then run the stacking algorithm on
that subset.

## Matching and Scoring

The scoring engine combines jurisdiction, industry overlap, timing, size, and
freshness heuristics. Each component is normalized between 0 and 1 and multiplied
by configurable weights loaded from D1. The weighted score is rounded to an
integer between 0 and 100.

### Timing Score

The timing score measures how well the active window of a program overlaps with a
business profile's project dates. We compute the intersection between the two
intervals and divide it by the shortest finite duration among the profile and
program ranges. Using the shortest window rewards perfect alignment when either
side has a tight schedule and prevents artificially inflated scores when the other
side is open-ended or missing dates.

### Stack Suggestions

Stack suggestions iterate through scored programs (highest first), respecting
mutual exclusion tags, CAPEX caps, and duplicate-source suppression. Each chosen
program contributes at most its tagged maximum percentage of CAPEX. As soon as the
accumulated value matches the available CAPEX we exit early, record the
`capex_exhausted` constraint, and return the stack with overall coverage.

## Shared Utilities

The module also provides:

- KV-backed FX rate loading (`loadFxToUSD`).
- Query builders for program listings and coverage metrics.
- Middleware for authentication and rate limiting.

Tests for the API worker live under `tests/` and are executed with `bun test`.
