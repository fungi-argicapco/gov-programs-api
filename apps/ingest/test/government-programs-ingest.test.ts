import { describe, expect, it } from 'vitest';

import { ingestGovernmentProgramsDataset, GOVERNMENT_PROGRAMS_DATASET_ID } from '../src/datasets/government_programs_ingest';
import { createTestDB } from '../../../tests/helpers/d1';

function setupSchema(db: ReturnType<typeof createTestDB>) {
  db.exec(`
    CREATE TABLE programs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uid TEXT NOT NULL UNIQUE,
      country_code TEXT NOT NULL,
      authority_level TEXT NOT NULL,
      jurisdiction_code TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT,
      benefit_type TEXT,
      status TEXT,
      industry_codes TEXT,
      start_date TEXT,
      end_date TEXT,
      url TEXT,
      source_id INTEGER,
      program_category TEXT,
      investor_thesis TEXT,
      funding_min_value INTEGER,
      funding_max_value INTEGER,
      funding_currency TEXT,
      funding_bracket TEXT,
      application_status TEXT,
      problem_keywords TEXT,
      esg_focus TEXT,
      verification_date TEXT,
      data_refresh_frequency TEXT,
      contact_channel TEXT,
      notes_internal TEXT,
      automation_ready TEXT,
      api_endpoint TEXT,
      api_parameters TEXT,
      api_authentication TEXT,
      api_rate_limit TEXT,
      api_update_cadence TEXT,
      api_change_detection TEXT,
      api_status_page TEXT,
      automation_metadata TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE benefits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      program_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      min_amount_cents INTEGER,
      max_amount_cents INTEGER,
      currency_code TEXT,
      notes TEXT
    );
    CREATE TABLE criteria (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      program_id INTEGER NOT NULL,
      kind TEXT NOT NULL,
      operator TEXT NOT NULL,
      value TEXT NOT NULL
    );
    CREATE TABLE tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      program_id INTEGER NOT NULL,
      tag TEXT NOT NULL
    );
    CREATE TABLE program_diffs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      program_uid TEXT NOT NULL,
      source_id INTEGER,
      run_id INTEGER,
      ts INTEGER NOT NULL,
      diff TEXT NOT NULL,
      summary TEXT,
      critical INTEGER
    );
    CREATE TABLE snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      program_id INTEGER,
      raw_key TEXT NOT NULL,
      raw_hash TEXT,
      fetched_at INTEGER NOT NULL,
      adapter TEXT NOT NULL,
      source_url TEXT
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
    CREATE TABLE industry_mappings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      naics_code TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '[]',
      confidence REAL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
    );
    CREATE UNIQUE INDEX idx_industry_mappings_code ON industry_mappings(naics_code);
    CREATE UNIQUE INDEX idx_programs_uid ON programs(uid);
    CREATE UNIQUE INDEX idx_dataset_services_unique ON dataset_services (dataset_id, service_name);
  `);
}

describe('ingestGovernmentProgramsDataset', () => {
  it('upserts government programs and enrichment metadata', async () => {
    const DB = createTestDB();
    setupSchema(DB);

    const result = await ingestGovernmentProgramsDataset({ DB });

    expect(result.tables[0].inserted + result.tables[0].updated).toBeGreaterThan(0);

    const program = await DB.prepare(
      `SELECT program_category, investor_thesis, application_status, esg_focus, automation_metadata
       FROM programs WHERE jurisdiction_code = ? AND title = ?`
    )
      .bind('US-AL', 'Transmission Siting and Economic Development (TSED) Grant Program')
      .first<{ program_category: string; investor_thesis: string; application_status: string; esg_focus: string; automation_metadata: string }>();

    expect(program?.program_category).toBe('government');
    expect(program?.investor_thesis ?? '').toContain('clean energy');
    expect(['open', 'rolling', 'upcoming', 'unknown']).toContain(program?.application_status);
    expect(program?.esg_focus).toContain('SDG');
    expect(program?.automation_metadata ?? '').toContain(GOVERNMENT_PROGRAMS_DATASET_ID);

    const snapshotCount = (await DB.prepare(
      'SELECT COUNT(*) AS count FROM dataset_snapshots WHERE dataset_id = ?'
    )
      .bind(GOVERNMENT_PROGRAMS_DATASET_ID)
      .first<{ count: number }>())?.count ?? 0;
    expect(snapshotCount).toBe(1);
  });
});
