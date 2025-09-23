import type { D1Database } from '@cloudflare/workers-types';

import { formatDay } from '@common/dates';

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

function getScheduledTime(event: ScheduledEvent): number {
  const scheduled =
    typeof event === 'object' && event !== null
      ? (event as { scheduledTime?: unknown }).scheduledTime
      : undefined;
  if (typeof scheduled === 'number') {
    return scheduled;
  }
  if (typeof scheduled === 'string') {
    const parsed = Date.parse(scheduled);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  if (scheduled instanceof Date && !Number.isNaN(scheduled.valueOf())) {
    return scheduled.valueOf();
  }
  return Date.now();
}

function getCronExpression(event: ScheduledEvent): string | undefined {
  let candidate: unknown = undefined;
  if (typeof event === 'object' && event !== null && 'cron' in event) {
    candidate = (event as Record<string, unknown>).cron;
  }
  if (typeof candidate === 'string' && candidate.trim()) {
    return candidate.trim();
  }
  return undefined;
}

function shouldRunOutbox(event: ScheduledEvent): boolean {
  const cron = getCronExpression(event);

  if (cron) {
    const minuteToken = cron.split(/\s+/)[0];
    const parsed = Number(minuteToken);
    if (Number.isInteger(parsed)) {
      return parsed % 10 === 0;
    }
  }

  const when = new Date(getScheduledTime(event));
  return when.getUTCMinutes() % 10 === 0;
}

function shouldRunDailyMetrics(event: ScheduledEvent): boolean {
  const cron = getCronExpression(event);
  if (cron) {
    const normalized = cron.toLowerCase();
    if (normalized === '@daily') {
      return true;
    }
    const tokens = normalized.split(/\s+/);
    if (tokens.length >= 2) {
      const minuteToken = tokens[0];
      const hourToken = tokens[1];
      if (/^\d+$/.test(minuteToken) && /^\d+$/.test(hourToken)) {
        return true;
      }
    }
  }

  const when = new Date(getScheduledTime(event));
  return when.getUTCMinutes() === 0 && when.getUTCHours() === 0;
}

async function runDailyMetrics(env: IngestEnv, event: ScheduledEvent): Promise<void> {
  await checkDeadlinks(env);
  const day = formatDay(getScheduledTime(event));
  await writeDailyCoverage(env, day);
}

export default {
  async scheduled(event: ScheduledEvent, env: IngestEnv, _ctx: ExecutionContext) {
    await runCatalogOnce(env);

    if (shouldRunOutbox(event)) {
      await runOutbox(env);
    }

    if (shouldRunDailyMetrics(event)) {
      await runDailyMetrics(env, event);
    }
  }
};
