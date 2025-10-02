import { describe, expect, it } from 'vitest';

import { ingestMacroGlobalDataset, MACRO_GLOBAL_DATASET_ID } from '../src/datasets/macro_global_ingest';
import { createTestDB } from '../../../tests/helpers/d1';

function setupSchema(db: ReturnType<typeof createTestDB>) {
  db.exec(`
    CREATE TABLE macro_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      country_code TEXT NOT NULL,
      admin_unit_code TEXT NOT NULL,
      admin_unit_name TEXT,
      admin_unit_level TEXT,
      metric_group TEXT,
      metric_name TEXT NOT NULL,
      metric_value REAL,
      value_text TEXT,
      metric_unit TEXT,
      metric_year INTEGER,
      source_url TEXT,
      verification_date TEXT,
      automation_metadata TEXT,
      metadata TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE dataset_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dataset_id TEXT NOT NULL,
      version TEXT NOT NULL,
      captured_at INTEGER NOT NULL,
      payload TEXT NOT NULL,
      metadata TEXT,
      created_at INTEGER NOT NULL
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
  `);
}

describe('ingestMacroGlobalDataset', () => {
  it('loads macro metrics for global subdivisions', async () => {
    const DB = createTestDB();
    setupSchema(DB);

    const result = await ingestMacroGlobalDataset({ DB });

    const metricsCount = (await DB.prepare('SELECT COUNT(*) AS count FROM macro_metrics').first<{ count: number }>())?.count ?? 0;
    expect(metricsCount).toBeGreaterThan(0);

    const populationRow = await DB.prepare(
      'SELECT metric_value, metric_unit FROM macro_metrics WHERE admin_unit_code = ? AND metric_name = ? LIMIT 1'
    )
      .bind('US-CA', 'Population')
      .first<{ metric_value: number; metric_unit: string }>();
    expect(populationRow?.metric_unit).toBe('people');
    expect(populationRow?.metric_value).toBeGreaterThan(0);

    const snapshotCount = (await DB.prepare(
      'SELECT COUNT(*) AS count FROM dataset_snapshots WHERE dataset_id = ?'
    )
      .bind(MACRO_GLOBAL_DATASET_ID)
      .first<{ count: number }>())?.count ?? 0;
    expect(snapshotCount).toBe(1);

    const serviceCount = (await DB.prepare(
      'SELECT COUNT(*) AS count FROM dataset_services WHERE dataset_id = ?'
    )
      .bind(MACRO_GLOBAL_DATASET_ID)
      .first<{ count: number }>())?.count ?? 0;
    expect(serviceCount).toBeGreaterThanOrEqual(6);

    expect(result.tables[0].inserted + result.tables[0].updated).toBeGreaterThan(0);
  });
});
