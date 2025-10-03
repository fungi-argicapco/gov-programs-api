# D1 migration runbook

This guide documents the steps to apply database migrations through `migrations/0010_canvas_onboarding.sql` for both local smoke tests and Cloudflare D1 environments. Run these steps whenever new SQL files land in the repo or when onboarding a fresh Cloudflare account.

## Prerequisites
- Bun runtime (`bun -v`) and Wrangler CLI (`bunx wrangler --version`).
- `.env.dev.local` and `.env` generated via `bun run setup:local` / `bun run setup:remote` with the `DB` binding pointing at `gov-programs-api-db`.
- Cloudflare credentials exported in `.env` (`CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ZONE_ID`).

## Local dry run
1. Ensure fixtures are installed: `bun install && bun run setup:local`.
2. Start a disposable SQLite instance with Bun (uses better-sqlite3 under the hood):
   ```bash
   bunx wrangler d1 execute gov-programs-api-db --local --command "SELECT 1" >/dev/null
   ```
   Wrangler provisions a local SQLite database inside `.wrangler/state/d1/` when invoked with `--local`.
3. Apply migrations sequentially through `0010_canvas_onboarding.sql`:
   ```bash
   bunx wrangler d1 migrations apply gov-programs-api-db --local
   ```
4. Verify the schema:
   ```bash
   bunx wrangler d1 execute gov-programs-api-db --local --command "SELECT name FROM sqlite_master WHERE name IN ('ingestion_runs','program_diffs','canvas_invites');"
   ```
   All three tables must be returned to proceed.

_2025-10-03 validation transcript:_

```
$ bunx wrangler d1 migrations apply gov-programs-api-db --local
Applying 10 migrations locally...
🆗 0010_canvas_onboarding.sql
Applied 10 migrations.

$ bunx wrangler d1 execute gov-programs-api-db --local --command "SELECT name FROM sqlite_master WHERE name IN ('ingestion_runs','program_diffs','canvas_invites');"
{"name":"ingestion_runs"}
{"name":"program_diffs"}
{"name":"canvas_invites"}
```

## Remote application (staging / production)
1. Populate `.env` with Cloudflare credentials and rerender bindings:
   ```bash
   bun run setup:remote
   ```
   The script is idempotent—existing D1/KV/R2 resources are reused and identifiers are preserved in `.env`.
2. List migrations and confirm `0010_canvas_onboarding` is pending:
   ```bash
   bunx wrangler d1 migrations list gov-programs-api-db
   ```
3. Apply outstanding migrations:
   ```bash
   bunx wrangler d1 migrations apply gov-programs-api-db
   ```
   Wrangler will skip already-applied migrations and only run the newest files.
4. Smoke check critical tables after the run:
   ```bash
   bunx wrangler d1 execute gov-programs-api-db --command "SELECT COUNT(*) AS tables FROM sqlite_master WHERE name IN ('ingestion_runs','program_diffs','canvas_invites');"
   ```
   The query must return `3` to confirm observability (`ingestion_runs`, `program_diffs`) and onboarding (`canvas_invites`) tables exist.

## Troubleshooting
- **Migration already exists**: Wrangler treats migrations as idempotent; reruns output informational logs and exit successfully. Review `.wrangler/state/v3/migrations/*.json` locally to confirm history.
- **Permission errors**: Ensure the API token grants `Workers Scripts`, `Workers KV`, `Workers R2 Storage`, `Workers Durable Objects`, and `D1` write permissions. DNS `Edit` is required for deployment but not for migration execution.
- **Rollback requirements**: D1 currently does not support automatic down migrations. Create a new SQL file that reverses the schema changes (e.g., dropping columns/tables) and apply it forward if rollback is necessary.

Document the migration timestamp and database UUID (see `bunx wrangler d1 list --json`) in incident notes or change logs for traceability. When rerunning `bun run setup:remote`, confirm the script reports reused identifiers to avoid accidental database recreation.
