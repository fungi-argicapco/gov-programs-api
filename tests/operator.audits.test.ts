import { describe, it, expect } from 'vitest';
import app from '../apps/api/src/index';
import { createTestDB } from './helpers/d1';
import { ensureUserWithDefaultCanvas, createSignupToken } from '../apps/api/src/onboarding/storage';

const baseSchema = `
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
CREATE TABLE admin_audits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_key_id INTEGER,
  action TEXT NOT NULL,
  target TEXT,
  meta TEXT,
  ts INTEGER NOT NULL
);
`;

function extractCookies(response: Response) {
  const header = response.headers.get('set-cookie');
  if (!header) return {} as Record<string, string>;
  const parts = header.split(/,(?=[^ ]|$)/);
  const map: Record<string, string> = {};
  for (const part of parts) {
    const [cookie] = part.split(';');
    const [name, value] = cookie.split('=');
    if (name && value) {
      map[name.trim()] = value.trim();
    }
  }
  return map;
}

async function bootstrapAdmin(env: any) {
  const adminProfile = {
    id: 'admin_user',
    email: 'ops@example.com',
    display_name: 'Ops Admin',
    status: 'pending' as const,
    apps: { website: false, program: true, canvas: true },
    roles: ['admin'] as const,
    mfa_enrolled: false
  };
  await ensureUserWithDefaultCanvas(env, adminProfile);
  const signup = await createSignupToken(env, adminProfile.id, 24);
  const activateResponse = await app.fetch(
    new Request('http://localhost/v1/account/activate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: signup.token, password: 'Str0ngPass!word' })
    }),
    env
  );
  const cookies = extractCookies(activateResponse);
  expect(cookies.fungi_session).toBeTruthy();
  return 'fungi_session=' + cookies.fungi_session;
}

describe('/v1/operator/audits', () => {
  it('returns recent audit entries ordered by timestamp', async () => {
    const db = createTestDB();
    await db.exec(baseSchema);
    await db.exec(
      `INSERT INTO admin_audits (actor_key_id, action, target, meta, ts)
         VALUES (1, 'api_keys.create', '42', '{"quota_daily":1000}', 1700000000);
       INSERT INTO admin_audits (actor_key_id, action, target, meta, ts)
         VALUES (1, 'api_keys.delete', '43', NULL, 1700000500);
      `
    );

    const env = { DB: db, SESSION_COOKIE_NAME: 'fungi_session' } as any;
    const cookie = await bootstrapAdmin(env);

    const response = await app.fetch(
      new Request('http://localhost/v1/operator/audits', {
        headers: { cookie }
      }),
      env
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.length).toBeGreaterThanOrEqual(2);
    expect(body.data[0].action).toBe('api_keys.delete');
    expect(body.data[0].meta).toBeNull();
    expect(body.data[1].meta.quota_daily).toBe(1000);
  });
});
