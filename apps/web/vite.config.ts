import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const API_PROXY_TARGET = process.env.VITE_API_PROXY ?? 'http://127.0.0.1:8787';
const rootDir = dirname(fileURLToPath(import.meta.url));

const atlasRoot = resolve(rootDir, '..', '..', 'packages');

export default defineConfig({
  resolve: {
    alias: {
      '@atlas/components': resolve(atlasRoot, 'atlas-svelte/src/lib/components'),
      '@atlas/components/*': resolve(atlasRoot, 'atlas-svelte/src/lib/components/*'),
      '@atlas/svelte': resolve(atlasRoot, 'atlas-svelte/src/lib'),
      '@atlas/svelte/*': resolve(atlasRoot, 'atlas-svelte/src/lib/*'),
      '@atlas/tokens': resolve(atlasRoot, 'atlas-tokens/tokens.json'),
      '@atlas/tokens/*': resolve(atlasRoot, 'atlas-tokens/*')
    }
  },
  plugins: [sveltekit()],
  server: {
    port: 5173,
    host: '127.0.0.1',
    fs: {
      allow: [rootDir, resolve(rootDir, '..', '..'), atlasRoot]
    },
    proxy: {
      '/v1': API_PROXY_TARGET,
      '/admin': API_PROXY_TARGET,
      '/docs': API_PROXY_TARGET,
      '/openapi.json': API_PROXY_TARGET
    }
  }
});
