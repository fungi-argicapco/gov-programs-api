import { describe, it, expect } from 'vitest';
import app from '../apps/api/src/index';
import { createTestDB } from './helpers/d1';
import { ensureUserWithDefaultCanvas, createSignupToken, createAccountRequest } from '../apps/api/src/onboarding/storage';

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

describe('admin console UI', () => {
  it('returns HTML with metric and key management affordances', async () => {
    const db = createTestDB();
    await db.exec(schema);
    const env = { DB: db, SESSION_COOKIE_NAME: 'fungi_session' } as any;

    await ensureUserWithDefaultCanvas(env, {
      id: 'user_admin',
      email: 'ops@example.com',
      display_name: 'Ops Admin',
      status: 'pending',
      apps: { website: false, program: true, canvas: true },
      roles: ['admin'],
      mfa_enrolled: false
    });
    const signup = await createSignupToken(env, 'user_admin', 24);
    const activate = await app.fetch(
      new Request('http://localhost/v1/account/activate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: signup.token, password: 'Str0ng!ConsolePW' })
      }),
      env
    );
    const setCookie = activate.headers.get('set-cookie') ?? '';
    const sessionCookie = setCookie.split(/,(?=[^ ]|$)/)
      .map((cookie) => cookie.split(';')[0])
      .find((cookie) => cookie.startsWith('fungi_session='));
    expect(sessionCookie).toBeTruthy();

    await createAccountRequest(env, {
      email: 'founder@example.com',
      displayName: 'Founder Org',
      requestedApps: { website: false, program: true, canvas: true },
      justification: 'Testing admin console'
    });

    const response = await app.fetch(
      new Request('http://localhost/admin', {
        headers: { cookie: sessionCookie as string }
      }),
      env
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    const html = await response.text();
    expect(html).toContain('Operations console');
    expect(html).toContain('id="pending-container"');
    expect(html).toContain('id="history-container"');
    expect(html).toContain('id="metrics-container"');
    expect(html).toContain('id="datasets-container"');
    expect(html).toContain('id="keys-list"');
    expect(html).toContain('/v1/operator/account-requests?status=pending');
  });
});
