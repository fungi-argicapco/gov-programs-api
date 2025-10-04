# Atlas Svelte

Svelte component primitives built on top of the Atlas token set. Components lean on CSS variables
and avoid worker-incompatible APIs so they can render inside Cloudflare Workers and static sites.

## Components

- `AtlasButton` – Variants (`primary`, `secondary`, `ghost`, `destructive`) with loading/focus states.
- `AtlasBadge` – Status, tone, and color tokens for small indicators.
- `AtlasCard` – Surface styles and interactive states for grouped content.
- `AtlasInput` & `AtlasSelect` – Form controls that support labels, helper text, and error styling.
- `AtlasModal` – Focus-trapped dialog with keyboard shortcuts and overlay.

Shared styles live under `src/lib/styles` and are imported by the SvelteKit app via `app.css`.

Run the component test suite with Vitest:

```bash
bun run test:vitest
```

and keep `packages/atlas-tokens` up to date before publishing new primitives.
