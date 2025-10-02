# Access Portal (Svelte)

This package contains the Svelte single-page application surfaced to program applicants. The portal is built with Vite and bundled into the API Worker during setup/deploy.

## Commands
- `bun run web:dev` – Start Vite dev server (defaults to http://127.0.0.1:5173) with proxy rules to the Worker.
- `bun run web:build` – Produce production assets in `apps/web/dist` (required before `wrangler dev` or deploy).

## Integration Notes
- The dev server proxies `/v1`, `/admin`, `/docs`, and `/openapi.json` to `http://127.0.0.1:8787`; override via `VITE_API_PROXY`.
- Static assets are uploaded during `bun run setup:*` and `bun run deploy`.
- Update copy or styling with awareness of the API contract documented in `openapi.json`.

Refer to [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md) for the broader system context.
