import { drizzle } from 'drizzle-orm/d1';
export type Env = {
  DB: D1Database;
  LOOKUPS_KV?: KVNamespace;
  API_KEYS?: KVNamespace;
  RAW_R2?: R2Bucket;
};
export const getDb = (env: Env) => drizzle(env.DB);
