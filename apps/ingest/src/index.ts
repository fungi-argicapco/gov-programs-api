import { runCatalogOnce } from './catalog';
import { runOutbox } from './alerts.outbox';

function shouldRunOutbox(event: ScheduledEvent): boolean {
  const cron = (event as any)?.cron;

  if (typeof cron === 'string' && cron.trim()) {
    const minuteToken = cron.trim().split(/\s+/)[0];
    const parsed = Number(minuteToken);
    if (Number.isInteger(parsed)) {
      return parsed % 10 === 0;
    }
  }
  const scheduled = (event as any)?.scheduledTime;
  const when = scheduled ? new Date(scheduled) : new Date();
  return when.getUTCMinutes() % 10 === 0;
}

export default {
  async scheduled(event: ScheduledEvent, env: IngestEnv, _ctx: ExecutionContext) {
    await runCatalogOnce(env);
    if (shouldRunOutbox(_event)) {
      await runOutbox(env);
    }
  }
};
