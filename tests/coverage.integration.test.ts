import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';
import type { D1Database, KVNamespace } from '@cloudflare/workers-types';

import { buildCoverageResponse } from '../apps/api/src/coverage';
import { runEnrichmentBackfill } from '../apps/ingest/src/backfill.enrichment';
import { writeDailyCoverage } from '../apps/ingest/src/precompute.coverage';
import { createTestDB } from './helpers/d1';

const COVERAGE_DAY = '2024-03-15';
const COVERAGE_TIME = new Date('2024-03-15T00:00:00Z');
const ENRICHMENT_TIME = new Date('2024-03-16T00:00:00Z');

async function createSchema(db: D1Database) {
  await db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      url TEXT,
      license TEXT,
      tos_url TEXT,
      authority_level TEXT NOT NULL,
      jurisdiction_code TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS programs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uid TEXT NOT NULL UNIQUE,
      country_code TEXT NOT NULL,
      authority_level TEXT NOT NULL,
      jurisdiction_code TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT,
      benefit_type TEXT,
      status TEXT NOT NULL,
      industry_codes TEXT,
      start_date TEXT,
      end_date TEXT,
      url TEXT,
      source_id INTEGER,
      created_at INTEGER,
      updated_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS benefits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      program_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      min_amount_cents INTEGER,
      max_amount_cents INTEGER,
      currency_code TEXT,
      notes TEXT,
      FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS criteria (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      program_id INTEGER NOT NULL,
      kind TEXT NOT NULL,
      operator TEXT NOT NULL,
      value TEXT NOT NULL,
      FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      program_id INTEGER NOT NULL,
      tag TEXT NOT NULL,
      FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ingestion_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id INTEGER NOT NULL,
      started_at INTEGER NOT NULL,
      ended_at INTEGER NOT NULL,
      status TEXT NOT NULL,
      fetched INTEGER DEFAULT 0,
      inserted INTEGER DEFAULT 0,
      updated INTEGER DEFAULT 0,
      unchanged INTEGER DEFAULT 0,
      errors INTEGER DEFAULT 0,
      message TEXT,
      FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS coverage_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      program_id INTEGER NOT NULL,
      run_id INTEGER,
      issues TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE CASCADE,
      FOREIGN KEY (run_id) REFERENCES ingestion_runs(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS coverage_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      day TEXT NOT NULL,
      run_id INTEGER,
      with_tags INTEGER NOT NULL DEFAULT 0,
      without_tags INTEGER NOT NULL DEFAULT 0,
      with_naics INTEGER NOT NULL DEFAULT 0,
      missing_naics INTEGER NOT NULL DEFAULT 0,
      validation_issues TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL,
      FOREIGN KEY (run_id) REFERENCES ingestion_runs(id) ON DELETE SET NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_coverage_reports_day ON coverage_reports(day);

    CREATE TABLE IF NOT EXISTS daily_coverage_stats (
      day TEXT PRIMARY KEY,
      country_code TEXT,
      jurisdiction_code TEXT,
      n_programs INTEGER,
      fresh_sources INTEGER,
      naics_density REAL,
      deadlink_rate REAL,
      created_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS industry_mappings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      naics_code TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '[]',
      confidence REAL,
      created_at INTEGER,
      updated_at INTEGER
    );
  `);
}

async function seedFixtures(db: D1Database, now: number) {
  const stale = now - 90 * 24 * 60 * 60 * 1000;

  await db.prepare(
    `INSERT INTO sources (id, name, url, license, tos_url, authority_level, jurisdiction_code)
     VALUES (1, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      'us-fed-grants-gov',
      'https://sources.example/grants',
      'https://license.example/grants',
      'https://tos.example/grants',
      'federal',
      'US-FED'
    )
    .run();

  await db.prepare(
    `INSERT INTO programs (id, uid, country_code, authority_level, jurisdiction_code, title, summary, benefit_type, status, industry_codes, start_date, end_date, url, source_id, created_at, updated_at)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      'program-healthy',
      'US',
      'federal',
      'US-FED',
      'Healthy Growth Program',
      'Supports small businesses with expansion capital.',
      'grant',
      'open',
      JSON.stringify(['111111']),
      '2024-01-01',
      '2024-12-31',
      'https://example.com/programs/healthy',
      1,
      now,
      now
    )
    .run();

  await db.prepare(
    `INSERT INTO benefits (id, program_id, type, min_amount_cents, max_amount_cents, currency_code, notes)
     VALUES (1, 1, 'grant', ?, ?, 'USD', 'Matching funds available')`
  )
    .bind(10000, 50000)
    .run();

  await db.prepare(
    `INSERT INTO criteria (id, program_id, kind, operator, value)
     VALUES (1, 1, 'industry', 'eq', 'manufacturing')`
  ).run();

  await db.prepare(
    `INSERT INTO tags (id, program_id, tag) VALUES (1, 1, 'growth')`
  ).run();

  await db.prepare(
    `INSERT INTO programs (id, uid, country_code, authority_level, jurisdiction_code, title, summary, benefit_type, status, industry_codes, start_date, end_date, url, source_id, created_at, updated_at)
     VALUES (2, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      'program-missing',
      'US',
      'state',
      'US-CA',
      'Widget Business Relief',
      null,
      'grant',
      'open',
      null,
      null,
      '2023-01-01',
      null,
      null,
      stale,
      stale
    )
    .run();

  await db.prepare(
    `INSERT INTO ingestion_runs (id, source_id, started_at, ended_at, status, fetched, inserted, updated, unchanged, errors, message)
     VALUES (1, 1, ?, ?, 'ok', 10, 5, 3, 2, 0, NULL)`
  )
    .bind(now - 3 * 60 * 60 * 1000, now - 2 * 60 * 60 * 1000)
    .run();

  await db.prepare(
    `INSERT INTO industry_mappings (id, naics_code, tags, confidence, created_at, updated_at)
     VALUES (1, '333333', ?, 0.9, ?, ?)`
  )
    .bind(JSON.stringify(['manufacturing', 'widget-support']), now, now)
    .run();
}

describe('coverage integration flow', () => {
  let db: D1Database;
  let dateNowSpy: ReturnType<typeof vi.spyOn> | null = null;

  beforeEach(async () => {
    db = createTestDB();
    await createSchema(db);
    await seedFixtures(db, COVERAGE_TIME.getTime());
  });

  afterEach(() => {
    dateNowSpy?.mockRestore();
    dateNowSpy = null;
  });

  it('precomputes coverage data, backfills enrichment, and exposes API view', async () => {
    dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(COVERAGE_TIME.getTime());

    const lookupsGet = vi.fn(async (key: string) => {
      if (key === `metrics:deadlinks:${COVERAGE_DAY}`) {
        return { rate: 0.25, n: 4, bad: [{ id: 1, url: 'https://example.com/bad-link' }] };
      }
      if (key === 'naics:synonyms:v1') {
        return [{ code: '333333', synonyms: ['widget'] }];
      }
      return null;
    });

    const lookups = {
      get: lookupsGet,
      put: vi.fn(),
      delete: vi.fn(),
      list: vi.fn(async () => ({ keys: [], list_complete: true }))
    } as unknown as KVNamespace;

    await writeDailyCoverage({ DB: db, LOOKUPS_KV: lookups }, COVERAGE_DAY);

    expect(lookupsGet).toHaveBeenCalledWith(`metrics:deadlinks:${COVERAGE_DAY}`, 'json');
    expect(lookups.put).not.toHaveBeenCalled();
    expect(lookups.delete).not.toHaveBeenCalled();
    expect(lookups.list).not.toHaveBeenCalled();

    const reportRows = await db
      .prepare(
        `SELECT day, with_tags, without_tags, with_naics, missing_naics, validation_issues, created_at
         FROM coverage_reports`
      )
      .all<{
        day: string;
        with_tags: number;
        without_tags: number;
        with_naics: number;
        missing_naics: number;
        validation_issues: string;
        created_at: number;
      }>();

    expect(reportRows.results).toHaveLength(1);
    const report = reportRows.results![0];
    expect(report.day).toBe(COVERAGE_DAY);
    expect(report.with_tags).toBe(1);
    expect(report.without_tags).toBe(1);
    expect(report.with_naics).toBe(1);
    expect(report.missing_naics).toBe(1);
    expect(report.created_at).toBe(COVERAGE_TIME.getTime());

    const parsedIssues = JSON.parse(report.validation_issues);
    expect(parsedIssues).toEqual([
      { issue: 'missing_summary', count: 1 },
      { issue: 'missing_url', count: 1 },
      { issue: 'missing_benefit_info', count: 1 },
      { issue: 'missing_start_date', count: 1 },
      { issue: 'expired', count: 1 },
      { issue: 'missing_naics', count: 1 },
      { issue: 'missing_tags', count: 1 }
    ]);

    const auditRows = await db
      .prepare(`SELECT program_id, issues, created_at FROM coverage_audit ORDER BY program_id`)
      .all<{ program_id: number; issues: string; created_at: number }>();
    expect(auditRows.results).toEqual([
      {
        program_id: 2,
        issues:
          '["missing_summary","missing_url","missing_benefit_info","missing_start_date","expired","missing_naics","missing_tags"]',
        created_at: COVERAGE_TIME.getTime()
      }
    ]);

    const statsRow = await db
      .prepare(
        `SELECT day, n_programs, fresh_sources, naics_density, deadlink_rate, created_at FROM daily_coverage_stats WHERE day = ?`
      )
      .bind(COVERAGE_DAY)
      .first<{
        day: string;
        n_programs: number;
        fresh_sources: number;
        naics_density: number;
        deadlink_rate: number;
        created_at: number;
      }>();

    expect(statsRow).toEqual({
      day: COVERAGE_DAY,
      n_programs: 2,
      fresh_sources: 1,
      naics_density: 0.5,
      deadlink_rate: 0.25,
      created_at: COVERAGE_TIME.getTime()
    });

    dateNowSpy.mockReturnValue(ENRICHMENT_TIME.getTime());
    await runEnrichmentBackfill({ DB: db, LOOKUPS_KV: lookups });

    const enrichedProgram = await db
      .prepare(`SELECT industry_codes, updated_at FROM programs WHERE id = 2`)
      .first<{ industry_codes: string | null; updated_at: number }>();
    expect(enrichedProgram?.industry_codes && JSON.parse(enrichedProgram.industry_codes)).toEqual(['333333']);
    expect(enrichedProgram?.updated_at).toBe(ENRICHMENT_TIME.getTime());

    const enrichedTags = await db
      .prepare(`SELECT tag FROM tags WHERE program_id = 2 ORDER BY tag`)
      .all<{ tag: string }>();
    expect(enrichedTags.results?.map((row) => row.tag)).toEqual(['manufacturing', 'widget-support']);

    dateNowSpy.mockReturnValue(COVERAGE_TIME.getTime());
    const response = await buildCoverageResponse({ DB: db });

    expect(response.tagCoverage).toEqual({ withTags: 1, withoutTags: 1 });
    expect(response.naicsCoverage).toEqual({ withNaics: 1, missingNaics: 1 });
    expect(response.validationIssues).toEqual([
      { issue: 'missing_summary', count: 1 },
      { issue: 'missing_url', count: 1 },
      { issue: 'missing_benefit_info', count: 1 },
      { issue: 'missing_start_date', count: 1 },
      { issue: 'expired', count: 1 },
      { issue: 'missing_naics', count: 1 },
      { issue: 'missing_tags', count: 1 }
    ]);

    expect(response.reports).toHaveLength(1);
    expect(response.reports[0]).toMatchObject({
      day: COVERAGE_DAY,
      tagCoverage: { withTags: 1, withoutTags: 1 },
      naicsCoverage: { withNaics: 1, missingNaics: 1 }
    });
    expect(response.reports[0].validationIssues).toEqual([
      { issue: 'missing_summary', count: 1 },
      { issue: 'missing_url', count: 1 },
      { issue: 'missing_benefit_info', count: 1 },
      { issue: 'missing_start_date', count: 1 },
      { issue: 'expired', count: 1 },
      { issue: 'missing_naics', count: 1 },
      { issue: 'missing_tags', count: 1 }
    ]);
  });
});
