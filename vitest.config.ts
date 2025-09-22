import { defineConfig } from 'vitest/config';
import path from 'node:path';

const resolveFromRoot = (...segments: string[]) => path.resolve(__dirname, ...segments);

export default defineConfig({
  resolve: {
    alias: {
      '@common': resolveFromRoot('packages/common/src'),
      '@db': resolveFromRoot('packages/db/src'),
    },
  },
});
