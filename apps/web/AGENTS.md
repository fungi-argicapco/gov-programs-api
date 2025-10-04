Follow the root Bun/Workers constraints. Extra expectations for the portal:

- Maintain compatibility with the API routes exposed by apps/api; update the OpenAPI spec when new endpoints are used.
- Ensure `bun run web:build` stays deterministic and lint-clean before committing.
- Coordinate asset pipeline changes with Wrangler configuration in `wrangler.template.toml`.
- Keep the AppShell navigation (`src/lib/data/nav.ts`) and command palette actions aligned with actual routes before shipping new pages.
