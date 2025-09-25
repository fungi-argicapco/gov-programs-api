import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createTestDB } from './helpers/d1';
import { getMetricsReporter } from '../apps/api/src/do.metrics';

beforeAll(() => {
  process.env.METRICS_DISABLE = '0';
});

const readMigration = (name: string) =>
  fs.readFileSync(path.join(process.cwd(), 'migrations', name), 'utf-8');

describe('request metrics reporter', () => {
  it('aggregates 5-minute request metrics per route and status class', async () => {
    const db = createTestDB();
    db.__db__.exec(readMigration('0007_ops_metrics.sql'));

    const env = { DB: db } as any;
    const reporter = getMetricsReporter(env);

    const baseTs = Date.now();
    const routes = ['/v1/programs', '/v1/match'];
    const statuses = [200, 502];
    let emitted = 0;

    for (const route of routes) {
      for (const status of statuses) {
        for (let i = 0; i < 25; i += 1) {
          const duration = 80 + i * 3 + (status >= 500 ? 40 : 0) + (route === routes[1] ? 10 : 0);
          const bytes = 512 + i * 11;
          await reporter.reportRequest({
            route,
            status,
            dur_ms: duration,
            bytes_out: bytes,
            ts: baseTs
          });
          emitted += 1;
        }
      }
    }

    await reporter.flush();

    const result = await db
      .prepare('SELECT route, status_class, count, p50_ms, p95_ms, p99_ms, bytes_out FROM request_metrics_5m')
      .all<{
        route: string;
        status_class: string;
        count: number;
        p50_ms: number;
        p95_ms: number;
        p99_ms: number;
        bytes_out: number;
      }>();

    const rows = result.results;
    expect(rows.length).toBe(routes.length * statuses.length);

    let countSum = 0;
    for (const row of rows) {
      countSum += Number(row.count);
      expect(row.p95_ms).toBeGreaterThanOrEqual(row.p50_ms);
      expect(row.p99_ms).toBeGreaterThanOrEqual(row.p95_ms);
      expect(row.bytes_out).toBeGreaterThan(0);
    }

    expect(countSum).toBe(emitted);
  });
});
