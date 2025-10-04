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
CREATE TABLE programs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT,
  country_code TEXT,
  authority_level TEXT,
  jurisdiction_code TEXT,
  title TEXT,
  status TEXT,
  end_date TEXT,
  created_at INTEGER,
  updated_at INTEGER
);
CREATE TABLE macro_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  country_code TEXT,
  admin_unit_code TEXT,
  metric_group TEXT,
  metric_name TEXT,
  metric_value REAL,
  created_at INTEGER,
  updated_at INTEGER
);
CREATE TABLE climate_country_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dataset_id TEXT,
  indicator TEXT,
  country_iso3 TEXT,
  year INTEGER,
  value REAL,
  unit TEXT,
  metadata TEXT,
  version TEXT,
  source TEXT,
  created_at INTEGER,
  updated_at INTEGER
);
CREATE TABLE capital_stack_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scenario_id TEXT,
  instrument_type TEXT,
  provider TEXT,
  amount REAL,
  currency_code TEXT,
  created_at INTEGER,
  updated_at INTEGER
);
CREATE TABLE workforce_ecosystem (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  country_code TEXT,
  admin_unit_code TEXT,
  program_name TEXT,
  created_at INTEGER,
  updated_at INTEGER
);
CREATE TABLE industry_clusters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  country_code TEXT,
  admin_unit_code TEXT,
  cluster_name TEXT,
  created_at INTEGER,
  updated_at INTEGER
);
CREATE TABLE country_playbooks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  country TEXT,
  version TEXT,
  last_updated TEXT,
  regulatory_compliance TEXT,
  created_at INTEGER,
  updated_at INTEGER
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

describe('/v1/operator/reports', () => {
  it('returns aggregated strategic metrics across datasets', async () => {
    const db = createTestDB();
    await db.exec(baseSchema);
    await db.exec(
      `INSERT INTO programs (uid, country_code, authority_level, jurisdiction_code, title, status, end_date, created_at, updated_at)
         VALUES ('program-1', 'US', 'federal', 'US', 'Clean Grid', 'open', '2099-01-01', 1700000000000, 1700000000000);
       INSERT INTO programs (uid, country_code, authority_level, jurisdiction_code, title, status, end_date, created_at, updated_at)
         VALUES ('program-2', 'US', 'state', 'US-CA', 'Green Schools', 'scheduled', '2099-06-01', 1700000000000, 1700000000000);
       INSERT INTO macro_metrics (country_code, admin_unit_code, metric_group, metric_name, metric_value, created_at, updated_at)
         VALUES ('US', 'US', 'Economy', 'GDP', 23000000, 1700000000000, 1700000000000);
       INSERT INTO macro_metrics (country_code, admin_unit_code, metric_group, metric_name, metric_value, created_at, updated_at)
         VALUES ('US', 'US', 'Innovation', 'R&D Spend', 500000, 1700000000000, 1700000000000);
       INSERT INTO climate_country_metrics (dataset_id, indicator, country_iso3, year, value, unit, metadata, version, source, created_at, updated_at)
         VALUES ('climate_nd_gain', 'readiness_index', 'USA', 2023, 0.72, 'index', '{}', '2024', 'ND-GAIN', 1700000000000, 1700000000000);
       INSERT INTO capital_stack_entries (scenario_id, instrument_type, provider, amount, currency_code, created_at, updated_at)
         VALUES ('cog-capital-stack', 'senior debt', 'BankCo', 12000000, 'USD', 1700000000000, 1700000000000);
       INSERT INTO workforce_ecosystem (country_code, admin_unit_code, program_name, created_at, updated_at)
         VALUES ('US', 'US-CA', 'Workforce Upskilling', 1700000000000, 1700000000000);
       INSERT INTO industry_clusters (country_code, admin_unit_code, cluster_name, created_at, updated_at)
         VALUES ('US', 'US-CA', 'Battery Manufacturing', 1700000000000, 1700000000000);
       INSERT INTO country_playbooks (country, version, last_updated, regulatory_compliance, created_at, updated_at)
         VALUES ('USA', 'v1', '2024-09-01', '{"notes":"Updated permits"}', 1700000000000, 1700000000000);
      `
    );

    const env = { DB: db, SESSION_COOKIE_NAME: 'fungi_session' } as any;
    const cookie = await bootstrapAdmin(env);

    const response = await app.fetch(
      new Request('http://localhost/v1/operator/reports', {
        headers: { cookie }
      }),
      env
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.programs.total).toBeGreaterThanOrEqual(2);
    expect(body.data.macro.total_metrics).toBeGreaterThanOrEqual(2);
    expect(body.data.climate.total_indicators).toBeGreaterThanOrEqual(1);
    expect(body.data.capital.total_entries).toBeGreaterThanOrEqual(1);
    expect(body.data.pestle.economic.macro_groups.length).toBeGreaterThan(0);
    expect(body.data.pestle.environmental.total_indicators).toBeGreaterThanOrEqual(1);
  });
});
