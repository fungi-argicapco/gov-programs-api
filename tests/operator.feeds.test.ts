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
CREATE TABLE dataset_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dataset_id TEXT NOT NULL,
  version TEXT NOT NULL,
  captured_at INTEGER NOT NULL,
  payload TEXT,
  metadata TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE dataset_services (
  dataset_id TEXT NOT NULL,
  service_name TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  readiness TEXT,
  status_page TEXT,
  rate_limit TEXT,
  cadence TEXT,
  automation_metadata TEXT,
  metadata TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(dataset_id, service_name)
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

describe('/v1/operator/feeds', () => {
  it('returns dataset summaries with history and services', async () => {
    const db = createTestDB();
    await db.exec(baseSchema);
    await db.exec(
      `INSERT INTO dataset_snapshots (dataset_id, version, captured_at, payload, metadata, created_at)
       VALUES ('techland_us_top_states', '2024.09', 1700000000000, '{}', NULL, 1700000000000);
       INSERT INTO dataset_services (dataset_id, service_name, endpoint, readiness, status_page, rate_limit, cadence, automation_metadata, metadata, created_at, updated_at)
       VALUES ('techland_us_top_states', 'TechLand dataset', 'https://example.com/techland', 'production', NULL, '500/min', 'weekly', '{}', '{}', 1700000000000, 1700000000000);
      `
    );

    const env = { DB: db, SESSION_COOKIE_NAME: 'fungi_session' } as any;
    const cookie = await bootstrapAdmin(env);

    const response = await app.fetch(
      new Request('http://localhost/v1/operator/feeds?history=3', {
        headers: { cookie }
      }),
      env
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    const entry = (body.data as Array<any>).find((item) => item.id === 'techland_us_top_states');
    expect(entry).toBeTruthy();
    expect(entry.totalSnapshots).toBe(1);
    expect(entry.history[0].version).toBe('2024.09');
    expect(entry.services[0].endpoint).toBe('https://example.com/techland');
  });

  it('returns 404 when triggering an unknown dataset', async () => {
    const db = createTestDB();
    await db.exec(baseSchema);
    const env = { DB: db, SESSION_COOKIE_NAME: 'fungi_session' } as any;
    const cookie = await bootstrapAdmin(env);

    const response = await app.fetch(
      new Request('http://localhost/v1/operator/feeds/unknown_dataset/trigger', {
        method: 'POST',
        headers: { cookie }
      }),
      env
    );

    expect(response.status).toBe(404);
  });
});
