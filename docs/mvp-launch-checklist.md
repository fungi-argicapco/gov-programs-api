# MVP Launch Checklist

This checklist synthesizes the repo's design docs into an ordered plan to take the US/Canada MVP live.

## 1. Local bootstrap & verification
- Run the Bun-only setup flow on a fresh clone to confirm onboarding docs are accurate:
  1. `bun install` – Install project dependencies (also invoked automatically by setup scripts).
  2. `bash codex/env.setup.sh` – Ensure Bun is installed and render local scaffolding.
  3. `bun run setup:local` – Generate `.env.dev.local`, `wrangler.toml`, and placeholder bindings.
  4. `bun run web:build` – Compile the Svelte access portal into `apps/web/dist` so Wrangler can serve fresh assets.
  5. `bun run typecheck` – Run strict TypeScript checks.
  6. `bun test` – Execute the test suite.
- Populate `PROGRAM_API_BASE`, `EMAIL_ADMIN`, and `EMAIL_SENDER` inside `.env.dev.local` before running `bunx wrangler dev --local`; optional keys (`SESSION_COOKIE_NAME`, `MFA_ISSUER`, `ALERTS_MAX_DELIVERY_ATTEMPTS`) are scaffolded for convenience.
- Smoke-test the worker locally with `bunx wrangler dev --local` once type checking and tests pass to ensure scheduled handlers and bindings resolve correctly.

## 2. Configure production secrets & environment
- Export Cloudflare credentials (`CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ZONE_ID`) in the deployment environment so the automated scripts can provision bindings and DNS.
- Provide application-specific environment values expected by the worker: `PROGRAM_API_BASE`, `EMAIL_ADMIN`, `EMAIL_SENDER`, optional `SESSION_COOKIE_NAME`, `MFA_ISSUER`, and `ALERTS_MAX_DELIVERY_ATTEMPTS`. Mirror them in `.env.dev.local` for `wrangler dev` parity.
- After updating `.env`, run `bun run setup:remote` to render `wrangler.toml`. The command is idempotent—it discovers existing D1, KV, R2, and Durable Object resources and only creates what is missing while preserving identifiers in the environment file.
- Ensure Durable Object support is enabled for the target Workers account; Metrics and rate-limiter classes are declared automatically by the setup script.
- Manage sensitive keys (e.g. `OPENAI_API_KEY`, `POSTMARK_TOKEN`, `GITHUB_TOKEN`) with `bunx wrangler secret put`; plain-text configuration such as `PROGRAM_API_BASE` can stay under `[vars]` in `wrangler.toml` or be supplied at deploy time via `bunx wrangler deploy --var KEY=VALUE`.

## 3. Database migrations & schema readiness
- Follow the [D1 migration runbook](./d1-migration-runbook.md) to apply SQL files sequentially through `0010_canvas_onboarding.sql` in staging and production environments.
- Confirm `bun run setup:remote` has rendered the D1 binding and use `bunx wrangler d1 migrations apply gov-programs-api-db` (or the configured database name) to apply outstanding migrations after reviewing them locally.
- Verify observability tables (`ingestion_runs`, `program_diffs`) and onboarding tables introduced through `0010_canvas_onboarding.sql` exist in the target database before enabling ingestion or Canvas flows.

## 4. Replace fixtures with the live source catalog
- Implement the Phase 2 source catalog (`data/sources/phase2.ts`) to cover Grants.gov, SAM Assistance, Canada Open Government, and Ontario CKAN feeds with their mapper functions.
- Hook the ingestion worker to the catalog dispatcher so it enforces the shared rate limiter, records snapshots to R2 when available, and normalises source metadata into the `sources` table.
- Confirm mapper registry entries (`mapGrantsGov`, `mapSamAssistance`, `mapCkanGC`, `mapCkanProvON`) accurately translate payloads and return enriched programs.

## 5. Enrichment, coverage, and observability
- Ensure NAICS enrichment via `enrichNaics` is wired to Cloudflare KV fallback behaviour so programs carry industry codes even when remote lookups are missing.
- Populate coverage metrics (`/v1/sources`, `/v1/stats/coverage`) using the new observability tables.
- Confirm `ingestion_runs` and `program_diffs` are being written each cycle and that partial/error runs still log diagnostics for debugging.
- Track NAICS density and tag coverage targets (≥90% of programs with at least one NAICS code, ≥95% with tags) through `/v1/stats/coverage` and alert on regressions.
- Build or update dashboards that surface ingestion run counts, last-success timestamps, NAICS density trends, and stale-source thresholds for ops readiness.

## 6. Automated testing & CI
- Maintain unit tests for NAICS enrichment, catalog dispatch, and query builders alongside Bun type checking to keep CI green.
- Add optional ingestion dry-run coverage that uses fixtures/stubs to simulate scheduled execution without network calls.

## 7. Deployment & DNS
- Ensure all required secrets are configured in the deployment environment.
- Run `bun run setup:remote` to render `wrangler.toml` with production bindings.
- Run `bun run deploy` to publish the Worker, apply Durable Object migrations, and enforce the DNS record (`program.fungiagricap.com` by default). The script logs any existing record and only creates a new proxied entry when missing.
- Override DNS environment variables only if a different hostname is required.
- After deployment, verify the Worker responds on the target domain and that DNS propagation completed successfully.

## 8. Post-deploy validation & rollout
- Execute the rollout plan: apply schema migrations locally first, enable the catalog-driven ingestion loop behind a feature flag or staged cron, and monitor observability dashboards for healthy runs.
- Run `bun run postdeploy:validate --base-url=https://programs.api.example.com` (override the URL as needed) after each deploy to confirm:
  - `/v1/sources` freshness adheres to SLA windows (≤6h for `4h` sources, ≤30h for `daily`).
  - `/v1/stats/coverage` NAICS density remains ≥90% and tag coverage stays on target.
  - Coverage report history trends are being persisted for dashboards.
- Validate `/v1/sources` and `/v1/stats/coverage` payloads for completeness, ensuring new fields do not break downstream consumers.
- Review the [progressive rollout plan](./progressive-rollout-plan.md) before adding new jurisdictions; confirm data quality exit criteria (freshness, NAICS/tag density, alert coverage) are met for each cohort.
- Once stable, expand the catalog to additional jurisdictions while tracking success criteria (all sources ingest within SLA, coverage endpoints accurate, automation passing).
