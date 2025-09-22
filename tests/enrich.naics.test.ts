import { describe, it, expect } from 'vitest';
import type { KVNamespace } from '@cloudflare/workers-types';
import { enrichNaics } from '../apps/ingest/src/enrich';

const mockKV = (data: any) => ({
  async get(_key: string) {
    return data;
  }
}) as KVNamespace;

describe('enrichNaics', () => {
  it('assigns NAICS codes from lookup synonyms', async () => {
    const env = { LOOKUPS_KV: mockKV([{ code: '111110', synonyms: ['agriculture'] }]) };
    const program = {
      uid: 'p-test',
      title: 'Agriculture innovation grant',
      summary: 'Support for agriculture and farming co-ops',
      country_code: 'US',
      authority_level: 'state',
      jurisdiction_code: 'US-WA',
      status: 'open',
      industry_codes: [],
      benefits: [],
      criteria: [],
      tags: []
    } as any;
    const enriched = await enrichNaics(program, env);
    expect(enriched.industry_codes).toContain('111110');
  });

  it('falls back gracefully when KV missing', async () => {
    const program = {
      uid: 'p-test',
      title: 'Generic program',
      summary: 'No keywords',
      country_code: 'US',
      authority_level: 'state',
      jurisdiction_code: 'US-WA',
      status: 'open',
      industry_codes: ['999999'],
      benefits: [],
      criteria: [],
      tags: []
    } as any;
    const enriched = await enrichNaics(program, {});
    expect(enriched.industry_codes).toEqual(['999999']);
  });
});
