import { describe, it, expect, beforeAll, vi } from 'vitest';
import type { DurableObjectNamespace } from '@cloudflare/workers-types';
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

  it('merges repeated flushes for the same bucket', async () => {
    const db = createTestDB();
    db.__db__.exec(readMigration('0007_ops_metrics.sql'));

    const env = { DB: db } as any;
    const reporter = getMetricsReporter(env);

    const baseTs = Date.now();
    const total = 250;
    const route = '/v1/bulk';
    const status = 200;

    for (let i = 0; i < total; i += 1) {
      await reporter.reportRequest({
        route,
        status,
        dur_ms: i + 1,
        bytes_out: 100 + i,
        ts: baseTs
      });
    }

    await reporter.flush();

    const row = await db
      .prepare(
        'SELECT count, p50_ms, p95_ms, p99_ms, bytes_out FROM request_metrics_5m WHERE route = ? AND status_class = ?'
      )
      .bind(route, '2xx')
      .first<{
        count: number;
        p50_ms: number;
        p95_ms: number;
        p99_ms: number;
        bytes_out: number;
      }>();

    expect(row).toBeDefined();
    expect(Number(row!.count)).toBe(total);
    expect(Number(row!.p50_ms)).toBe(125);
    expect(Number(row!.p95_ms)).toBe(238);
    expect(Number(row!.p99_ms)).toBe(248);

    // Calculate the sum of bytes_out values: 100+0, 100+1, ..., 100+(total-1).
    // This is an arithmetic sequence: total*100 + sum(0 to total-1) = total*100 + total*(total-1)/2.
    // The formula below is mathematically equivalent: total * (200 + total - 1) / 2.
    const expectedBytes = total * (200 + total - 1) / 2;
    expect(Number(row!.bytes_out)).toBe(expectedBytes);
  });
});

describe('durable object reporter', () => {
  it('fetches a fresh stub for each report and flush call', async () => {
    const fetchCalls: Array<ReturnType<typeof vi.fn>> = [];
    const namespace = {
      idFromName: vi.fn(() => ({
        toString() {
          return 'metrics';
        }
      })),
      get: vi.fn(() => {
        const fetch = vi.fn(async () => new Response('ok', { status: 202 }));
        fetchCalls.push(fetch);
        return { fetch };
      })
    } satisfies DurableObjectNamespace as DurableObjectNamespace;

    const env = {
      DB: createTestDB(),
      CF_DO_METRICS_BINDING: 'METRICS_AGG',
      METRICS_AGG: namespace
    } as any;

    const reporter = getMetricsReporter(env);

    await reporter.reportRequest({
      route: '/docs',
      status: 200,
      dur_ms: 12,
      bytes_out: 1024,
      ts: Date.now()
    });

    await reporter.reportRequest({
      route: '/openapi.json',
      status: 200,
      dur_ms: 18,
      bytes_out: 2048,
      ts: Date.now()
    });

    await reporter.flush();

    expect(namespace.idFromName).toHaveBeenCalledTimes(3);
    expect(namespace.get).toHaveBeenCalledTimes(3);
    expect(fetchCalls).toHaveLength(3);
    for (const fetch of fetchCalls) {
      expect(fetch).toHaveBeenCalledTimes(1);
    }
  });
});
