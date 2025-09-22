import { runCatalogOnce } from './catalog';
import { runOutbox } from './alerts.outbox';
import { checkDeadlinks, formatDay } from './deadlinks';
import { writeDailyCoverage } from './precompute.coverage';

function getScheduledDate(event: ScheduledEvent): Date {
  const scheduled = (event as any)?.scheduledTime;
  return scheduled ? new Date(scheduled) : new Date();
}

function shouldRunOutbox(event: ScheduledEvent): boolean {
  const cron = (event as any)?.cron;
  if (typeof cron === 'string' && cron.trim()) {
    const minuteToken = cron.trim().split(/\s+/)[0];
    const parsed = Number(minuteToken);
    if (Number.isInteger(parsed)) {
      return parsed % 10 === 0;
    }
  }
  const when = getScheduledDate(event);
  return when.getUTCMinutes() % 10 === 0;
}

function shouldRunDailyMetrics(event: ScheduledEvent): boolean {
  const when = getScheduledDate(event);
  return when.getUTCHours() === 0 && when.getUTCMinutes() === 0;
}

export default {
  async scheduled(_event: ScheduledEvent, env: { DB: D1Database; RAW_R2?: R2Bucket; LOOKUPS_KV?: KVNamespace; [key: string]: unknown }, _ctx: ExecutionContext) {
    await runCatalogOnce(env);
    if (shouldRunOutbox(_event)) {
      await runOutbox(env);
    }
    if (shouldRunDailyMetrics(_event)) {
      const when = getScheduledDate(_event);
      await Promise.all([checkDeadlinks(env), writeDailyCoverage(env, formatDay(when.getTime()))]);
    }
  }
};
