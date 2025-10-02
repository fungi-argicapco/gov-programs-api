# API Module Overview

The `apps/api/src` package implements the Cloudflare Worker that powers program discovery, scoring,
stack recommendations, saved queries, alerts, and operator endpoints. Handlers compose shared
utilities for persistence, request sanitisation, and scoring while remaining compatible with the
Workers runtime.

## Runtime & Operational Conventions
- **Runtime:** Cloudflare Workers using [Hono](https://hono.dev).
- **Database:** Cloudflare D1 via Drizzle. Always use prepared statements and keep table definitions in `packages/db`.
- **Content types:** JSON in/out; enforce `Content-Type: application/json` on requests with bodies.
- **Base path:** `/v1` for public APIs, `/admin` for operator console routes.

## Authentication, Quotas, and Rate Limits
- API keys (`x-api-key`) map to roles (`admin`, `partner`, `read`) and are hashed before storage.
- Usage is tracked in `usage_events`; quotas are enforced each request.
- Local rate limiting uses a token bucket; production relies on Cloudflare edge plus Worker-side accounting.
- `GET /v1/usage/me` exposes current counters so clients can self-monitor.

## Shared Data Shapes
Program responses include enriched benefits, criteria, tags, and automation metadata. Regenerate
`openapi.json` with `bun run openapi` whenever response fields change.

## Endpoint Reference Highlights
- `GET /v1/programs` – Search and paginate catalog entries.
- `GET /v1/programs/:id` – Fetch a single program by numeric ID or stable `uid`.
- `POST /v1/match` – Score programs for a business profile.
- `POST /v1/stacks/suggest` – Assemble recommended stacks using scoring outputs.
- `GET /v1/sources` & `/v1/stats/coverage` – Operator visibility into ingestion freshness.
- `/admin/*` – Lightweight operator console rendered server-side.

## Related Packages
- `packages/common` – Shared types and helpers.
- `packages/db` – Drizzle schema bindings.
- `apps/ingest` – Writes the program and playbook tables consumed here.

See [apps/api/README.md](../README.md) and [docs/ARCHITECTURE.md](../../../docs/ARCHITECTURE.md) for higher-level context.
