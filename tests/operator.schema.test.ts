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

describe('/v1/operator/schema', () => {
  it('returns table metadata with column definitions and row counts', async () => {
    const db = createTestDB();
    await db.exec(
      baseSchema +
        `CREATE TABLE programs (id INTEGER PRIMARY KEY, name TEXT NOT NULL, updated_at INTEGER);
         CREATE TABLE macro_metrics (id INTEGER PRIMARY KEY, metric_name TEXT, metric_group TEXT, admin_unit_code TEXT, created_at INTEGER, updated_at INTEGER);
         INSERT INTO programs (name, updated_at) VALUES ('Clean Energy Fund', 1700000000000);
         INSERT INTO macro_metrics (metric_name, metric_group, admin_unit_code, created_at, updated_at) VALUES ('GDP', 'Economy', 'US', 1700000000000, 1700000000000);
        `
    );

    const env = { DB: db, SESSION_COOKIE_NAME: 'fungi_session' } as any;
    const cookie = await bootstrapAdmin(env);

    const response = await app.fetch(
      new Request('http://localhost/v1/operator/schema', {
        headers: { cookie }
      }),
      env
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    const tableNames = (body.data as Array<{ name: string }>).map((table) => table.name);
    expect(tableNames).toContain('programs');
    const programsTable = (body.data as Array<any>).find((table) => table.name === 'programs');
    expect(programsTable.row_count).toBe(1);
    expect(programsTable.columns.some((col: any) => col.name === 'name' && col.type === 'TEXT')).toBe(true);
  });
});
