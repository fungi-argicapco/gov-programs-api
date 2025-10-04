import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const resolveFromRoot = (...segments: string[]) =>
  path.resolve(__dirname, ...segments);

export default defineConfig(async () => {
  const { svelte, vitePreprocess } = await import('@sveltejs/vite-plugin-svelte');

  const sveltePlugin = svelte({
    hot: false,
    preprocess: vitePreprocess()
  });

  return {
    plugins: sveltePlugin,
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
      // Use happy-dom as our DOM emulation environment instead of jsdom.
      environment: 'happy-dom',
      globals: true,
      setupFiles: ['tests/setup-vitest.ts'],
      include: ['packages/atlas-svelte/src/lib/components/__tests__/**/*.vitest.ts'],
      // Avoid using Node worker threads by running tests in forked processes.
      pool: 'forks',
      // Disable concurrency and isolation to simplify the runtime and avoid deadlocks.
      threads: false,
      isolate: false
    }
  } as any;
});
