import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = dirname(fileURLToPath(import.meta.url));
const packagesRoot = resolve(projectRoot, '..', '..', 'packages');

const config = {
  kit: {
    adapter: adapter(),
    alias: {
      '@atlas/svelte': resolve(packagesRoot, 'atlas-svelte/src/lib'),
      '@atlas/svelte/*': resolve(packagesRoot, 'atlas-svelte/src/lib/*'),
      '@atlas/components': resolve(packagesRoot, 'atlas-svelte/src/lib/components'),
      '@atlas/components/*': resolve(packagesRoot, 'atlas-svelte/src/lib/components/*'),
      '@atlas/tokens': resolve(packagesRoot, 'atlas-tokens/tokens.json'),
      '@atlas/tokens/*': resolve(packagesRoot, 'atlas-tokens/*')
    },
    prerender: {
      crawl: false,
      entries: ['/', '/design/preview'],
      handleHttpError: 'warn'
    }
  },
  compilerOptions: {
    hydratable: true
  },
  preprocess: vitePreprocess()
};

export default config;
