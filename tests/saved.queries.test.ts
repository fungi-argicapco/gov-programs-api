import { describe, it, expect } from 'vitest';
import type { D1Database } from '@cloudflare/workers-types';
import app from '../apps/api/src/index';
import { createTestDB } from './helpers/d1';
import { upsertDevApiKey } from '../apps/api/src/mw.auth';

const API_KEY = 'saved-test-key';

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
CREATE TABLE IF NOT EXISTS saved_queries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  api_key_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  query_json TEXT NOT NULL,
  created_at INTEGER,
  updated_at INTEGER
);
CREATE TABLE IF NOT EXISTS alert_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  saved_query_id INTEGER NOT NULL,
  sink TEXT NOT NULL,
  target TEXT NOT NULL,
  active INTEGER DEFAULT 1,
  created_at INTEGER,
  updated_at INTEGER
);
`;

describe('saved queries API', () => {
  it('creates, retrieves, and deletes a saved query', async () => {
    const db = createTestDB();
    await db.exec(schema);
    await upsertDevApiKey(db as unknown as D1Database, {
      rawKey: API_KEY,
      role: 'partner',
      quotaDaily: 10,
      quotaMonthly: 10
    });

    const env = { DB: db } as any;
    const createRes = await app.fetch(
      new Request('http://localhost/v1/saved-queries', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': API_KEY
        },
        body: JSON.stringify({ name: 'My Query', query_json: '{"country":"US"}' })
      }),
      env
    );
    expect(createRes.status).toBe(200);
    const { id } = await createRes.json();
    expect(typeof id).toBe('number');

    const getRes = await app.fetch(
      new Request(`http://localhost/v1/saved-queries/${id}`, {
        headers: { 'x-api-key': API_KEY }
      }),
      env
    );
    expect(getRes.status).toBe(200);
    const saved = await getRes.json();
    expect(saved.name).toBe('My Query');
    expect(saved.query_json).toBe('{"country":"US"}');

    const deleteRes = await app.fetch(
      new Request(`http://localhost/v1/saved-queries/${id}`, {
        method: 'DELETE',
        headers: { 'x-api-key': API_KEY }
      }),
      env
    );
    expect(deleteRes.status).toBe(200);
    const delBody = await deleteRes.json();
    expect(delBody.ok).toBe(true);

    const missingRes = await app.fetch(
      new Request(`http://localhost/v1/saved-queries/${id}`, {
        headers: { 'x-api-key': API_KEY }
      }),
      env
    );
    expect(missingRes.status).toBe(404);
  });
});
