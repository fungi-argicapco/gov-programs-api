# gov-programs-api (US & Canada MVP)

## Quickstart
```bash
bun install
bash codex/env.setup.sh
bash scripts/setup.sh --local   # or --remote with CF creds
bun run typecheck
# Optional: start a local dev server
bunx wrangler dev
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

Normalization → upsertPrograms (idempotent), snapshots → R2 (hook in future PR)

## Next (U.K.)

Add SIC crosswalk expansion (LOOKUPS_KV), adapters for "Find a Grant", UKRI/HMRC tax reliefs.
