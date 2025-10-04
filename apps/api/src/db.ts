import { drizzle } from 'drizzle-orm/d1';
export type Env = {
  DB: D1Database;
  LOOKUPS_KV?: KVNamespace;
  API_KEYS?: KVNamespace;
  RAW_R2?: R2Bucket;
  EMAIL_ADMIN?: string;
  EMAIL_SENDER?: string;
  EMAIL_PROVIDER?: string;
  POSTMARK_TOKEN?: string;
  POSTMARK_API_BASE?: string;
  POSTMARK_MESSAGE_STREAM?: string;
  PROGRAM_API_BASE?: string;
  SESSION_COOKIE_NAME?: string;
  ASSETS?: Fetcher;
};
export const getDb = (env: Env) => drizzle(env.DB);
