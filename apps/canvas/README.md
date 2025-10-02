# Canvas Worker

The canvas service powers collaborative planning and onboarding flows for internal users. It shares authentication, session, and email primitives with the main API Worker.

## Highlights
- `src/index.ts` – Entry point for canvas APIs and Web UI rendering.
- `src/auth/` – Session validation helpers shared with the account onboarding flow.
- `src/templates/` – Server-rendered views and emails.

Ensure changes remain compatible with the Cloudflare Workers runtime and keep dependencies aligned with the main API Worker.
