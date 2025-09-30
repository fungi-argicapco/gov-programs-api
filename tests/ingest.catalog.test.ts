import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { runCatalogOnce } from '../apps/ingest/src/catalog';
import { createTestDB } from './helpers/d1';
import fs from 'node:fs';
import path from 'node:path';

const migrations = ['0001_init.sql', '0002_fts.sql', '0003_ingest_obs.sql'];

const readMigration = (name: string) =>
  fs.readFileSync(path.join(process.cwd(), 'migrations', name), 'utf-8');

describe('runCatalogOnce', () => {
  const responses = new Map<string, string>();
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    responses.clear();
    responses.set(
      'https://www.grants.gov/grantsws/rest/opportunities/search?filter=active&sortBy=closeDate',
      JSON.stringify({
        opportunities: [
          {
            OpportunityTitle: 'Test Grants.gov Program',
            Synopsis: 'Agriculture support for farms',
            PostDate: '2025-01-01',
            CloseDate: '2025-12-31',
            OpportunityNumber: 'TEST-123',
            Category: 'agriculture',
            eligibilityCategory: ['county governments']
          }
        ]
      })
    );
    responses.set(
      'https://sam.gov/api/prod/sgs/v1/search?index=assistancelisting&q=*&sort=-modifiedDate',
      JSON.stringify({
        searchResult: {
          searchResultItems: [
            {
              matchedObjectId: '12.345',
              matchedObjectDescriptor: {
                assistanceListingTitle: 'SAM Listing',
                assistanceListingNumber: '12.345',
                assistanceListingDescription: 'Energy upgrades',
                applicantTypes: ['state'],
                businessCategories: ['energy']
              }
            }
          ]
        }
      })
    );
    responses.set(
      'https://open.canada.ca/data/en/api/3/action/package_search?q=assistance%20program&rows=100',
      JSON.stringify({
        result: {
          results: [
            {
              title: 'Canada Assistance',
              notes: 'Manufacturing support',
              resources: [{ url: 'https://open.canada.ca/program', format: 'HTML' }],
              tags: [{ name: 'manufacturing' }]
            }
          ]
        }
      })
    );
    responses.set(
      'https://data.ontario.ca/en/api/3/action/package_search?q=grant&rows=100',
      JSON.stringify({
        result: {
          results: [
            {
              title: 'Ontario Innovation',
              notes: 'Tech support',
              resources: [{ url: 'https://data.ontario.ca/program', format: 'HTML' }],
              tags: [{ name: 'tech' }]
            }
          ]
        }
      })
    );
    globalThis.fetch = vi.fn(async (url: RequestInfo) => {
      const body = responses.get(String(url));
      if (!body) {
        return new Response('not found', { status: 404 });
      }
      return new Response(body, { status: 200 });
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('ingests catalog sources and records run metrics', async () => {
    const env = createTestDB();
    for (const file of migrations) {
      env.__db__.exec(readMigration(file));
    }

    const metrics = await runCatalogOnce({ DB: env } as any);
    expect(metrics.length).toBeGreaterThan(0);

    const runCount = await env.prepare('SELECT COUNT(*) as n FROM ingestion_runs').first<{ n: number }>();
    expect(Number(runCount?.n ?? 0)).toBe(metrics.length);

    const programCount = await env.prepare('SELECT COUNT(*) as n FROM programs').first<{ n: number }>();
    expect(Number(programCount?.n ?? 0)).toBeGreaterThan(0);

    const diffCount = await env.prepare('SELECT COUNT(*) as n FROM program_diffs').first<{ n: number }>();
    expect(Number(diffCount?.n ?? 0)).toBeGreaterThan(0);

    const insertedSum = await env.prepare('SELECT SUM(inserted) as n FROM ingestion_runs').first<{ n: number }>();
    expect(Number(insertedSum?.n ?? 0)).toBeGreaterThan(0);

    const sourceRows = await env
      .prepare('SELECT name, url, authority_level, jurisdiction_code FROM sources ORDER BY name')
      .all<{ name: string; url: string; authority_level: string; jurisdiction_code: string }>();
    expect(sourceRows.results.length).toBeGreaterThanOrEqual(4);
    expect(sourceRows.results[0]?.name).toBe('ca-fed-open-gov');
  });
});
