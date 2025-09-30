# Cloudflare deployment playbook

## 1. Bootstrap the environment
- Install dependencies with `bun install` (also invoked automatically by the setup script).
- Run `bash codex/env.setup.sh` followed by `bun run setup:local` to generate `.env.dev.local`, placeholder bindings, and a fresh `wrangler.toml`.
- Copy `.env.example` to `.env` for staging/production usage. Keep Cloudflare account credentials in `.env`; populate `PROGRAM_API_BASE`, `EMAIL_ADMIN`, `EMAIL_SENDER`, and optional `SESSION_COOKIE_NAME` / `MFA_ISSUER` / `ALERTS_MAX_DELIVERY_ATTEMPTS` in both environment files to avoid runtime warnings.
- Authenticate Wrangler once with `bunx wrangler login` so that subsequent commands can provision resources.

## 2. Provision core Cloudflare services
- **D1 database**: `bun run setup:remote` detects existing databases and reuses their identifiers—no need to delete and recreate if the `gov-programs-api-db` name is already provisioned.
- **Durable Objects**: rate limiter and metrics classes are registered automatically when `setup:remote` runs. Confirm the Workers account allows Durable Objects before deploying.
- **DNS**: the deploy script enforces `program.fungiagricap.com` as a proxied CNAME/record targeting Workers. Ensure the API token has `Zone -> DNS:Edit` for the managed zone.
- **Email routing & Postmark**: verify that `register@fungiagricap.com` is configured as a sending identity and that MX/SPF/DKIM/DMARC records exist. In Postmark, provision the transactional stream, collect the Server Token, and store it with `bunx wrangler secret put POSTMARK_TOKEN`. Capture the webhook signing secret with `bunx wrangler secret put POSTMARK_WEBHOOK_SECRET` once the webhook endpoint is exposed.
- **KV / R2**: rerunning `bun run setup:remote` is idempotent—existing namespaces (`LOOKUPS`, `API_KEYS`) and the `gov-programs-api-raw` bucket are discovered via the Cloudflare API instead of re-creation attempts.

## 3. Deployment workflow
1. Validate the worker locally with `bun run typecheck` and `bun test`.
2. Ensure `.env` contains Cloudflare credentials and application variables, then run `bun run setup:remote` to sync bindings and identifiers.
3. Execute `bun run deploy`. This command:
   - Applies Durable Object migrations defined in `wrangler.toml`.
   - Deploys the Worker with Wrangler.
   - Verifies or creates the DNS record for `program.fungiagricap.com`, logging existing records instead of overwriting them.
4. Tail logs with `bunx wrangler tail` or hit `/v1/programs` via `bunx wrangler dev --local` for a smoke test.

## 4. Post-deploy validation
- Verify that `https://program.fungiagricap.com` resolves and responds to `GET /v1/programs` with a 200 status.
- Confirm D1 migrations ran by checking schema updates introduced through `0010_canvas_onboarding.sql` (e.g. `canvas_invites`) via `bunx wrangler d1 execute`.
- Trigger a smoke ingestion or scheduled run (if enabled) and ensure logs reflect Durable Object initialisation without errors.
- Confirm transactional email flows (Postmark webhook + sender) once secrets are configured.

Keep the API token scoped to Workers Scripts/Routes, D1, KV, R2, DNS, and Email Routing permissions needed by the deploy script. Store sensitive secrets such as `OPENAI_API_KEY` via `bunx wrangler secret put` rather than committing them to `.env`.
