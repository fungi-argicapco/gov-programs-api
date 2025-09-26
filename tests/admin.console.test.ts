import { describe, it, expect } from 'vitest';
import app from '../apps/api/src/index';
import { createTestDB } from './helpers/d1';
import { upsertDevApiKey } from '../apps/api/src/mw.auth';

const ADMIN_KEY = 'admin-console-test';

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
`;

describe('admin console UI', () => {
  it('returns HTML with metric and key management affordances', async () => {
    const db = createTestDB();
    await db.exec(schema);
    await upsertDevApiKey(db as any, { rawKey: ADMIN_KEY, role: 'admin', name: 'console-admin' });

    const env = { DB: db } as any;
    const response = await app.fetch(
      new Request('http://localhost/admin', {
        headers: { 'x-api-key': ADMIN_KEY }
      }),
      env
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    const html = await response.text();
    expect(html).toContain('id="metrics-grid"');
    expect(html).toContain('id="slo-table"');
    expect(html).toContain('id="create-key-form"');
    expect(html).toContain("authedFetch('/v1/ops/metrics?bucket=1h')");
    expect(html).toContain("authedFetch('/v1/ops/slo')");
    expect(html).toContain("authedFetch('/v1/admin/api-keys'");
  });
});
