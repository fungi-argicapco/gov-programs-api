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
CREATE TABLE request_metrics_5m (
  bucket_ts INTEGER NOT NULL,
  route TEXT NOT NULL,
  status_class TEXT NOT NULL,
  count INTEGER NOT NULL,
  p50_ms INTEGER NOT NULL,
  p95_ms INTEGER NOT NULL,
  p99_ms INTEGER NOT NULL,
  bytes_out INTEGER NOT NULL,
  PRIMARY KEY(bucket_ts, route, status_class)
);
`;

describe('ops metrics API', () => {
  it('aggregates hourly metrics with session-authenticated admin', async () => {
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

    const base = Date.UTC(2024, 0, 1, 0, 0, 0);
    const fiveMinutes = 5 * 60 * 1000;
    const routes = ['/v1/programs', '/v1/match'];
    const statuses: Array<'2xx' | '5xx'> = ['2xx', '5xx'];

    for (let hour = 0; hour < 2; hour += 1) {
      for (let bucket = 0; bucket < 12; bucket += 1) {
        const bucketTs = base + hour * 60 * 60 * 1000 + bucket * fiveMinutes;
        for (const route of routes) {
          for (const status of statuses) {
            const count = status === '2xx' ? 10 : 2;
            const multiplier = route === routes[0] ? 1 : 1.5;
            const baseLatency = status === '2xx' ? 120 : 240;
            const latency = baseLatency * multiplier;
            const bytes = status === '2xx' ? 1024 : 256;
            await db
              .prepare(
                `INSERT INTO request_metrics_5m (bucket_ts, route, status_class, count, p50_ms, p95_ms, p99_ms, bytes_out)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
              )
              .bind(bucketTs, route, status, count, latency, latency + 20, latency + 40, bytes)
              .run();
          }
        }
      }
    }

    const fromIso = new Date(base).toISOString();
    const toIso = new Date(base + 2 * 60 * 60 * 1000).toISOString();
    const response = await app.fetch(
      new Request(
        `http://localhost/v1/ops/metrics?bucket=1h&from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`,
        {
          headers: {
            cookie: sessionCookie as string
          }
        }
      ),
      env
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.meta.bucket).toBe('1h');
    expect(payload.data.length).toBe(8);

    const firstHourProgram2xx = payload.data.find(
      (row: any) => row.route === '/v1/programs' && row.status_class === '2xx' && row.bucket_ts === base
    );
    expect(firstHourProgram2xx).toBeDefined();
    expect(firstHourProgram2xx.count).toBe(120);
    expect(firstHourProgram2xx.bytes_out).toBe(12 * 1024);
    expect(firstHourProgram2xx.p99_ms).toBeCloseTo(160);

    const secondHourMatch5xx = payload.data.find(
      (row: any) => row.route === '/v1/match' && row.status_class === '5xx' && row.bucket_ts === base + 60 * 60 * 1000
    );
    expect(secondHourMatch5xx).toBeDefined();
    expect(secondHourMatch5xx.count).toBe(24);
    expect(secondHourMatch5xx.bytes_out).toBe(12 * 256);
    expect(secondHourMatch5xx.p50_ms).toBeCloseTo(360);
  });
});
