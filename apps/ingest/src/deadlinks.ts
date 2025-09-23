import { formatDay } from '@common/date';
import type { D1Database } from '@cloudflare/workers-types';
import { formatDay } from '@common/dates';

type IngestEnv = {
  DB: D1Database;
  LOOKUPS_KV?: KVNamespace;
};

export type DeadlinkMetricsRecord = {
  rate: number;
  n: number;
  bad: Array<{ id: number; url: string }>;
};

async function probeUrl(fetchImpl: typeof fetch, url: string): Promise<boolean> {
  try {
    const head = await fetchImpl(url, { method: 'HEAD' });
    if (head.status >= 200 && head.status < 400) {
      return true;
    }
  } catch (err) {
    console.warn('deadlink_head_error', url, err);
  }
  try {
    const get = await fetchImpl(url, { method: 'GET' });
    return get.status >= 200 && get.status < 400;
  } catch (err) {
    console.warn('deadlink_get_error', url, err);
    return false;
  }
}

export async function checkDeadlinks(env: IngestEnv, opts?: { fetchImpl?: typeof fetch }): Promise<void> {
  const fetchImpl = opts?.fetchImpl ?? fetch;
  const rows = await env.DB.prepare(
    `SELECT id, url FROM programs WHERE url IS NOT NULL AND url != '' AND (status IS NULL OR status != 'closed')`
  ).all<{ id: number; url: string }>();
  const programs = rows.results ?? [];
  const bad: Array<{ id: number; url: string }> = [];
  for (const row of programs) {
    const ok = await probeUrl(fetchImpl, row.url);
    if (!ok) {
      bad.push({ id: row.id, url: row.url });
    }
  }
  const total = programs.length;
  const rate = total > 0 ? bad.length / total : 0;
  if (!env.LOOKUPS_KV) return;
  const now = Date.now();
  const key = `metrics:deadlinks:${formatDay(now)}`;
  const metrics: DeadlinkMetricsRecord = { rate, n: total, bad };
  await env.LOOKUPS_KV.put(
    key,
    JSON.stringify(metrics),
    { expirationTtl: 7 * 24 * 60 * 60 }
  );
}

