import { describe, it, expect } from 'vitest';
import app from '../apps/api/src/index';
import { createTestDB } from './helpers/d1';
import { ensureUserWithDefaultCanvas, createSignupToken } from '../apps/api/src/onboarding/storage';

const schema = `
PRAGMA foreign_keys=ON;
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL,
  apps TEXT NOT NULL,
  roles TEXT NOT NULL,
  password_hash TEXT,
  mfa_enrolled INTEGER NOT NULL DEFAULT 0,
  last_login_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE mfa_methods (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  secret TEXT,
  verified_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE account_requests (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  requested_apps TEXT NOT NULL,
  justification TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  schema_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  decided_at TEXT,
  reviewer_id TEXT,
  reviewer_comment TEXT
);
CREATE TABLE email_tokens (
  id TEXT PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  purpose TEXT NOT NULL,
  user_id TEXT,
  account_request_id TEXT,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (account_request_id) REFERENCES account_requests(id) ON DELETE CASCADE
);
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  issued_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  refresh_expires_at TEXT,
  mfa_required INTEGER NOT NULL DEFAULT 0,
  ip TEXT,
  user_agent TEXT,
  refresh_token_hash TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE canvases (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  schema_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE canvas_versions (
  id TEXT PRIMARY KEY,
  canvas_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  content TEXT NOT NULL,
  diff TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  FOREIGN KEY (canvas_id) REFERENCES canvases(id) ON DELETE CASCADE
);
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

function extractSessionCookie(response: Response, name: string) {
  const header = response.headers.get('set-cookie');
  if (!header) return null;
  const parts = header.split(/,(?=[^ ]|$)/);
  for (const part of parts) {
    const [cookie] = part.split(';');
    if (cookie.startsWith(name + '=')) {
      return cookie;
    }
  }
  return null;
}

describe('admin api key management', () => {
  it('creates, updates, lists, deletes keys and records audits', async () => {
    const db = createTestDB();
    await db.exec(schema);

    const env = { DB: db, SESSION_COOKIE_NAME: 'fungi_session' } as any;

    await ensureUserWithDefaultCanvas(env, {
      email: 'ops@example.com',
      display_name: 'Ops Admin',
      status: 'pending',
      apps: { canvas: true, program: true, website: false },
      roles: ['admin'],
      mfa_enrolled: false
    });

    const userRow = await db
      .prepare('SELECT id FROM users WHERE email = ? LIMIT 1')
      .bind('ops@example.com')
      .first<{ id: string }>();
    const signup = await createSignupToken(env, userRow?.id ?? 'user_admin', 24);

    const activateResponse = await app.fetch(
      new Request('http://localhost/v1/account/activate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: signup.token, password: 'Sup3rSecure!PW' })
      }),
      env
    );
    expect(activateResponse.status).toBe(200);
    const sessionCookie = extractSessionCookie(activateResponse, 'fungi_session');
    expect(sessionCookie).toBeTruthy();

    const createRes = await app.fetch(
      new Request('http://localhost/v1/admin/api-keys', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: sessionCookie as string
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
        headers: { cookie: sessionCookie as string }
      }),
      env
    );
    expect(listRes.status).toBe(200);
    const listBody = await listRes.json();
    const savedKey = listBody.data.find((row: any) => row.id === created.id);
    expect(savedKey).toBeDefined();
    expect(savedKey.role).toBe('partner');

    const patchRes = await app.fetch(
      new Request(`http://localhost/v1/admin/api-keys/${created.id}`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          cookie: sessionCookie as string
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
        headers: { cookie: sessionCookie as string }
      }),
      env
    );
    expect(deleteRes.status).toBe(200);
    const deleted = await deleteRes.json();
    expect(deleted.deleted).toBe(true);

    const audits = await db
      .prepare('SELECT action, meta, actor_key_id FROM admin_audits ORDER BY id ASC')
      .all<{ action: string; meta: string | null; actor_key_id: number }>();

    expect(audits.results.length).toBe(3);
    expect(audits.results.map((row) => row.action)).toEqual([
      'api_keys.create',
      'api_keys.update',
      'api_keys.delete'
    ]);
    audits.results.forEach((row) => expect(row.actor_key_id).toBe(-1));

    const createMeta = JSON.parse(audits.results[0].meta ?? '{}');
    expect(createMeta).toMatchObject({
      name: 'Partner Key',
      role: 'partner',
      quota_daily: 100,
      actor_user_id: expect.stringContaining('user')
    });

    const updateMeta = JSON.parse(audits.results[1].meta ?? '{}');
    expect(updateMeta).toMatchObject({
      quota_daily: 200,
      quota_monthly: 500,
      role: 'read',
      actor_user_id: expect.any(String)
    });

    const deleteMeta = JSON.parse(audits.results[2].meta ?? '{}');
    expect(deleteMeta.actor_user_id).toBeDefined();
  });
});
