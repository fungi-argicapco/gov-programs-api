import { describe, it, expect } from 'vitest';
import app from '../apps/api/src/index';
import { createTestDB } from './helpers/d1';

const schema = `
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

describe('playbook climate endpoint', () => {
  it('returns climate summary for a country', async () => {
    const db = createTestDB();
    await db.exec(schema);
    const now = Date.now();
    await db
      .prepare(
        `INSERT INTO climate_country_metrics (dataset_id, indicator, country_iso3, year, value, unit, metadata, version, source, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind('climate_esg_metrics', 'epi_score', 'CAN', 2024, 75.6, null, null, '2025-10-02', 'yale_epi', now, now)
      .run();

    const env = { DB: db } as any;
    const response = await app.fetch(new Request('http://localhost/v1/playbooks/CAN'), env);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.country).toBe('CAN');
    expect(body.data.climate.indicators.epi_score.value).toBe(75.6);
  });

  it('responds 404 when climate metrics missing', async () => {
    const db = createTestDB();
    await db.exec(schema);
    const env = { DB: db } as any;
    const response = await app.fetch(new Request('http://localhost/v1/playbooks/USA'), env);
    expect(response.status).toBe(404);
  });
});
