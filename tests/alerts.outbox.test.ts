import { describe, it, expect, beforeEach, vi } from 'vitest';
import { runOutbox } from '../apps/ingest/src/alerts.outbox';
import { createTestDB } from './helpers/d1';
import fs from 'node:fs';
import path from 'node:path';

const migrations = ['0001_init.sql', '0003_ingest_obs.sql', '0004_profiles_alerts.sql'];

const readMigration = (name: string) =>
  fs.readFileSync(path.join(process.cwd(), 'migrations', name), 'utf-8');

describe('alerts outbox', () => {
  let db: any;
  let env: any;

  beforeEach(() => {
    db = createTestDB();
    for (const file of migrations) {
      db.__db__.exec(readMigration(file));
    }
    env = {
      DB: db,
      LOOKUPS_KV: {
        get: vi.fn().mockResolvedValue('test-secret')
      }
    };
  });

  it('delivers queued alerts and marks them as ok with signature header', async () => {
    await db.prepare(
      `INSERT INTO saved_queries (id, api_key_id, name, query_json, created_at, updated_at) VALUES (1, 1, 'Test', '{}', 0, 0)`
    ).run();
    await db.prepare(
      `INSERT INTO alert_subscriptions (id, saved_query_id, sink, target, active, created_at, updated_at)
       VALUES (1, 1, 'webhook', 'https://example.com/hook', 1, 0, 0)`
    ).run();
    const payload = JSON.stringify({ hello: true });
    await db.prepare(
      `INSERT INTO alert_outbox (id, subscription_id, payload_json, queued_at, attempts, status)
       VALUES (1, 1, ?, 1000, 0, 'queued')`
    )
      .bind(payload)
      .run();

    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = vi.fn(async (url: RequestInfo, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response('ok', { status: 200 });
    });

    await runOutbox(env, { fetchImpl, now: 5000 });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const { init } = calls[0];
    const headers = new Headers(init.headers);
    expect(headers.get('x-signature')).toBeTruthy();
    expect(init.body).toBe(payload);

    const row = await db
      .prepare('SELECT status, delivered_at, attempts FROM alert_outbox WHERE id = 1')
      .first<{ status: string; delivered_at: number; attempts: number }>();
    expect(row?.status).toBe('ok');
    expect(row?.delivered_at).toBe(5000);
    expect(row?.attempts).toBe(1);
  });

  it('stops retrying once the configured maximum is reached', async () => {
    env.ALERTS_MAX_DELIVERY_ATTEMPTS = '2';

    await db.prepare(
      `INSERT INTO saved_queries (id, api_key_id, name, query_json, created_at, updated_at) VALUES (1, 1, 'Test', '{}', 0, 0)`
    ).run();
    await db.prepare(
      `INSERT INTO alert_subscriptions (id, saved_query_id, sink, target, active, created_at, updated_at)
       VALUES (1, 1, 'webhook', 'https://example.com/hook', 1, 0, 0)`
    ).run();
    await db.prepare(
      `INSERT INTO alert_outbox (id, subscription_id, payload_json, queued_at, attempts, status)
       VALUES (1, 1, '{}', 1000, 1, 'queued')`
    ).run();

    const fetchImpl = vi.fn(async () => new Response('nope', { status: 500 }));

    await runOutbox(env, { fetchImpl, now: 5000 });

    const row = await db
      .prepare('SELECT status, delivered_at, attempts FROM alert_outbox WHERE id = 1')
      .first<{ status: string; delivered_at: number; attempts: number }>();
    expect(row?.status).toBe('error');
    expect(row?.delivered_at).toBeNull();
    expect(row?.attempts).toBe(2);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
