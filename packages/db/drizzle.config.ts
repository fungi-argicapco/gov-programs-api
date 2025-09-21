import type { Config } from 'drizzle-kit';

export default {
  schema: './src/schema.ts',
  out: './migrations',
  driver: 'd1',
  dbCredentials: {
    wranglerConfigPath: '../../apps/api/wrangler.toml',
    dbName: 'gov-programs-db',
  },
} satisfies Config;