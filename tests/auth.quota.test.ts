import { describe, it, expect } from 'vitest';
import type { D1Database } from '@cloudflare/workers-types';
import app from '../apps/api/src/index';
import { createTestDB } from './helpers/d1';
import { upsertDevApiKey } from '../apps/api/src/mw.auth';

const API_KEY = 'quota-test-key';

const schema = `
CREATE TABLE IF NOT EXISTS api_keys (
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
CREATE TABLE IF NOT EXISTS usage_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  api_key_id INTEGER NOT NULL,
  ts INTEGER NOT NULL,
  route TEXT NOT NULL,
  cost INTEGER DEFAULT 1
);
`;

describe('mw.auth quota enforcement', () => {
  it('rejects requests when daily quota exceeded', async () => {
    const db = createTestDB();
    await db.exec(schema);
    await upsertDevApiKey(db as unknown as D1Database, {
      rawKey: API_KEY,
      role: 'partner',
      quotaDaily: 1,
      quotaMonthly: 1
    });

    const env = { DB: db } as any;
    const request = new Request('http://localhost/v1/usage/me', {
      headers: { 'x-api-key': API_KEY }
    });
    const res1 = await app.fetch(request, env);
    expect(res1.status).toBe(200);

    const res2 = await app.fetch(
      new Request('http://localhost/v1/usage/me', { headers: { 'x-api-key': API_KEY } }),
      env
    );
    expect(res2.status).toBe(429);
    const payload = await res2.json();
    expect(payload.error.code).toBe('quota_exceeded');
    expect(payload.error.details).toEqual({ scope: 'daily' });
  });
});
