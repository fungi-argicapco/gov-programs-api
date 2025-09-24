import { describe, it, expect } from 'vitest';
import app from '../apps/api/src/index';
import { createTestDB } from './helpers/d1';
import { rerank, textSim, type LtrWeights } from '@ml';

describe('ltr reranker', () => {
  it('prioritises candidates with closer jurisdiction and industry matches', async () => {
    const db = createTestDB();
    await db.exec(`
      CREATE TABLE programs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uid TEXT NOT NULL,
        country_code TEXT NOT NULL,
        authority_level TEXT NOT NULL,
        jurisdiction_code TEXT NOT NULL,
        title TEXT NOT NULL,
        summary TEXT,
        industry_codes TEXT,
        start_date TEXT,
        end_date TEXT,
        updated_at INTEGER
      );
    `);
    const now = Date.now();
    await db.exec(`
      INSERT INTO programs (uid, country_code, authority_level, jurisdiction_code, title, summary, industry_codes, start_date, end_date, updated_at)
      VALUES
        ('p-1', 'US', 'state', 'US-CA', 'Electric Vehicle Infrastructure Grant', 'Supports electric vehicle fleets for car programs.', '["3361"]', NULL, NULL, ${now}),
        ('p-2', 'US', 'state', 'US-OR', 'Electric Vehicle Pilot Grant', 'Pilot program for electric vehicles.', '["3361"]', NULL, NULL, ${now - 1000}),
        ('p-3', 'US', 'state', 'US-CA', 'Clean Energy Equipment Grant', 'Supports solar upgrades.', '["2211"]', NULL, NULL, ${now - 2000});
    `);

    const rows = (await db.prepare('SELECT * FROM programs ORDER BY id').all<any>()).results;
    const weights: LtrWeights = { bias: 0, w_jur: 0.7, w_ind: 0.6, w_time: 0.5, w_size: 0.3, w_fresh: 0.2, w_text: 0.8 };
    const synonyms = { car: ['vehicle'] };
    const ranked = rerank(
      rows.map((row) => ({
        row,
        feats: {
          jur: row.jurisdiction_code === 'US-CA' ? 1 : 0,
          ind: row.industry_codes?.includes('3361') ? 1 : 0,
          time: 0.5,
          size: 0.5,
          fresh: 0.8,
          text: textSim('car grant', row.title, row.summary ?? undefined, synonyms)
        }
      })),
      weights
    );
    expect(ranked[0].row.uid).toBe('p-1');
    expect(ranked[0].reasons.jur).toBeCloseTo(weights.w_jur, 5);
    expect(ranked[1].row.uid).toBe('p-2');
  });

  it('reorders /v1/programs with rank=ltr when synonyms expand the query', async () => {
    const schema = `
      CREATE TABLE programs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uid TEXT NOT NULL,
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
        created_at INTEGER,
        updated_at INTEGER
      );
      CREATE TABLE benefits (id INTEGER PRIMARY KEY AUTOINCREMENT, program_id INTEGER, type TEXT, min_amount_cents INTEGER, max_amount_cents INTEGER, currency_code TEXT, notes TEXT);
      CREATE TABLE criteria (id INTEGER PRIMARY KEY AUTOINCREMENT, program_id INTEGER, kind TEXT, operator TEXT, value TEXT);
      CREATE TABLE tags (id INTEGER PRIMARY KEY AUTOINCREMENT, program_id INTEGER, tag TEXT);
      CREATE VIRTUAL TABLE programs_fts USING fts5(title, summary, content='programs', content_rowid='id', tokenize='unicode61');
      CREATE TRIGGER programs_ai AFTER INSERT ON programs BEGIN
        INSERT INTO programs_fts(rowid, title, summary) VALUES (new.id, new.title, new.summary);
      END;
      CREATE TRIGGER programs_ad AFTER DELETE ON programs BEGIN
        DELETE FROM programs_fts WHERE rowid = old.id;
      END;
      CREATE TRIGGER programs_au AFTER UPDATE ON programs BEGIN
        INSERT INTO programs_fts(programs_fts, rowid, title, summary) VALUES('delete', old.id, old.title, old.summary);
        INSERT INTO programs_fts(rowid, title, summary) VALUES (new.id, new.title, new.summary);
      END;
    `;
    const db = createTestDB();
    await db.exec(schema);

    const now = Date.now();
    await db.exec(`
      INSERT INTO programs (uid, country_code, authority_level, jurisdiction_code, title, summary, benefit_type, status, industry_codes, created_at, updated_at)
      VALUES
        ('veh-1', 'US', 'state', 'US-CA', 'Electric Vehicle Infrastructure Grant', 'Supports electric vehicle fleets for car programs.', 'grant', 'open', '["3361"]', ${now - 2000}, ${now}),
        ('veh-2', 'US', 'state', 'US-CA', 'Electric Car Infrastructure Grant', 'Supports electric car fleets for public transit.', 'grant', 'open', '["3361"]', ${now - 4000}, ${now - 60000});
    `);

    const kvData = new Map<string, any>([
      ['syn:terms', [['car', 'vehicle']]]
    ]);
    const env: any = {
      DB: db,
      LOOKUPS_KV: {
        async get(key: string, type?: 'text' | 'json' | 'arrayBuffer'): Promise<any> {
          if (type === 'json') {
            return kvData.get(key) ?? null;
          }
          return null;
        }
      }
    };

    const baseRes = await app.fetch(
      new Request('http://localhost/v1/programs?q=car%20grant&country=US&page_size=2'),
      env
    );
    const baseJson = await baseRes.json<any>();
    expect(baseJson.data[0].title).toContain('Vehicle');

    const ltrRes = await app.fetch(
      new Request('http://localhost/v1/programs?q=car%20grant&country=US&page_size=2&rank=ltr'),
      env
    );
    const ltrJson = await ltrRes.json<any>();
    expect(ltrJson.meta.ranking).toBe('ltr');
    expect(ltrJson.data[0].title).toContain('Car');
    expect(ltrJson.data[0].id).not.toBe(baseJson.data[0].id);
  });
});
