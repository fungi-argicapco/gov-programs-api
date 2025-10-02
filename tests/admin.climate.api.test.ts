import { describe, it, expect } from 'vitest';
import app from '../apps/api/src/index';
import { createTestDB } from './helpers/d1';
import { upsertDevApiKey } from '../apps/api/src/mw.auth';

const ADMIN_KEY = 'admin-climate-test-key';

const schema = `
CREATE TABLE api_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key_hash TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL,
  name TEXT,
  quota_daily INTEGER,
  quota_monthly INTEGER,
  created_at INTEGER,
  updated_at INTEGER,
  last_seen_at INTEGER
);
CREATE TABLE usage_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  api_key_id INTEGER NOT NULL,
  ts INTEGER NOT NULL,
  route TEXT NOT NULL,
  cost INTEGER DEFAULT 1
);
CREATE TABLE admin_audits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_key_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  target TEXT,
  meta TEXT,
  ts INTEGER NOT NULL
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
    await upsertDevApiKey(db as any, { rawKey: ADMIN_KEY, role: 'admin', name: 'climate-admin' });

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

    const env = { DB: db } as any;

    const response = await app.fetch(
      new Request('http://localhost/v1/admin/climate', {
        headers: { 'x-api-key': ADMIN_KEY }
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
