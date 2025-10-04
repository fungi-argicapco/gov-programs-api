import { svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import type { PluginOption } from 'vite';
import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const resolveFromRoot = (...segments: string[]) => path.resolve(__dirname, ...segments);

const sveltePlugin = svelte({
  hot: false,
  preprocess: vitePreprocess()
}) as PluginOption;

export default defineConfig({
  plugins: [sveltePlugin] as any,
  resolve: {
    alias: [
      { find: '@common', replacement: resolveFromRoot('packages/common/src') },
      { find: '@db', replacement: resolveFromRoot('packages/db/src') },
      { find: '@ml', replacement: resolveFromRoot('packages/ml/src') },
      { find: '@atlas/svelte', replacement: resolveFromRoot('packages/atlas-svelte/src/lib') },
      { find: '@atlas/components', replacement: resolveFromRoot('packages/atlas-svelte/src/lib/components') },
      { find: '@atlas/tokens', replacement: resolveFromRoot('packages/atlas-tokens/tokens.json') }
    ]
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['tests/setup-vitest.ts'],
    include: ['packages/atlas-svelte/src/lib/components/__tests__/**/*.vitest.ts'],
    pool: 'forks'
  }
});
