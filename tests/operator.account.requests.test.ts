import { describe, it, expect } from 'vitest';
import app from '../apps/api/src/index';
import { createTestDB } from './helpers/d1';
import { createAccountRequest, ensureUserWithDefaultCanvas, createSignupToken } from '../apps/api/src/onboarding/storage';

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

describe('operator account requests', () => {
  it('allows an admin user to list pending requests', async () => {
    const db = createTestDB();
    await db.exec(schema);
    const env = { DB: db, SESSION_COOKIE_NAME: 'fungi_session' } as any;

    const requestedApps = { website: false, program: true, canvas: true };
    await createAccountRequest(env, {
      email: 'founder@example.com',
      displayName: 'Founder Org',
      requestedApps,
      justification: 'Launching new initiative'
    });

    const adminProfile = {
      id: 'user_admin',
      email: 'ops@example.com',
      display_name: 'Ops Admin',
      status: 'pending' as const,
      apps: requestedApps,
      roles: ['admin'],
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
    expect(activateResponse.status).toBe(200);
    const cookies = extractCookies(activateResponse);
    const sessionCookie = cookies['fungi_session'];
    expect(sessionCookie).toBeTruthy();

    const listResponse = await app.fetch(
      new Request('http://localhost/v1/operator/account-requests?status=pending', {
        headers: { cookie: `fungi_session=${sessionCookie}` }
      }),
      env
    );
    expect(listResponse.status).toBe(200);
    const payload = await listResponse.json();
    expect(Array.isArray(payload.data)).toBe(true);
    expect(payload.data[0]).toMatchObject({ email: 'founder@example.com', status: 'pending' });
    expect(payload.data[0].decision_token).toMatch(/decision_/);
  });

  it('rejects non-admin users from listing requests', async () => {
    const db = createTestDB();
    await db.exec(schema);
    const env = { DB: db } as any;

    await ensureUserWithDefaultCanvas(env, {
      id: 'user_basic',
      email: 'basic@example.com',
      display_name: 'Basic User',
      status: 'pending',
      apps: { website: false, program: true, canvas: true },
      roles: ['user'],
      mfa_enrolled: false
    });
    const signup = await createSignupToken(env, 'user_basic', 24);
    await app.fetch(
      new Request('http://localhost/v1/account/activate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: signup.token, password: 'Anoth3rStrong!PW' })
      }),
      env
    );

    const loginResponse = await app.fetch(
      new Request('http://localhost/v1/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'basic@example.com', password: 'Anoth3rStrong!PW' })
      }),
      env
    );
    expect(loginResponse.status).toBe(200);
    const cookies = extractCookies(loginResponse);
    const sessionCookie = cookies['fungi_session'];

    const forbidden = await app.fetch(
      new Request('http://localhost/v1/operator/account-requests', {
        headers: { cookie: `fungi_session=${sessionCookie}` }
      }),
      env
    );
    expect(forbidden.status).toBe(403);
  });
});
