import { describe, expect, it } from 'vitest';

import { ingestEsgIndicators } from '../src/datasets/esg_indicators_ingest';
import { createTestDB } from '../../../tests/helpers/d1';

const SCHEMA = `
CREATE TABLE esg_indicator_metadata (
  indicator_code TEXT PRIMARY KEY,
  indicator_name TEXT NOT NULL,
  description TEXT,
  unit TEXT,
  source TEXT,
  methodology TEXT,
  coverage TEXT,
  notes TEXT,
  last_updated TEXT
);
CREATE TABLE esg_country_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dataset_id TEXT NOT NULL,
  indicator_code TEXT NOT NULL,
  country_iso3 TEXT NOT NULL,
  year INTEGER NOT NULL,
  value REAL,
  unit TEXT,
  source TEXT NOT NULL,
  version TEXT NOT NULL,
  metadata TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_esg_country_metrics_indicator ON esg_country_metrics (indicator_code, country_iso3, year);
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
`;

describe('ingestEsgIndicators', () => {
  it('ingests world bank and OECD indicators into ESG tables', async () => {
    const DB = createTestDB();
    await DB.exec(SCHEMA);

    const worldBankStub = async () => [
      {
        indicatorCode: 'SP.POP.TOTL',
        indicatorName: 'Population, total',
        lastUpdated: '2025-07-01',
        observations: [
          {
            indicatorCode: 'SP.POP.TOTL',
            indicatorName: 'Population, total',
            countryIso3: 'USA',
            year: 2024,
            value: 340110988,
            unit: 'persons',
            decimal: 0
          }
        ]
      },
      {
        indicatorCode: 'GE.EST',
        indicatorName: 'Government effectiveness',
        lastUpdated: '2025-07-01',
        observations: [
          {
            indicatorCode: 'GE.EST',
            indicatorName: 'Government effectiveness',
            countryIso3: 'USA',
            year: 2024,
            value: 1.2,
            unit: null,
            decimal: 2
          }
        ]
      }
    ];

    const oecdStub = async () => ({
      observations: [
        {
          countryIso3: 'USA',
          pollutant: 'TOTL',
          variable: 'TOTL',
          year: 2024,
          value: 5000,
          unit: 'kilotons of CO₂ equivalent'
        }
      ],
      prepared: '2025-09-01T00:00:00Z'
    });

    const result = await ingestEsgIndicators(
      { DB },
      {
        fetchWorldBank: worldBankStub as any,
        fetchOecd: oecdStub as any,
        worldBankStartYear: 2024,
        worldBankEndYear: 2024
      }
    );

    expect(result.datasetId).toBe('esg_indicators');
    const metadataCount = (await DB.prepare('SELECT COUNT(*) as count FROM esg_indicator_metadata').first<{ count: number }>())?.count ?? 0;
    expect(metadataCount).toBeGreaterThan(0);

    const populationRow = await DB.prepare(
      `SELECT value FROM esg_country_metrics WHERE indicator_code = 'SP.POP.TOTL' AND country_iso3 = 'USA' AND year = 2024`
    ).first<{ value: number }>();
    expect(populationRow?.value).toBe(340110988);

    const oecdRow = await DB.prepare(
      `SELECT value, metadata FROM esg_country_metrics WHERE indicator_code = 'AIR_GHG_TOTAL_EMISSIONS' AND country_iso3 = 'USA' AND year = 2024`
    ).first<{ value: number; metadata: string }>();
    expect(oecdRow?.value).toBe(5000);
    expect(oecdRow?.metadata ?? '').toContain('"pollutant":"TOTL"');
  });
});
