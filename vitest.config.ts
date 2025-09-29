import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const resolveFromRoot = (...segments: string[]) => path.resolve(__dirname, ...segments);

export default defineConfig({
  resolve: {
    alias: [
      { find: '@common', replacement: resolveFromRoot('packages/common/src') },
      { find: '@db', replacement: resolveFromRoot('packages/db/src') },
      { find: '@ml', replacement: resolveFromRoot('packages/ml/src') }
    ]
  }
});
