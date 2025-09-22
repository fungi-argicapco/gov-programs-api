import { describe, it, expect } from 'vitest';
import { suggestStack, type Profile, type ProgramRecord } from '../apps/api/src/match';

const profile: Profile = {
  country_code: 'US',
  jurisdiction_code: 'US-CA',
  naics: [],
  capex_cents: 400_000
};

const baseProgram = {
  authority_level: 'state',
  title: 'Program',
  summary: null,
  benefit_type: 'grant',
  status: 'open',
  url: null,
  criteria: []
};

const benefit = (amount: number) => ({
  type: 'grant',
  max_amount_cents: amount,
  min_amount_cents: null,
  currency_code: 'USD',
  notes: null
});

describe('suggestStack', () => {
  it('respects exclusions, cap percentages, and capex limit', async () => {
    const programs: ProgramRecord[] = [
      {
        id: 1,
        uid: 'A',
        country_code: 'US',
        jurisdiction_code: 'US-CA',
        industry_codes: [],
        start_date: null,
        end_date: null,
        updated_at: Date.now(),
        benefits: [benefit(200_000)] as any,
        tags: [],
        score: 90,
        ...baseProgram
      } as any,
      {
        id: 2,
        uid: 'B',
        country_code: 'US',
        jurisdiction_code: 'US-CA',
        industry_codes: [],
        start_date: null,
        end_date: null,
        updated_at: Date.now(),
        benefits: [benefit(150_000)] as any,
        tags: ['exclude:SOLO'],
        score: 85,
        ...baseProgram
      } as any,
      {
        id: 3,
        uid: 'C',
        country_code: 'US',
        jurisdiction_code: 'US-CA',
        industry_codes: [],
        start_date: null,
        end_date: null,
        updated_at: Date.now(),
        benefits: [benefit(150_000)] as any,
        tags: ['SOLO'],
        score: 80,
        ...baseProgram
      } as any,
      {
        id: 4,
        uid: 'D',
        country_code: 'US',
        jurisdiction_code: 'US-CA',
        industry_codes: [],
        start_date: null,
        end_date: null,
        updated_at: Date.now(),
        benefits: [benefit(400_000)] as any,
        tags: ['cap:max:50%'],
        score: 70,
        ...baseProgram
      } as any
    ];

    const result = await suggestStack(profile, programs, { fxRates: { USD: 1 } });

    expect(result.selected.map((p) => p.id)).toEqual([1, 2, 4]);
    const ids = result.selected.map((p) => p.id);
    expect(ids).not.toContain(3);
    const limited = result.selected.find((p) => p.id === 4);
    expect(limited?.stack_value_usd).toBeCloseTo(500, 5);
    expect(result.value_usd).toBeCloseTo(4000, 5);
    expect(result.coverage_ratio).toBeCloseTo(1, 5);
    expect(result.constraints_hit).toContain('excluded:SOLO');
    expect(result.constraints_hit).toContain('cap:max:50%');
  });

  it('skips programs with duplicate ids or uids', async () => {
    const programs: ProgramRecord[] = [
      {
        id: 10,
        uid: 'DUP',
        source_id: 401,
        country_code: 'US',
        jurisdiction_code: 'US-CA',
        industry_codes: [],
        start_date: null,
        end_date: null,
        updated_at: Date.now(),
        benefits: [benefit(200_000)] as any,
        tags: [],
        score: 95,
        ...baseProgram
      } as any,
      {
        id: 10,
        uid: 'ALT',
        source_id: 402,
        country_code: 'US',
        jurisdiction_code: 'US-CA',
        industry_codes: [],
        start_date: null,
        end_date: null,
        updated_at: Date.now(),
        benefits: [benefit(150_000)] as any,
        tags: [],
        score: 80,
        ...baseProgram
      } as any,
      {
        id: 11,
        uid: 'DUP',
        source_id: 403,
        country_code: 'US',
        jurisdiction_code: 'US-CA',
        industry_codes: [],
        start_date: null,
        end_date: null,
        updated_at: Date.now(),
        benefits: [benefit(150_000)] as any,
        tags: [],
        score: 70,
        ...baseProgram
      } as any
    ];

    const result = await suggestStack(profile, programs, { fxRates: { USD: 1 } });

    expect(result.selected.map((p) => p.id)).toEqual([10]);
    expect(result.constraints_hit).toContain('duplicate_program:10');
    expect(result.constraints_hit).toContain('duplicate_uid:DUP');
  });
});
