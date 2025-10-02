# Apps Overview

This folder contains the deployable Workers and front-end bundle referenced in [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md).

- `api/` – Cloudflare Worker exposing the public `/v1` API, operator console, and OpenAPI artifacts.
- `ingest/` – Worker and helpers that fetch external sources, normalize programs, and maintain coverage metrics.
- `canvas/` – Collaborative canvas service and onboarding workflow for internal operators.
- `web/` – Svelte access portal that is bundled and served through the API Worker.

See each subdirectory for runtime-specific READMEs and AGENTS.
