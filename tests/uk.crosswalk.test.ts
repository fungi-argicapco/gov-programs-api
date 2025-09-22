import { describe, it, expect } from 'vitest';
import { loadSicNaics, mapSicToNaics } from '@common/lookups';

describe('UK SIC to NAICS crosswalk', () => {
  it('loads sample crosswalk when KV is unavailable', async () => {
    const lookup = await loadSicNaics({} as any);
    expect(lookup['01110']).toEqual(['111110']);
  });

  it('maps SIC codes to unique NAICS codes', async () => {
    const codes = await mapSicToNaics({} as any, ['01110', '01234', '01110']);
    expect(codes).toContain('111110');
    expect(codes).toContain('111120');
    expect(codes).toContain('111130');
    const unique = new Set(codes);
    expect(unique.size).toBe(codes.length);
  });
});
