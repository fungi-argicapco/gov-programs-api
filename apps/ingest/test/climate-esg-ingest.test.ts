import { describe, expect, it } from 'vitest';

import { ingestClimateEsgSources, CLIMATE_ESG_DATASET_ID } from '../src/datasets/climate_esg_ingest';
import { createTestDB } from '../../../tests/helpers/d1';

function setupSchema(db: ReturnType<typeof createTestDB>) {
  db.exec(`
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

describe('ingestClimateEsgSources', () => {
  it('records dataset services and snapshot for climate & ESG catalog', async () => {
    const DB = createTestDB();
    setupSchema(DB);

    const result = await ingestClimateEsgSources({ DB });

    const serviceCount = (await DB.prepare(
      'SELECT COUNT(*) AS count FROM dataset_services WHERE dataset_id = ?'
    )
      .bind(CLIMATE_ESG_DATASET_ID)
      .first<{ count: number }>())?.count ?? 0;
    expect(serviceCount).toBeGreaterThan(0);
    expect(result.tables[0].inserted).toBe(serviceCount);

    const snapshotCount = (await DB.prepare(
      'SELECT COUNT(*) AS count FROM dataset_snapshots WHERE dataset_id = ?'
    )
      .bind(CLIMATE_ESG_DATASET_ID)
      .first<{ count: number }>())?.count ?? 0;
    expect(snapshotCount).toBe(1);

    const sample = await DB.prepare(
      'SELECT automation_metadata FROM dataset_services WHERE dataset_id = ? LIMIT 1'
    )
      .bind(CLIMATE_ESG_DATASET_ID)
      .first<{ automation_metadata: string }>();
    expect(sample?.automation_metadata ?? '').toContain(CLIMATE_ESG_DATASET_ID);
  });
});
