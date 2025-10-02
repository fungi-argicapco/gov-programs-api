import { describe, expect, it } from 'vitest';

import { ingestClimateMetrics } from '../src/datasets/climate_metrics_ingest';
import { createTestDB } from '../../../tests/helpers/d1';

function setupSchema(db: ReturnType<typeof createTestDB>) {
  db.exec(`
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
    CREATE TABLE dataset_services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dataset_id TEXT NOT NULL,
      service_name TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      http_methods TEXT,
      parameters TEXT,
      authentication TEXT,
      rate_limit TEXT,
      cadence TEXT,
      change_detection TEXT,
      status_page TEXT,
      readiness TEXT,
      notes TEXT,
      source_url TEXT,
      verification_date TEXT,
      automation_metadata TEXT,
      metadata TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX idx_dataset_services_unique ON dataset_services (dataset_id, service_name);
    CREATE TABLE dataset_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dataset_id TEXT NOT NULL,
      version TEXT NOT NULL,
      captured_at INTEGER NOT NULL,
      payload TEXT NOT NULL,
      metadata TEXT,
      created_at INTEGER NOT NULL
    );
  `);
}

describe('ingestClimateMetrics', () => {
  it('ingests ND-GAIN, Aqueduct, and FEMA sample metrics', async () => {
    const DB = createTestDB();
    setupSchema(DB);

    const result = await ingestClimateMetrics({ DB });

    const countryCount = (await DB.prepare('SELECT COUNT(*) AS count FROM climate_country_metrics').first<{ count: number }>())?.count ?? 0;
    expect(countryCount).toBeGreaterThan(0);

    const ndGain = await DB.prepare(
      `SELECT value FROM climate_country_metrics WHERE dataset_id = 'climate_esg_metrics' AND source = 'nd_gain' AND indicator = 'nd_gain_index' AND country_iso3 = 'USA'`
    ).first<{ value: number }>();
    expect(ndGain?.value).toBe(0.75);

    const province = await DB.prepare(
      `SELECT metadata FROM climate_subnational_metrics WHERE dataset_id = 'climate_esg_metrics' AND source = 'wri_aqueduct_province' AND admin_code = 'USA-CA'`
    ).first<{ metadata: string }>();
    expect(province?.metadata ?? '').toContain('California');

    const nri = await DB.prepare(
      `SELECT metadata FROM climate_subnational_metrics WHERE dataset_id = 'climate_esg_metrics' AND source = 'fema_nri_county' AND admin_code = '06037'`
    ).first<{ metadata: string }>();
    expect(nri?.metadata ?? '').toContain('Los Angeles');

    expect(result.tables[0].table).toBe('climate_country_metrics');
  });
});
