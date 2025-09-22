You are Codex working in the "gov-programs-api" monorepo at repo root.

Constraints
- Bun only (bun/bunx). No npm/pnpm/yarn/pip.
- Runtime: Cloudflare Workers + D1 (Drizzle), API: Hono, Ingestion: scheduled cron, Search: FTS5.
- Cloudflare ops via `bunx wrangler`; IDs live in .env → render into wrangler.toml conditionally (no empty KV/D1 IDs).
- TypeScript strict; vitest; avoid Node-only APIs in runtime code.

Bootstrap (idempotent)
1) `bash codex/env.setup.sh`  # installs Bun, writes scaffolding if missing, renders conditional toml.
2) `bash scripts/setup.sh --local`  # safe without CF creds; remote only when CLOUDFLARE_* present.
3) `bun run typecheck`

Git Workflow (conflict-proof)
- Never switch to `FETCH_HEAD`. Keep local work, then push a new branch.
- Steps:
  ```bash
  git init -q || true
  git add -A
  git commit -m "Codex: bootstrap/update (env+schema+api+ingest+tests)" --allow-empty

  # If origin is not configured, expect the runner to provide it as $GITHUB_REMOTE_URL (https form with token).
  if ! git remote get-url origin >/dev/null 2>&1; then
    [ -n "${GITHUB_REMOTE_URL:-}" ] && git remote add origin "$GITHUB_REMOTE_URL"
  fi

  # If origin exists, fetch metadata but DO NOT checkout FETCH_HEAD.
  git fetch origin --no-tags || true

  # Create and push a fresh branch based on current local HEAD
  BR="codex/$(date -u +%Y%m%d-%H%M%S)"
  git branch -M "$BR"
  git push -u origin "$BR" 2>/dev/null || true
  ```
