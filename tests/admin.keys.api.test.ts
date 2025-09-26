import { describe, it, expect } from 'vitest';
import app from '../apps/api/src/index';
import { createTestDB } from './helpers/d1';
import { upsertDevApiKey } from '../apps/api/src/mw.auth';

const ADMIN_KEY = 'admin-keys-test';

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
CREATE TABLE admin_audits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_key_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  target TEXT,
  meta TEXT,
  ts INTEGER NOT NULL
);
`;

describe('admin api key management', () => {
  it('creates, updates, lists, deletes keys and records audits', async () => {
    const db = createTestDB();
    await db.exec(schema);
    await upsertDevApiKey(db as any, { rawKey: ADMIN_KEY, role: 'admin', name: 'root-admin' });

    const env = { DB: db } as any;

    const createRes = await app.fetch(
      new Request('http://localhost/v1/admin/api-keys', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': ADMIN_KEY
        },
        body: JSON.stringify({ name: 'Partner Key', role: 'partner', quota_daily: 100 })
      }),
      env
    );
    expect(createRes.status).toBe(200);
    const created = await createRes.json();
    expect(typeof created.id).toBe('number');
    expect(String(created.raw_key)).toHaveLength(40);

    const listRes = await app.fetch(
      new Request('http://localhost/v1/admin/api-keys', {
        headers: { 'x-api-key': ADMIN_KEY }
      }),
      env
    );
    expect(listRes.status).toBe(200);
    const listBody = await listRes.json();
    expect(Array.isArray(listBody.data)).toBe(true);
    const savedKey = listBody.data.find((row: any) => row.id === created.id);
    expect(savedKey).toBeDefined();
    expect(savedKey.role).toBe('partner');
    expect(savedKey).not.toHaveProperty('key_hash');

    const patchRes = await app.fetch(
      new Request(`http://localhost/v1/admin/api-keys/${created.id}`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'x-api-key': ADMIN_KEY
        },
        body: JSON.stringify({ quota_daily: 200, quota_monthly: 500, role: 'read' })
      }),
      env
    );
    expect(patchRes.status).toBe(200);
    const patched = await patchRes.json();
    expect(patched.quota_daily).toBe(200);
    expect(patched.quota_monthly).toBe(500);
    expect(patched.role).toBe('read');

    const deleteRes = await app.fetch(
      new Request(`http://localhost/v1/admin/api-keys/${created.id}`, {
        method: 'DELETE',
        headers: { 'x-api-key': ADMIN_KEY }
      }),
      env
    );
    expect(deleteRes.status).toBe(200);
    const deleted = await deleteRes.json();
    expect(deleted.deleted).toBe(true);

    const afterList = await app.fetch(
      new Request('http://localhost/v1/admin/api-keys', {
        headers: { 'x-api-key': ADMIN_KEY }
      }),
      env
    );
    const afterBody = await afterList.json();
    const stillExists = afterBody.data.find((row: any) => row.id === created.id);
    expect(stillExists).toBeUndefined();

    const adminRow = await db
      .prepare('SELECT id FROM api_keys WHERE name = ? AND role = ? LIMIT 1')
      .bind('root-admin', 'admin')
      .first<{ id: number }>();
    expect(adminRow).toBeDefined();
    const adminId = Number(adminRow?.id);

    const audits = await db
      .prepare('SELECT action, target, meta, actor_key_id FROM admin_audits ORDER BY id ASC')
      .all<{ action: string; target: string; meta: string | null; actor_key_id: number }>();

    expect(audits.results.length).toBe(3);
    expect(audits.results.map((row) => row.action)).toEqual([
      'api_keys.create',
      'api_keys.update',
      'api_keys.delete'
    ]);
    audits.results.forEach((row) => expect(row.actor_key_id).toBe(adminId));

    const createMeta = JSON.parse(audits.results[0].meta ?? '{}');
    expect(createMeta).toMatchObject({ name: 'Partner Key', role: 'partner', quota_daily: 100 });

    const updateMeta = JSON.parse(audits.results[1].meta ?? '{}');
    expect(updateMeta).toMatchObject({ quota_daily: 200, quota_monthly: 500, role: 'read' });

    expect(audits.results[2].meta).toBeNull();
  });
});
