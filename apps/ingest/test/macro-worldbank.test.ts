import { describe, expect, it } from 'vitest';

import { parseWorldBankPage, type FetchLike } from '../src/macro/worldbank';
import { MACRO_SOURCES } from '../src/macro/sources';
import { ingestMacroMetrics as ingestWithSources } from '../src/macro/ingest';
import type { MacroMetricSource } from '../src/macro/types';
import { createTestDB } from '../../../tests/helpers/d1';

const SAMPLE_PAYLOAD = [
  {
    page: 1,
    pages: 1,
    per_page: 6,
    total: 6,
    lastupdated: '2025-07-01'
  },
  [
    {
      indicator: { id: 'NY.GDP.MKTP.CD', value: 'GDP (current US$)' },
      country: { id: 'US', value: 'United States' },
      countryiso3code: 'USA',
      date: '2024',
      value: 29184890000000,
      unit: '',
      obs_status: '',
      decimal: 0
    },
    {
      indicator: { id: 'NY.GDP.MKTP.CD', value: 'GDP (current US$)' },
      country: { id: 'US', value: 'United States' },
      countryiso3code: 'USA',
      date: '2023',
      value: 27720709000000,
      unit: '',
      obs_status: '',
      decimal: 0
    },
    {
      indicator: { id: 'NY.GDP.MKTP.CD', value: 'GDP (current US$)' },
      country: { id: 'US', value: 'United States' },
      countryiso3code: 'USA',
      date: '2022',
      value: 26006893000000,
      unit: '',
      obs_status: '',
      decimal: 0
    }
  ]
] as const;

describe('parseWorldBankPage', () => {
  it('normalises observations from the World Bank payload', () => {
    const source = MACRO_SOURCES[0];
    const parsed = parseWorldBankPage(source, SAMPLE_PAYLOAD);

    expect(parsed.observations).toHaveLength(3);
    expect(parsed.observations[0]).toMatchObject({
      year: 2024,
      value: 29184890000000,
      metadata: expect.objectContaining({
        indicatorId: 'NY.GDP.MKTP.CD',
        indicatorName: 'GDP (current US$)',
        countryIso3: 'USA'
      })
    });
    expect(parsed.totalPages).toBe(1);
    expect(parsed.lastUpdated).toBe('2025-07-01');
  });
});

describe('ingestMacroMetrics', () => {
  function createEnv() {
    const db = createTestDB();
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
      CREATE INDEX idx_macro_metrics_unit_metric ON macro_metrics (admin_unit_code, metric_name);
    `);
    return db;
  }

  it('inserts new macro metric rows from a world bank source', async () => {
    const db = createEnv();
    const fetchImpl: FetchLike = async () => new Response(JSON.stringify(SAMPLE_PAYLOAD), {
      headers: { 'Content-Type': 'application/json' }
    });

    const source: MacroMetricSource = {
      ...MACRO_SOURCES[0],
      maxYears: 3
    };

    const summaries = await ingestWithSources(
      { DB: db } as any,
      [source],
      { fetchImpl }
    );

    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({
      fetched: 3,
      inserted: 3,
      updated: 0,
      skipped: 0,
      errors: []
    });

    const rows = await db.prepare(
      'SELECT metric_year AS year, metric_value AS value, automation_metadata AS automation FROM macro_metrics ORDER BY metric_year DESC'
    ).all<{ year: number; value: number; automation: string }>();

    expect(rows.results).toHaveLength(3);
    expect(rows.results[0].year).toBe(2024);
    expect(rows.results[0].value).toBe(29184890000000);
    expect(rows.results[0].automation).toContain('worldbank');
  });

  it('updates existing rows when values change', async () => {
    const db = createEnv();
    const firstFetch: FetchLike = async () => new Response(JSON.stringify(SAMPLE_PAYLOAD));

    const source: MacroMetricSource = {
      ...MACRO_SOURCES[0],
      maxYears: 2
    };

    await ingestWithSources(
      { DB: db } as any,
      [source],
      { fetchImpl: firstFetch }
    );

    const updatedPayload = JSON.parse(JSON.stringify(SAMPLE_PAYLOAD));
    updatedPayload[1][0].value = 30000000000000;
    const secondFetch: FetchLike = async () => new Response(JSON.stringify(updatedPayload));

    const summaries = await ingestWithSources(
      { DB: db } as any,
      [source],
      { fetchImpl: secondFetch }
    );

    expect(summaries[0]).toMatchObject({
      fetched: 2,
      inserted: 0,
      updated: 1,
      skipped: 1,
      errors: []
    });

    const row = await db
      .prepare('SELECT metric_value AS value FROM macro_metrics WHERE metric_year = 2024 LIMIT 1')
      .first<{ value: number }>();

    expect(row?.value).toBe(30000000000000);
  });
});
