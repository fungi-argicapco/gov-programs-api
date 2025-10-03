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
});

afterAll(() => {
  infoSpy.mockRestore();
  warnSpy.mockRestore();
});
