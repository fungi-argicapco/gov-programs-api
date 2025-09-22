import { describe, it, expect } from 'vitest';
import { buildProgramsQuery } from '../apps/api/src/query';

describe('buildProgramsQuery', () => {
  it('builds FTS + filters', () => {
    const { sql, params } = buildProgramsQuery({
      q: 'battery AND grant', country: 'US', jurisdiction: 'US-WA',
      industry: ['334'], benefitType: ['grant'], status: ['open'],
      from: '2025-01-01', to: '2025-12-31', sort: '-updated_at', limit: 25, offset: 0
    });
    expect(sql).toMatch(/programs_fts/);
    expect(params.length).toBeGreaterThan(0);
  });
});
