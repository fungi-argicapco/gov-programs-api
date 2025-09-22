import { describe, expect, test, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { Miniflare } from 'miniflare';
import app from './index';
import { createDb, programs, programCriteria, programTags, tags } from '@db';

const migrationSql = readFileSync(new URL('../../../packages/db/migrations/0001_initial.sql', import.meta.url), 'utf8');

const programId = '11111111-1111-1111-1111-111111111111';
const programIdTwo = '22222222-2222-2222-2222-222222222222';

const applyMigrations = async (d1: D1Database) => {
  const statements = migrationSql
    .split(/;\s*(?:\r?\n|$)/)
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0 && !/^begin/i.test(statement) && !/^commit/i.test(statement));
  for (const statement of statements) {
    const normalized = statement.replace(/\s+/g, ' ').trim();
    const sqlStatement = normalized.endsWith(';') ? normalized : `${normalized};`;
    await d1.exec(sqlStatement);
  }
};

const setupDatabase = async () => {
  const mf = new Miniflare({
    modules: true,
    compatibilityDate: '2024-01-01',
    script: 'export default {}',
    d1Databases: {
      DB: 'test-db'
    }
  });
  const d1 = await mf.getD1Database('DB');
  await applyMigrations(d1);
  const db = createDb(d1);
  await db.insert(programs).values([
    {
      id: programId,
      title: 'California Green Grants',
      summary: 'Funding for clean energy projects.',
      stateCode: 'CA',
      industries: JSON.stringify(['22', '54']),
      status: 'open',
      benefitType: 'grant',
      websiteUrl: 'https://example.com/grants',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: programIdTwo,
      title: 'Nevada Manufacturing Credit',
      summary: 'Tax credit for advanced manufacturing.',
      stateCode: 'NV',
      industries: JSON.stringify(['31']),
      status: 'scheduled',
      benefitType: 'tax_credit',
      websiteUrl: 'https://example.com/credits',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ]);

  await db.insert(tags).values([
    { id: 'tag-energy', slug: 'energy', label: 'Energy', description: null },
    { id: 'tag-manufacturing', slug: 'manufacturing', label: 'Manufacturing', description: null }
  ]);

  await db.insert(programTags).values([
    { programId, tagId: 'tag-energy' },
    { programId: programIdTwo, tagId: 'tag-manufacturing' }
  ]);

  await db.insert(programCriteria).values([
    {
      id: 'crit-1',
      programId,
      category: 'eligibility',
      label: 'Must operate in California',
      value: 'Yes',
      notes: null,
      position: 0
    },
    {
      id: 'crit-2',
      programId,
      category: 'award',
      label: 'Maximum award',
      value: '$100,000',
      notes: null,
      position: 1
    }
  ]);

  await d1.prepare('INSERT INTO programs_fts (program_id, title, summary, tags, criteria) VALUES (?1, ?2, ?3, ?4, ?5)')
    .bind(programId, 'California Green Grants', 'Funding for clean energy projects.', 'Energy', 'Must operate in California $100,000')
    .run();
  await d1.prepare('INSERT INTO programs_fts (program_id, title, summary, tags, criteria) VALUES (?1, ?2, ?3, ?4, ?5)')
    .bind(programIdTwo, 'Nevada Manufacturing Credit', 'Tax credit for advanced manufacturing.', 'Manufacturing', 'Manufacturing investments')
    .run();

  return { d1, mf };
};

let database: D1Database;
let mf: Miniflare | undefined;

beforeAll(async () => {
  const result = await setupDatabase();
  database = result.d1;
  mf = result.mf;
});

afterAll(async () => {
  if (mf) {
    await mf.dispose();
  }
});

describe('GET /v1/programs', () => {
  test('returns paginated programs with metadata', async () => {
    const response = await app.fetch(new Request('http://localhost/v1/programs?state=CA'), { DB: database });
    expect(response.status).toBe(200);
    const json = await response.json<any>();
    expect(json.data).toHaveLength(1);
    expect(json.data[0].id).toBe(programId);
    expect(json.meta.total).toBe(1);
  });

  test('filters by full-text search', async () => {
    const response = await app.fetch(new Request('http://localhost/v1/programs?q=Manufacturing'), { DB: database });
    const json = await response.json<any>();
    expect(json.data).toHaveLength(1);
    expect(json.data[0].id).toBe(programIdTwo);
  });
});

describe('GET /v1/programs/:id', () => {
  test('returns a single program with criteria and tags', async () => {
    const response = await app.fetch(new Request(`http://localhost/v1/programs/${programId}`), { DB: database });
    expect(response.status).toBe(200);
    const json = await response.json<any>();
    expect(json.id).toBe(programId);
    expect(json.criteria).toHaveLength(2);
    expect(json.tags).toHaveLength(1);
  });

  test('responds with 404 when not found', async () => {
    const response = await app.fetch(new Request('http://localhost/v1/programs/not-found'), { DB: database });
    expect(response.status).toBe(404);
  });
});

describe('GET /v1/stats/coverage', () => {
  test('returns aggregated stats', async () => {
    const response = await app.fetch(new Request('http://localhost/v1/stats/coverage'), { DB: database });
    const json = await response.json<any>();
    expect(json.byState.find((row: any) => row.state === 'CA')).toBeTruthy();
    expect(json.byBenefit.find((row: any) => row.benefitType === 'grant')).toBeTruthy();
  });
});

describe('GET /v1/sources', () => {
  test('returns distinct sources even if missing data', async () => {
    const response = await app.fetch(new Request('http://localhost/v1/sources'), { DB: database });
    const json = await response.json<any>();
    expect(json.data).toBeInstanceOf(Array);
  });
});
