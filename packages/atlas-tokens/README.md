# Atlas Tokens

Source of truth for TechLand’s Atlas design tokens. Tokens are defined in `tokens.json` and the
build script generates CSS variables, a Tailwind preset, and TypeScript definitions.

## Generated assets

- `packages/atlas-svelte/src/lib/styles/tokens.css` – CSS custom properties for light/dark themes.
- `packages/atlas-tokens/tailwind.preset.cjs` – Tailwind configuration that mirrors the token values.
- `packages/atlas-tokens/tokens.d.ts` – Type definitions for consumers that import the JSON payload.

Run the build script whenever tokens change:

```bash
bun --cwd packages/atlas-tokens run build
```

This project intentionally avoids runtime dependencies and is consumed by the `atlas-svelte` package
and the SvelteKit web app.
