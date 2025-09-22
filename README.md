# gov-programs-api

Database, ingestion pipeline, and Cloudflare Worker API that centralizes public incentive, grant, and credit programs with fast search, filtering, and scheduled updates.

## Prerequisites

- [Bun](https://bun.sh) v1.1+
- Cloudflare account with access to D1, R2, Workers KV, and Durable Objects

## Getting Started

```bash
# 1. Install bun dependencies and verify runtime
./codex/env.setup.sh

# 2. Provision Cloudflare resources (D1, KV, R2) and generate wrangler.toml
bun run setup

# 3. Type-check the monorepo and run tests
bun run typecheck
bun run test
```

The setup script writes Cloudflare resource identifiers into `.env`, renders `wrangler.toml` from `wrangler.template.toml`, and installs Worker runtime dependencies via Bun. Rerun it anytime you need to refresh configuration.

## Local Development

### API Worker

Start Miniflare and expose the Hono API:

```bash
bun run dev:api
```

Example requests once the worker is running:

```bash
curl 'http://localhost:8787/v1/health'

curl 'http://localhost:8787/v1/programs?state=CA&industry=54&benefit_type=grant&sort=recent'

curl 'http://localhost:8787/v1/programs/11111111-1111-1111-1111-111111111111'

curl 'http://localhost:8787/v1/stats/coverage'

curl 'http://localhost:8787/v1/sources'
```

### Database Schema

The schema lives in `packages/db/src/schema.ts` and migrations in `packages/db/migrations`. Apply them locally with:

```bash
bunx wrangler d1 migrations apply gov-programs-api-db --local
```

### Ingestion Worker

The scheduled worker (`apps/ingest`) assembles adapter results and upserts normalized programs into D1, updates the FTS index, and snapshots raw payloads into the R2 bucket. Register additional sources by importing `registerSource` from `apps/ingest/src/index.ts` and pushing new `SourceConfig` entries (or storing them in KV/Configs before invoking the adapters).

## Adding a New Adapter

Adapters live under `apps/ingest/src/adapters`. Each adapter exports an `Adapter` implementation with:

- `name`: stable identifier
- `supports(url)`: quick capability check
- `execute(url, { fetch })`: resolves to `{ programs, raw }`

To add a new adapter:

1. Create `apps/ingest/src/adapters/<name>.ts` that normalizes results into the shared `Program` schema from `packages/common/src/types.ts`.
2. Export it through `apps/ingest/src/adapters/index.ts` and add it to the `adapters` array in `apps/ingest/src/index.ts`.
3. Cover the parser with a Vitest unit test alongside `adapters.test.ts`.

## Testing

```bash
bun run typecheck
bun run test
```

Tests use Miniflare-backed D1 databases to exercise the API and ingestion logic. API specs live in `apps/api/src/index.test.ts` and ingestion adapter tests in `apps/ingest/src/adapters/adapters.test.ts`.

## Continuous Integration

GitHub Actions workflow (`.github/workflows/ci.yml`) performs:

1. `bun install`
2. Type-check (`bun run typecheck`)
3. Tests (`bun run test`)
4. D1 migrations dry-run (`bunx wrangler d1 migrations apply ... --local`)
5. Workers deploy dry-run (`bunx wrangler deploy --dry-run`)

Set the following repository secrets for deploy steps: `CF_ACCOUNT_ID`, `CF_API_TOKEN`, and `CF_D1_DATABASE_ID`.
