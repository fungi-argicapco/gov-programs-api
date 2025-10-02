Follow root AGENTS.md for runtime/tooling constraints. Additional expectations for the API Worker:

- Keep routes compatible with the Cloudflare Workers runtime (no Node-only APIs, use Web Streams/Fetch).
- Update `openapi.json` via `bun run openapi` when request/response contracts change.
- Coordinate schema updates with `packages/db` migrations before persisting new fields.
- Mirror infrastructure or dependency additions in docs/ARCHITECTURE.md and apps/README.md.
