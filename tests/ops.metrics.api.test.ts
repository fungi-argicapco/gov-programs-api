import { describe, it, expect } from 'vitest';
import app from '../apps/api/src/index';
import { createTestDB } from './helpers/d1';
import { upsertDevApiKey } from '../apps/api/src/mw.auth';

const ADMIN_KEY = 'ops-metrics-admin';

const schema = `
CREATE TABLE api_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key_hash TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL,
  name TEXT,
  quota_daily INTEGER,
  quota_monthly INTEGER,
  created_at INTEGER,
  updated_at INTEGER,
  last_seen_at INTEGER
);
CREATE TABLE usage_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  api_key_id INTEGER NOT NULL,
  ts INTEGER NOT NULL,
  route TEXT NOT NULL,
  cost INTEGER DEFAULT 1
);
CREATE TABLE request_metrics_5m (
  bucket_ts INTEGER NOT NULL,
  route TEXT NOT NULL,
  status_class TEXT NOT NULL,
  count INTEGER NOT NULL,
  p50_ms INTEGER NOT NULL,
  p95_ms INTEGER NOT NULL,
  p99_ms INTEGER NOT NULL,
  bytes_out INTEGER NOT NULL,
  PRIMARY KEY(bucket_ts, route, status_class)
);
`;

describe('ops metrics API', () => {
  it('aggregates hourly metrics with admin auth', async () => {
    const db = createTestDB();
    await db.exec(schema);
    await upsertDevApiKey(db as any, { rawKey: ADMIN_KEY, role: 'admin', name: 'ops-admin' });

    const env = { DB: db } as any;

    const base = Date.UTC(2024, 0, 1, 0, 0, 0);
    const fiveMinutes = 5 * 60 * 1000;
    const routes = ['/v1/programs', '/v1/match'];
    const statuses: Array<'2xx' | '5xx'> = ['2xx', '5xx'];

    for (let hour = 0; hour < 2; hour += 1) {
      for (let bucket = 0; bucket < 12; bucket += 1) {
        const bucketTs = base + hour * 60 * 60 * 1000 + bucket * fiveMinutes;
        for (const route of routes) {
          for (const status of statuses) {
            const count = status === '2xx' ? 10 : 2;
            const multiplier = route === routes[0] ? 1 : 1.5;
            const baseLatency = status === '2xx' ? 120 : 240;
            const latency = baseLatency * multiplier;
            const bytes = status === '2xx' ? 1024 : 256;
            await db
              .prepare(
                `INSERT INTO request_metrics_5m (bucket_ts, route, status_class, count, p50_ms, p95_ms, p99_ms, bytes_out)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
              )
              .bind(bucketTs, route, status, count, latency, latency + 20, latency + 40, bytes)
              .run();
          }
        }
      }
    }

    const fromIso = new Date(base).toISOString();
    const toIso = new Date(base + 2 * 60 * 60 * 1000).toISOString();
    const response = await app.fetch(
      new Request(`http://localhost/v1/ops/metrics?bucket=1h&from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`, {
        headers: {
          'x-api-key': ADMIN_KEY
        }
      }),
      env
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.meta.bucket).toBe('1h');
    expect(payload.data.length).toBe(8);

    const firstHourProgram2xx = payload.data.find(
      (row: any) => row.route === '/v1/programs' && row.status_class === '2xx' && row.bucket_ts === base
    );
    expect(firstHourProgram2xx).toBeDefined();
    expect(firstHourProgram2xx.count).toBe(120);
    expect(firstHourProgram2xx.bytes_out).toBe(12 * 1024);
    expect(firstHourProgram2xx.p99_ms).toBeCloseTo(160); // 120 + 40 weighted uniformly

    const secondHourMatch5xx = payload.data.find(
      (row: any) => row.route === '/v1/match' && row.status_class === '5xx' && row.bucket_ts === base + 60 * 60 * 1000
    );
    expect(secondHourMatch5xx).toBeDefined();
    expect(secondHourMatch5xx.count).toBe(24);
    expect(secondHourMatch5xx.bytes_out).toBe(12 * 256);
    expect(secondHourMatch5xx.p50_ms).toBeCloseTo(360); // 240 * 1.5
  });
});
