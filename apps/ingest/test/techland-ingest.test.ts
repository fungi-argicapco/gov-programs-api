import { describe, expect, it } from 'vitest';

import { ingestTechlandDataset } from '../src/datasets/techland_ingest';
import { createTestDB } from '../../../tests/helpers/d1';

function setupSchema(db: ReturnType<typeof createTestDB>) {
  db.exec(`
    CREATE TABLE industry_clusters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      country_code TEXT NOT NULL,
      admin_unit_code TEXT NOT NULL,
      admin_unit_level TEXT,
      cluster_name TEXT,
      cluster_description TEXT,
      employment TEXT,
      gdp_contribution TEXT,
      growth_rate TEXT,
      key_employers TEXT,
      partner_orgs TEXT,
      unsdg_alignment TEXT,
      problem_keywords TEXT,
      source_url TEXT,
      verification_date TEXT,
      automation_metadata TEXT,
      metadata TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE workforce_ecosystem (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      country_code TEXT NOT NULL,
      admin_unit_code TEXT NOT NULL,
      admin_unit_level TEXT,
      program_name TEXT,
      provider TEXT,
      delivery_model TEXT,
      focus_area TEXT,
      capacity INTEGER,
      funding_sources TEXT,
      technology_partners TEXT,
      esg_focus TEXT,
      problem_keywords TEXT,
      source_url TEXT,
      verification_date TEXT,
      automation_metadata TEXT,
      metadata TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE infrastructure_assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      country_code TEXT NOT NULL,
      admin_unit_code TEXT NOT NULL,
      admin_unit_level TEXT,
      asset_name TEXT,
      asset_type TEXT,
      status TEXT,
      capacity_value REAL,
      capacity_unit TEXT,
      cost_estimate REAL,
      currency_code TEXT,
      owner TEXT,
      esg_rating TEXT,
      availability TEXT,
      location TEXT,
      source_url TEXT,
      verification_date TEXT,
      automation_metadata TEXT,
      metadata TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE regulatory_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      country_code TEXT NOT NULL,
      admin_unit_code TEXT NOT NULL,
      admin_unit_level TEXT,
      policy_area TEXT,
      description TEXT,
      requirement_level TEXT,
      risk_level TEXT,
      compliance_window TEXT,
      effective_date TEXT,
      review_date TEXT,
      mitigation_plan TEXT,
      source_url TEXT,
      verification_date TEXT,
      automation_metadata TEXT,
      metadata TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE raid_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      country_code TEXT NOT NULL,
      admin_unit_code TEXT NOT NULL,
      admin_unit_level TEXT,
      risk_description TEXT,
      assumption TEXT,
      issue TEXT,
      dependency TEXT,
      severity TEXT,
      impact TEXT,
      mitigation TEXT,
      notes TEXT,
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

describe('ingestTechlandDataset', () => {
  it('loads static dataset into playbook tables', async () => {
    const DB = createTestDB();
    setupSchema(DB);

    const result = await ingestTechlandDataset({ DB });

    const byTable = Object.fromEntries(result.tables.map((s) => [s.table, s]));
    expect(byTable.industry_clusters.inserted).toBeGreaterThan(0);
    expect(byTable.workforce_ecosystem.inserted).toBeGreaterThan(0);
    expect(byTable.infrastructure_assets.inserted).toBeGreaterThan(0);
    expect(byTable.regulatory_profiles.inserted).toBeGreaterThan(0);
    expect(byTable.raid_logs.inserted).toBeGreaterThan(0);

    const industryCount = (await DB.prepare('SELECT COUNT(*) AS count FROM industry_clusters').first<{ count: number }>())?.count;
    expect(industryCount).toBe(10);

    const regulatory = await DB.prepare(
      'SELECT policy_area, risk_level FROM regulatory_profiles WHERE admin_unit_code = ?'
    )
      .bind('US-CA')
      .first<{ policy_area: string; risk_level: string }>();
    expect(regulatory?.policy_area).toBe('Statewide business environment');
    expect(regulatory?.risk_level).toBe('Medium');

    const snapshotCount = (await DB.prepare(
      'SELECT COUNT(*) AS count FROM dataset_snapshots WHERE dataset_id = ?'
    )
      .bind(result.datasetId)
      .first<{ count: number }>())?.count;
    expect(snapshotCount).toBe(1);
  });
});
