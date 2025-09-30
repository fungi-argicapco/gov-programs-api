# Cloudflare deployment playbook

## 1. Bootstrap the environment
- Install dependencies with `bun install`.
- Copy `.env.example` to both `.env.dev.local` (local Worker simulations) and `.env` (production bindings). Keep Cloudflare account credentials in `.env`; populate `PROGRAM_API_BASE`, `EMAIL_ADMIN`, `EMAIL_SENDER`, and optional `SESSION_COOKIE_NAME` / `MFA_ISSUER` in both files.
- Authenticate Wrangler once: `bunx wrangler login`.

## 2. Provision core Cloudflare services
- **D1 database**: `bun run setup:remote` will now detect existing databases and re-use their identifiers—no need to delete and recreate if the name is already provisioned.
- **DNS**: the deploy script now enforces both `canvas.fungiagricap.com` and `program.fungiagricap.com` A-record placeholders (192.0.2.1, proxied). Ensure the API token has `Zone -> DNS:Edit` for `fungiagricap.com`.
- **Email routing & Postmark**: verify that `register@fungiagricap.com` is configured as a sending identity and that MX/SPF/DKIM/DMARC records exist. In Postmark, provision the transactional "outbound" stream, collect the Server Token, and store it with `bunx wrangler secret put POSTMARK_TOKEN` for both the API and canvas Workers. Add the webhook signing secret with `bunx wrangler secret put POSTMARK_WEBHOOK_SECRET` and point the webhook to `https://canvas.fungiagricap.com/api/postmark/webhook`.
- **KV / R2**: rerunning `bun run setup:remote` is idempotent—existing namespaces (`LOOKUPS`, `API_KEYS`) and the `gov-programs-api-raw` bucket are discovered via the Cloudflare API instead of re-creation attempts.

## 3. Deployment workflow
1. Run `bun run check` and `bun run build` locally.
2. Execute `bun run deploy`. This command:
   - Applies D1 migrations (`wrangler d1 migrations apply canvas-app`).
   - Deploys the Worker with Wrangler.
   - Verifies/creates DNS records for both canvas and program hostnames.
3. Tail logs or hit `/api/account/request` via `bun run cf:dev` to smoke test.

## 4. Post-deploy validation
- Submit an account request at `https://canvas.fungiagricap.com/signup` and confirm the record appears in D1 (`wrangler d1 execute canvas-app --command "SELECT * FROM account_requests"`).
- Use the decision endpoint (via the emailed token) to approve the request and ensure a default canvas is created for the user.
- Verify that `https://program.fungiagricap.com` resolves (served by the same Worker) so dependent apps can integrate.
- Confirm emails route through `register@fungiagricap.com` once Cloudflare Email Routing is configured.

Keep the API token scoped to Workers Scripts/Routes, D1, KV, R2, DNS, and Email Routing permissions needed by the deploy script. Store sensitive secrets such as `OPENAI_API_KEY` via `bunx wrangler secret put` rather than committing them to `.env`.
