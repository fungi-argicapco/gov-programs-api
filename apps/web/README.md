# Access Portal (SvelteKit)

This package contains the SvelteKit site surfaced to program applicants. The portal runs as a static
site bundled into the API Worker during setup/deploy. Routes live under `src/routes/` and consume the
shared Atlas primitives (`@atlas/svelte`).

## Commands
- `bun run web:dev` – Start the SvelteKit dev server (defaults to http://127.0.0.1:5173) with proxy rules to the Worker.
- `bun run web:build` – Produce production assets in `apps/web/build` (required before `wrangler dev` or deploy).
- `bun run web:sync` – Regenerate `.svelte-kit` manifests after updating routes, endpoints, or library imports.

## Integration Notes
- The dev server proxies `/v1`, `/admin`, `/docs`, and `/openapi.json` to `http://127.0.0.1:8787`; override via `VITE_API_PROXY`.
- Static assets are uploaded during `bun run setup:*` and `bun run deploy`.
- `src/routes/design/preview/+page.svelte` provides a live gallery for Atlas primitives.
- Update copy or styling with awareness of the API contract documented in `openapi.json`.

Refer to [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md) for the broader system context.
