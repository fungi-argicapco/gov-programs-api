# API Worker

The API Worker serves the public `/v1` surface, operator console, and document generation endpoints. It is implemented with Hono and runs in the Cloudflare Workers runtime.

## Key Paths
- `src/index.ts` – Router entry point.
- `src/email/` – Email provider abstractions (console, Postmark, future providers).
- `src/mw.*.ts` – Auth, quota, and instrumentation middleware.
- `src/routes/` – Feature-specific handlers (program search, stacks, saved queries, admin surface).

## Build & Deploy
- `bun run typecheck` and `bun test` should pass before publishing.
- The Worker is bundled and deployed via `bun run deploy`; see root README for full workflow.
- Static assets from `apps/web` are uploaded automatically when `bun run web:build` runs as part of setup/deploy.

Consult [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md) for an overview of how this Worker interacts with ingestion, persistence, and front-end clients.
