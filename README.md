# gov-programs-api (US & Canada MVP)

## Quickstart
```bash
bun install
bash codex/env.setup.sh
bun run setup:local   # or bun run setup:remote when CF creds are available
bun run typecheck
# Run tests
bun test
# Optional: start a local dev server
bunx wrangler dev

## Deploying

```bash
# Ensure CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, and CLOUDFLARE_ZONE_ID are configured
bun run setup:remote      # provisions remote bindings and renders wrangler.toml
bun run deploy            # deploys the Worker and manages DNS for program.fungiagricap.com
```

`bun run deploy` enforces the DNS record for `program.fungiagricap.com`, logging any existing record or creating a proxied entry when missing. Override defaults with `CUSTOM_DOMAIN`, `CUSTOM_DOMAIN_DNS_TYPE`, `CUSTOM_DOMAIN_TARGET`, or `CUSTOM_DOMAIN_PROXIED` environment variables if you need a different hostname.
```

## API

```
GET /v1/programs?q&country=US|CA&state=WA|province=ON&industry[]=334&benefit_type[]=grant&status[]=open&from=YYYY-MM-DD&to=YYYY-MM-DD&sort=-updated_at&page=1&page_size=25

GET /v1/programs/:id

GET /v1/stats/coverage

GET /v1/sources
```

## Ingestion

Adapters: rss_generic, html_table_generic, json_api_generic

Phase 1 ships with fixture-backed sources for U.S. federal, U.S. state, and Canadian provincial programs under `data/sources/phase1.ts`. These populate D1 along with R2 snapshots and drive `/v1/sources` coverage data.

Normalization → upsertPrograms (idempotent), snapshots now persist raw payloads to R2 and catalog entries in the `snapshots` table.

## OpenAPI

```bash
bun run openapi   # emits openapi.json via ts-to-openapi
```

## Next (U.K.)

Add SIC crosswalk expansion (LOOKUPS_KV), adapters for "Find a Grant", UKRI/HMRC tax reliefs.
