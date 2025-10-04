import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import app from '../apps/api/src/index';
import { createTestDB } from './helpers/d1';

const migrations = ['0001_init.sql', '0002_fts.sql', '0003_ingest_obs.sql', '0010_canvas_onboarding.sql'];

const readMigration = (name: string) =>
  fs.readFileSync(path.join(process.cwd(), 'migrations', name), 'utf-8');

const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

describe('/v1/account/request duplicate handling', () => {
  let env: any;

  beforeEach(() => {
    const db = createTestDB();
    for (const file of migrations) {
      db.__db__.exec(readMigration(file));
    }
    env = {
      DB: db,
      EMAIL_ADMIN: 'operations@fungiagricap.com',
      EMAIL_SENDER: 'register@fungiagricap.com',
      EMAIL_PROVIDER: 'console'
    };
  });

  afterEach(() => {
    infoSpy.mockReset();
    warnSpy.mockReset();
  });

  it('returns existing pending request when duplicate submission arrives', async () => {
    const payload = {
      email: 'duplicate@example.com',
      display_name: 'Duplicate Applicant',
      requested_apps: { canvas: true },
      justification: 'Please approve'
    };

    const responseFirst = await app.fetch(
      new Request('http://localhost/v1/account/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }),
      env
    );
    expect(responseFirst.status).toBe(202);
    const firstBody = await responseFirst.json();
    expect(firstBody.status).toBe('pending');
    expect(firstBody.existing).toBeUndefined();
    expect(firstBody.request?.email).toBe('duplicate@example.com');

    const responseSecond = await app.fetch(
      new Request('http://localhost/v1/account/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }),
      env
    );
    expect(responseSecond.status).toBe(202);
    const secondBody = await responseSecond.json();
    expect(secondBody).toMatchObject({ status: 'pending', existing: true });
    expect(secondBody.request?.id).toBe(firstBody.request?.id);
  });

  it('rejects submissions when an active account already exists', async () => {
    await env.DB.prepare(
      `INSERT INTO users (id, email, display_name, status, apps, roles, mfa_enrolled, created_at, updated_at)
       VALUES (?1, ?2, ?3, 'active', '[]', '[]', 0, datetime('now'), datetime('now'))`
    )
      .bind('user-active', 'active@example.com', 'Existing User')
      .run();

    const response = await app.fetch(
      new Request('http://localhost/v1/account/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'active@example.com',
          display_name: 'Existing User',
          requested_apps: { canvas: true },
          justification: 'Re-request'
        })
      }),
      env
    );
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body?.error?.code).toBe('account_exists');
  });

  it('auto-approves requests from EMAIL_ADMIN and provisions an admin user', async () => {
    const response = await app.fetch(
      new Request('http://localhost/v1/account/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'operations@fungiagricap.com',
          display_name: 'Ops Admin',
          requested_apps: { canvas: true, program: true },
          justification: 'Primary admin'
        })
      }),
      env
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('approved');
    expect(body.auto_approved).toBe(true);
    expect(body.request?.status).toBe('approved');

    const accountRow = await env.DB.prepare(
      `SELECT status FROM account_requests WHERE email = ? LIMIT 1`
    )
      .bind('operations@fungiagricap.com')
      .first<{ status: string }>();
    expect(accountRow?.status).toBe('approved');

    const userRow = await env.DB.prepare(
      `SELECT roles FROM users WHERE email = ? LIMIT 1`
    )
      .bind('operations@fungiagricap.com')
      .first<{ roles: string }>();
    expect(userRow).toBeTruthy();
    expect(JSON.parse(userRow?.roles ?? '[]')).toContain('admin');

    const tokenRow = await env.DB.prepare(
      `SELECT used_at FROM email_tokens WHERE purpose = 'account-decision' AND account_request_id IN (SELECT id FROM account_requests WHERE email = ?) LIMIT 1`
    )
      .bind('operations@fungiagricap.com')
      .first<{ used_at: string | null }>();
    expect(tokenRow?.used_at).not.toBeNull();
  });

  it('reissues activation links for existing users', async () => {
    await env.DB.prepare(
      `INSERT INTO users (id, email, display_name, status, apps, roles, password_hash, mfa_enrolled, created_at, updated_at)
       VALUES (?1, ?2, ?3, 'pending', ?4, '["user"]', NULL, 0, datetime('now'), datetime('now'))`
    )
      .bind('user-activation', 'resend@example.com', 'Resend User', JSON.stringify({ website: false, program: true, canvas: true }))
      .run();

    const response = await app.fetch(
      new Request('http://localhost/v1/account/activation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'resend@example.com' })
      }),
      env
    );

    expect(response.status).toBe(202);
    const body = await response.json();
    expect(body.status).toBe('sent');
    const tokenRow = await env.DB.prepare(
      `SELECT purpose FROM email_tokens WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`
    )
      .bind('user-activation')
      .first<{ purpose: string }>();
    expect(tokenRow?.purpose).toBe('signup');
  });
});

afterAll(() => {
  infoSpy.mockRestore();
  warnSpy.mockRestore();
});
