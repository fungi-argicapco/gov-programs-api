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
CREATE TABLE climate_country_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dataset_id TEXT NOT NULL,
  indicator TEXT NOT NULL,
  country_iso3 TEXT NOT NULL,
  year INTEGER,
  value REAL,
  unit TEXT,
  metadata TEXT,
  version TEXT NOT NULL,
  source TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE climate_subnational_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dataset_id TEXT NOT NULL,
  indicator TEXT NOT NULL,
  country_iso3 TEXT NOT NULL,
  admin_level TEXT NOT NULL,
  admin_code TEXT NOT NULL,
  iso_code TEXT,
  year INTEGER,
  value REAL,
  unit TEXT,
  metadata TEXT,
  version TEXT NOT NULL,
  source TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
`;

describe('admin climate API', () => {
  it('lists climate metrics per country', async () => {
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
    const signup = await createSignupToken(env, userRow?.id ?? 'user_ops', 24);

    const activate = await app.fetch(
      new Request('http://localhost/v1/account/activate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: signup.token, password: 'Sup3rSecure!PW' })
      }),
      env
    );
    expect(activate.status).toBe(200);
    const sessionCookie = activate.headers
      .get('set-cookie')
      ?.split(/,(?=[^ ]|$)/)
      ?.find((entry) => entry.startsWith('fungi_session='));
    expect(sessionCookie).toBeTruthy();

    const now = Date.now();
    await db
      .prepare(
        `INSERT INTO climate_country_metrics (dataset_id, indicator, country_iso3, year, value, unit, metadata, version, source, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind('climate_esg_metrics', 'nd_gain_index', 'USA', 2024, 0.75, null, null, '2025-10-02', 'nd_gain', now, now)
      .run();
    await db
      .prepare(
        `INSERT INTO climate_country_metrics (dataset_id, indicator, country_iso3, year, value, unit, metadata, version, source, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind('climate_esg_metrics', 'inform_risk_score', 'USA', 2024, 3.1, null, null, '2025-10-02', 'inform_global', now, now)
      .run();
    await db
      .prepare(
        `INSERT INTO climate_subnational_metrics (dataset_id, indicator, country_iso3, admin_level, admin_code, iso_code, year, value, unit, metadata, version, source, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        'climate_esg_metrics',
        'inform_subnational_risk_score',
        'USA',
        'admin1',
        'CA01',
        'US-CA',
        2024,
        3.3,
        null,
        JSON.stringify({ admin_name: 'California' }),
        '2025-10-02',
        'inform_subnational',
        now,
        now
      )
      .run();

    const response = await app.fetch(
      new Request('http://localhost/v1/admin/climate', {
        headers: { cookie: sessionCookie as string }
      }),
      env
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body.data)).toBe(true);
    const usa = body.data.find((row: any) => row.iso3 === 'USA');
    expect(usa).toBeDefined();
    expect(usa.indicators.nd_gain_index.value).toBe(0.75);
    expect(usa.indicators.inform_risk_score.value).toBe(3.1);
    const subEntries = usa.subnational['CA01'] || [];
    expect(subEntries.length).toBe(1);
    expect(subEntries[0].isoCode).toBe('US-CA');
  });
});
