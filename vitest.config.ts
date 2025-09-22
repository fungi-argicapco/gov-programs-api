import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['**/*.test.ts']
  },
  resolve: {
    alias: {
      '@common': '/workspace/gov-programs-api/packages/common/src',
      '@db': '/workspace/gov-programs-api/packages/db/src'
    }
  }
});
