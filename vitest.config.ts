import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const resolveFromRoot = (...segments: string[]) => path.resolve(__dirname, ...segments);

export default defineConfig({
  resolve: {
    alias: {
      '@common': resolveFromRoot('packages/common/src'),
      '@db': resolveFromRoot('packages/db/src'),
    },
  },
});
