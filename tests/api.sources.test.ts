import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import app from '../apps/api/src/index';
import { SOURCES } from '../data/sources/phase2';
import { createTestDB } from './helpers/d1';

const migrations = ['0001_init.sql', '0002_fts.sql', '0003_ingest_obs.sql'];

const readMigration = (name: string) =>
  fs.readFileSync(path.join(process.cwd(), 'migrations', name), 'utf-8');

describe('/v1/sources', () => {
  let env: { DB: ReturnType<typeof createTestDB> };

  beforeEach(() => {
    const db = createTestDB();
    for (const file of migrations) {
      db.__db__.exec(readMigration(file));
    }
    env = { DB: db };
  });

  it('returns catalog metadata merged with ingest metrics', async () => {
    const db = env.DB;
    const source = SOURCES[0];

    await db
      .prepare(
        `INSERT INTO sources (name, url, license, tos_url, authority_level, jurisdiction_code)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(
        source.id,
        source.entrypoint,
        source.license ?? null,
        source.tosUrl ?? null,
        source.authority,
        source.jurisdiction
      )
      .run();

    const now = Date.now();
    await db
      .prepare(
        `INSERT INTO ingestion_runs (source_id, started_at, ended_at, status, fetched, inserted, updated, unchanged, errors, message)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(1, now - 1000, now, 'ok', 10, 5, 3, 2, 0, null)
      .run();

    const response = await app.fetch(new Request('http://localhost/v1/sources'), env as any);
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(Array.isArray(payload.data)).toBe(true);
    expect(payload.data.length).toBe(1);

    const [first] = payload.data;
    expect(first).toMatchObject({
      id: source.id,
      source_id: 1,
      country_code: source.country,
      authority: source.authority,
      jurisdiction_code: source.jurisdiction,
      kind: source.kind,
      parser: source.parser,
      schedule: source.schedule,
      rate: source.rate,
      url: source.entrypoint,
      license: source.license ?? null,
      tos_url: source.tosUrl ?? null,
      last_success_at: now,
      success_rate_7d: 1
    });
  });
});
