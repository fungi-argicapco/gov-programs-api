import type { D1Database } from '@cloudflare/workers-types';
import { formatDay } from '@common/dates';
import { type DeadlinkMetricsRecord } from './deadlinks';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

type DeadlinkRecord = DeadlinkMetricsRecord['bad'][number];
export type DeadlinkMetrics = { rate: number } & Partial<DeadlinkMetricsRecord>;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0;
}

function isDeadlinkRecord(entry: unknown): entry is DeadlinkRecord {
  if (!entry || typeof entry !== 'object') return false;
  const record = entry as Partial<DeadlinkRecord>;
  return isNonNegativeFiniteNumber(record.id) && typeof record.url === 'string';
}

export function isDeadlinkMetrics(value: unknown): value is DeadlinkMetrics {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<DeadlinkMetricsRecord>;

  if (!isFiniteNumber(candidate.rate)) {
    return false;
  }

  if (candidate.n !== undefined && !isNonNegativeFiniteNumber(candidate.n)) {
    return false;
  }

  if (candidate.bad !== undefined) {
    if (!Array.isArray(candidate.bad) || !candidate.bad.every(isDeadlinkRecord)) {
      return false;
    }
  }

  return true;
}

export function isDeadlinkMetricsRecord(value: unknown): value is DeadlinkMetricsRecord {
  if (!isDeadlinkMetrics(value)) return false;
  const candidate = value as Partial<DeadlinkMetricsRecord>;

  if (!isNonNegativeFiniteNumber(candidate.n)) {
    return false;
  }

  if (!Array.isArray(candidate.bad) || !candidate.bad.every(isDeadlinkRecord)) {
    return false;
  }

  return true;
}

type IngestEnv = {
  DB: D1Database;
  LOOKUPS_KV?: KVNamespace;
};

export async function writeDailyCoverage(env: IngestEnv, dayStr?: string): Promise<void> {
  const now = Date.now();
  const day = dayStr ?? formatDay(now);
  const thirtyDaysAgo = now - THIRTY_DAYS_MS;

  const programsRow = await env.DB.prepare(
    `SELECT COUNT(*) as total, SUM(CASE WHEN industry_codes IS NOT NULL THEN json_array_length(industry_codes) ELSE 0 END) as total_codes FROM programs`
  ).first<{ total: number; total_codes: number }>();
  const freshSourcesRow = await env.DB.prepare(
    `SELECT COUNT(DISTINCT source_id) as fresh FROM programs WHERE source_id IS NOT NULL AND updated_at >= ?`
  )
    .bind(thirtyDaysAgo)
    .first<{ fresh: number }>();

  let deadlinkRate: number | null = null;
  if (env.LOOKUPS_KV) {

    try {
      const key = `metrics:deadlinks:${day}`;
      const stored = await env.LOOKUPS_KV.get(key, 'json');
      if (isDeadlinkMetrics(stored)) {
        deadlinkRate = stored.rate;
      }
    } catch (err) {
      console.warn('daily_coverage_deadlinks_lookup_failed', err);
    }
  }

  const totalPrograms = Number(programsRow?.total ?? 0);
  const totalCodes = Number(programsRow?.total_codes ?? 0);
  const naicsDensity = totalPrograms > 0 ? totalCodes / totalPrograms : 0;
  const freshSources = Number(freshSourcesRow?.fresh ?? 0);

  await env.DB.prepare(
    `INSERT INTO daily_coverage_stats (day, country_code, jurisdiction_code, n_programs, fresh_sources, naics_density, deadlink_rate, created_at)
     VALUES (?, NULL, NULL, ?, ?, ?, ?, ?)
     ON CONFLICT(day) DO UPDATE SET
       n_programs = excluded.n_programs,
       fresh_sources = excluded.fresh_sources,
       naics_density = excluded.naics_density,
       deadlink_rate = excluded.deadlink_rate,
       created_at = excluded.created_at`
  )
    .bind(day, totalPrograms, freshSources, naicsDensity, deadlinkRate, now)
    .run();
}
