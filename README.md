# gov-programs-api (US & Canada MVP)

## Quickstart
> Bun is the only supported package/runtime manager. These commands have been verified on fresh macOS, Linux, and Codespaces environments.

```bash
# Install workspace dependencies (also invoked automatically by setup scripts)
bun install

# Bootstrap local configuration; safe to rerun and does not require Cloudflare credentials
bash codex/env.setup.sh
bun run setup:local

# Build the Svelte access portal assets (re-run when editing apps/web)
bun run web:build

# Validate the worker before opening a pull request
bun run typecheck
bun test

# Optional: start a local dev server once `.env.dev.local` contains PROGRAM_API_BASE and EMAIL_* values
bunx wrangler dev --local
```

### Local configuration details
- `bun run setup:local` writes `.env.dev.local` with placeholder Cloudflare bindings and Durable Object class names. Populate `PROGRAM_API_BASE`, `EMAIL_ADMIN`, and `EMAIL_SENDER` there to silence `wrangler dev` warnings. Optional keys (`SESSION_COOKIE_NAME`, `MFA_ISSUER`, `ALERTS_MAX_DELIVERY_ATTEMPTS`) are scaffolded for convenience.
- The setup script regenerates `wrangler.toml` from `wrangler.template.toml`, substituting local placeholders for the D1 database, KV namespaces, R2 bucket, and Durable Objects so that `bunx wrangler dev --local` works without remote credentials.
- Secrets (`OPENAI_API_KEY`, `POSTMARK_TOKEN`, etc.) stay out of the repo. Pipe them into Wrangler with `bunx wrangler secret put SECRET_NAME` whenever a local integration test requires them.

### Access portal (Svelte)
- The request portal lives in `apps/web` and is bundled into the Worker through Wrangler's `[assets]` binding.
- Run `bun run web:dev` for a hot-reload dev server (defaults to http://127.0.0.1:5173). Requests to `/v1`, `/admin`, `/docs`, and `/openapi.json` proxy to `http://127.0.0.1:8787` by default; override with `VITE_API_PROXY`.
- `bun run web:build` must be executed before `wrangler dev` or `bun run deploy` so the Worker can serve the latest compiled assets from `apps/web/dist`.
- Static builds are emitted to `apps/web/dist` and automatically uploaded during `bun run setup:*` and `bun run deploy`.

### Cloudflare prerequisites
- Copy `.env.example` to `.env` for staging/production environments. Provide `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, and `CLOUDFLARE_ZONE_ID` before running any remote setup.
- `bun run setup:remote` is idempotent: it reuses existing D1, KV, R2, and Durable Object resources when Cloudflare identifiers already exist, only creating what is missing. The rendered `wrangler.toml` is safe to check into CI.
- Application configuration consumed by downstream clients (`PROGRAM_API_BASE`, `EMAIL_ADMIN`, `EMAIL_SENDER`, optional session + MFA settings) must be supplied in both `.env` and `.env.dev.local` to unblock `bunx wrangler dev`.

## Deploying

```bash
# Ensure CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, and CLOUDFLARE_ZONE_ID are configured
bun run setup:remote      # provisions remote bindings and renders wrangler.toml
bun run deploy            # deploys the Worker and manages DNS for program.fungiagricap.com
```

`bun run deploy` rebuilds the Svelte access portal before invoking Wrangler so static assets remain in sync with the API bundle.

`bun run deploy` enforces the DNS record for `program.fungiagricap.com`, logging any existing record or creating a proxied entry when missing. Override defaults with `CUSTOM_DOMAIN`, `CUSTOM_DOMAIN_DNS_TYPE`, `CUSTOM_DOMAIN_TARGET`, or `CUSTOM_DOMAIN_PROXIED` environment variables if you need a different hostname. Durable Object migrations are bundled in the deploy step—ensure the target account has Durable Objects enabled before running the command.

## API

```
GET /v1/programs?q&country=US|CA&state=WA|province=ON&industry[]=334&benefit_type[]=grant&status[]=open&from=YYYY-MM-DD&to=YYYY-MM-DD&sort=-updated_at&page=1&page_size=25

GET /v1/programs/:id

GET /v1/stats/coverage

GET /v1/sources
```

## Ingestion

Adapters: rss_generic, html_table_generic, json_api_generic

Run `bun run ingest:once` to apply migrations against `data/ingest.dev.sqlite`, fetch all catalog sources once, and log diff summaries. Pass `--source us-fed-grants-gov` to target a specific adapter during development.

- `SAM_API_KEY` must be configured (and surfaced in `.env`/Wrangler vars) so the SAM Assistance Listing API accepts requests. Request a key from [sam.gov data services](https://sam.gov/data-services/assistance-listing-api) and rerun ingestion after setting it.

Phase 1 ships with fixture-backed sources for U.S. federal, U.S. state, and Canadian provincial programs under `data/sources/phase1.ts`. These populate D1 along with R2 snapshots and drive `/v1/sources` coverage data.

Normalization → upsertPrograms (idempotent), snapshots now persist raw payloads to R2 and catalog entries in the `snapshots` table.

## OpenAPI

```bash
bun run openapi   # emits openapi.json via ts-to-openapi
```

## Next (U.K.)

Add SIC crosswalk expansion (LOOKUPS_KV), adapters for "Find a Grant", UKRI/HMRC tax reliefs.
