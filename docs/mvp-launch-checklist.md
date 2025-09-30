# MVP Launch Checklist

This checklist synthesizes the repo's design docs into an ordered plan to take the US/Canada MVP live.

## 1. Local bootstrap & verification
- Install dependencies and render local configuration with Bun-only tooling: `bun install`, `bash codex/env.setup.sh`, `bun run setup:local`, then run type checking and tests via `bun run typecheck` and `bun test`. These commands are required before any deploys. 
- Optional: run `bunx wrangler dev` to exercise the Worker locally once type checking and tests pass.

## 2. Configure production secrets & environment
- Export Cloudflare credentials (`CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ZONE_ID`) in the deployment environment so the automated scripts can provision bindings and DNS.
- Provide application-specific environment values expected by the Canvas/API surface: `PROGRAM_API_BASE`, `EMAIL_ADMIN`, `EMAIL_SENDER`, optional `SESSION_COOKIE_NAME`, and `MFA_ISSUER`. Confirm Cloudflare Email Routing is set up for the sender/forwarding rules.
- Ensure Durable Object support is enabled for the Workers plan, and keep `WORKERS_EMAIL_R2_BUCKET` ready if email templating is externalised later.

## 3. Database migrations & schema readiness
- Apply existing D1 migrations through `bun run setup:remote` and explicit migration commands so tables such as `ingestion_runs`, `program_diffs`, and `canvas` onboarding structures are live before ingestion.
- Verify the latest SQL files (`0003_ingest_obs.sql`, `0010_canvas_onboarding.sql`) have been applied to production to unlock observability and onboarding flows.

## 4. Replace fixtures with the live source catalog
- Implement the Phase 2 source catalog (`data/sources/phase2.ts`) to cover Grants.gov, SAM Assistance, Canada Open Government, and Ontario CKAN feeds with their mapper functions.
- Hook the ingestion worker to the catalog dispatcher so it enforces the shared rate limiter, records snapshots to R2 when available, and normalises source metadata into the `sources` table.
- Confirm mapper registry entries (`mapGrantsGov`, `mapSamAssistance`, `mapCkanGC`, `mapCkanProvON`) accurately translate payloads and return enriched programs.

## 5. Enrichment, coverage, and observability
- Ensure NAICS enrichment via `enrichNaics` is wired to Cloudflare KV fallback behaviour so programs carry industry codes even when remote lookups are missing.
- Populate coverage metrics (`/v1/sources`, `/v1/stats/coverage`) using the new observability tables; validate freshness windows (≤6h for 4h sources, ≤30h for daily) and NAICS density calculations.
- Confirm `ingestion_runs` and `program_diffs` are being written each cycle and that partial/error runs still log diagnostics for debugging.

## 6. Automated testing & CI
- Maintain unit tests for NAICS enrichment, catalog dispatch, and query builders alongside Bun type checking to keep CI green.
- Add optional ingestion dry-run coverage that uses fixtures/stubs to simulate scheduled execution without network calls.

## 7. Deployment & DNS
- With secrets configured, run `bun run setup:remote` to render `wrangler.toml` with production bindings, then `bun run deploy` to publish the Worker and enforce the DNS record (`program.fungiagricap.com` by default). Override DNS environment variables only if a different hostname is required.
- After deployment, verify the Worker responds on the target domain and that DNS propagation completed successfully.

## 8. Post-deploy validation & rollout
- Execute the rollout plan: apply schema migrations locally first, enable the catalog-driven ingestion loop behind a feature flag or staged cron, and monitor observability dashboards for healthy runs.
- Validate `/v1/sources` and `/v1/stats/coverage` payloads for completeness, ensuring new fields do not break downstream consumers.
- Once stable, expand the catalog to additional jurisdictions while tracking success criteria (all sources ingest within SLA, coverage endpoints accurate, automation passing).

