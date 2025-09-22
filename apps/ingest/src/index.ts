import { runCatalogOnce } from './catalog';

export default {
  async scheduled(_event: ScheduledEvent, env: { DB: D1Database; RAW_R2?: R2Bucket; LOOKUPS_KV?: KVNamespace; [key: string]: unknown }, _ctx: ExecutionContext) {
    await runCatalogOnce(env);
  }
};
