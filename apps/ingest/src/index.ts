import { runCatalogOnce } from './catalog';
import { runOutbox } from './alerts.outbox';
import { checkDeadlinks } from './deadlinks';
import { writeDailyCoverage } from './precompute.coverage';

type IngestEnv = {
  DB: D1Database;
  RAW_R2?: R2Bucket;
  LOOKUPS_KV?: KVNamespace;
  [key: string]: unknown;
};

function getEventDate(event: ScheduledEvent): Date {
  const scheduled = (event as any)?.scheduledTime;
  return scheduled ? new Date(scheduled) : new Date();
}

function shouldRunOutbox(event: ScheduledEvent): boolean {
  const cron = (event as any)?.cron;
  const when = getEventDate(event);
  if (typeof cron === 'string' && cron.trim()) {
    const minuteToken = cron.trim().split(/\s+/)[0];
    const parsed = Number(minuteToken);
    if (Number.isInteger(parsed)) {
      return when.getUTCMinutes() === parsed;
    }
    if (minuteToken.startsWith('*/')) {
      const interval = Number(minuteToken.slice(2));
      if (Number.isInteger(interval) && interval > 0) {
        return when.getUTCMinutes() % interval === 0;
      }
    }
  }
  return when.getUTCMinutes() % 10 === 0;
}

function shouldRunDeadlinks(event: ScheduledEvent): boolean {
  const when = getEventDate(event);
  return when.getUTCHours() === 3 && when.getUTCMinutes() === 10;
}

function shouldRunDailyCoverage(event: ScheduledEvent): boolean {
  const when = getEventDate(event);
  return when.getUTCHours() === 3 && when.getUTCMinutes() === 20;
}

export default {
  async scheduled(event: ScheduledEvent, env: IngestEnv, _ctx: ExecutionContext) {
    await runCatalogOnce(env);
    if (shouldRunOutbox(event)) {
      await runOutbox(env);
    }
    if (shouldRunDeadlinks(event)) {
      await checkDeadlinks(env);
    }
    if (shouldRunDailyCoverage(event)) {
      await writeDailyCoverage(env);
    }
  }
};
