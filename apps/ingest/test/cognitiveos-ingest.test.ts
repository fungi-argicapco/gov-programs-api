import { describe, expect, it } from 'vitest';

import { ingestCognitiveDataset } from '../src/datasets/cognitiveos_ingest';
import { createTestDB } from '../../../tests/helpers/d1';

function setupSchema(db: ReturnType<typeof createTestDB>) {
  db.exec(`
    CREATE TABLE partnerships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      country_code TEXT NOT NULL,
      admin_unit_code TEXT NOT NULL,
      admin_unit_level TEXT,
      partner_type TEXT NOT NULL,
      organization_name TEXT NOT NULL,
      thesis TEXT,
      offering TEXT,
      contact_channel TEXT,
      status TEXT,
      esg_focus TEXT,
      problem_keywords TEXT,
      capital_commitment REAL,
      currency_code TEXT,
      source_url TEXT,
      verification_date TEXT,
      automation_metadata TEXT,
      metadata TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE financial_assumptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scenario_id TEXT NOT NULL,
      country_code TEXT NOT NULL,
      admin_unit_code TEXT NOT NULL,
      admin_unit_level TEXT,
      scenario_name TEXT,
      revenue_drivers TEXT,
      cost_drivers TEXT,
      sensitivity_inputs TEXT,
      timeline TEXT,
      notes TEXT,
      source_url TEXT,
      verification_date TEXT,
      automation_metadata TEXT,
      metadata TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE capital_stack_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scenario_id TEXT NOT NULL,
      country_code TEXT,
      admin_unit_code TEXT,
      instrument_type TEXT NOT NULL,
      provider TEXT,
      amount REAL,
      currency_code TEXT,
      terms TEXT,
      seniority TEXT,
      risk_mitigation TEXT,
      source_url TEXT,
      verification_date TEXT,
      automation_metadata TEXT,
      metadata TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE roadmap_milestones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      country_code TEXT NOT NULL,
      admin_unit_code TEXT NOT NULL,
      admin_unit_level TEXT,
      milestone_name TEXT NOT NULL,
      description TEXT,
      start_date TEXT,
      end_date TEXT,
      owner TEXT,
      status TEXT,
      stage_gate TEXT,
      dependencies TEXT,
      risk_level TEXT,
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

describe('ingestCognitiveDataset', () => {
  it('populates partnerships, financial assumptions, capital stack, and roadmap', async () => {
    const DB = createTestDB();
    setupSchema(DB);

    const result = await ingestCognitiveDataset({ DB });

    const partnerCount = (await DB.prepare('SELECT COUNT(*) AS count FROM partnerships').first<{ count: number }>())?.count;
    expect(partnerCount).toBeGreaterThanOrEqual(10);

    const scenarioCount = (await DB.prepare('SELECT COUNT(*) AS count FROM financial_assumptions').first<{ count: number }>())?.count;
    expect(scenarioCount).toBeGreaterThanOrEqual(6);

    const capitalLayers = await DB.prepare('SELECT instrument_type FROM capital_stack_entries').all<{ instrument_type: string }>();
    expect(capitalLayers.results.map((row) => row.instrument_type).sort()).toContain('senior debt');

    const roadmap = await DB.prepare('SELECT milestone_name FROM roadmap_milestones WHERE stage_gate = ?').bind('Gate 5').first<{ milestone_name: string }>();
    expect(roadmap?.milestone_name).toBe('Full product launch');

    const snapshotCount = (await DB.prepare('SELECT COUNT(*) AS count FROM dataset_snapshots WHERE dataset_id = ?').bind(result.datasetId).first<{ count: number }>())?.count;
    expect(snapshotCount).toBe(1);

    const serviceCount = (await DB.prepare('SELECT COUNT(*) AS count FROM dataset_services WHERE dataset_id = ?').bind(result.datasetId).first<{ count: number }>())?.count;
    expect(serviceCount).toBeGreaterThanOrEqual(5);
  });
});
