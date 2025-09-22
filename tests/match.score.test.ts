import { describe, it, expect } from 'vitest';
import { scoreProgram, type Profile, type Weights } from '../apps/api/src/match';

const weights: Weights = {
  jurisdiction: 30,
  industry: 25,
  timing: 20,
  size: 15,
  freshness: 10
};

const baseProfile: Profile = {
  country_code: 'US',
  jurisdiction_code: 'US-CA',
  naics: ['111110'],
  capex_cents: 100_000,
  start_date: '2024-01-01',
  end_date: '2024-12-31'
};

const now = Date.UTC(2024, 0, 1);

describe('scoreProgram', () => {
  it('awards high score for exact jurisdiction and NAICS overlap', () => {
    const score = scoreProgram(
      baseProfile,
      {
        id: 1,
        country_code: 'US',
        jurisdiction_code: 'US-CA',
        industry_codes: ['111110'],
        start_date: '2024-01-01',
        end_date: '2024-12-31',
        updated_at: now,
        benefits: [{ type: 'grant', max_amount_cents: 100_000, min_amount_cents: null, currency_code: 'USD', notes: null }],
        tags: []
      } as any,
      weights,
      { now }
    );
    expect(score).toBeGreaterThanOrEqual(95);
  });

  it('penalizes when jurisdiction does not match but country does', () => {
    const score = scoreProgram(
      baseProfile,
      {
        id: 2,
        country_code: 'US',
        jurisdiction_code: 'US-NY',
        industry_codes: ['111110'],
        start_date: '2024-01-01',
        end_date: '2024-12-31',
        updated_at: now,
        benefits: [{ type: 'grant', max_amount_cents: 100_000, min_amount_cents: null, currency_code: 'USD', notes: null }],
        tags: []
      } as any,
      weights,
      { now }
    );
    expect(score).toBeLessThan(90);
    expect(score).toBeGreaterThan(60);
  });

  it('drops timing component when windows do not overlap', () => {
    const score = scoreProgram(
      baseProfile,
      {
        id: 3,
        country_code: 'US',
        jurisdiction_code: 'US-CA',
        industry_codes: ['111110'],
        start_date: '2025-01-01',
        end_date: '2025-12-31',
        updated_at: now,
        benefits: [{ type: 'grant', max_amount_cents: 100_000, min_amount_cents: null, currency_code: 'USD', notes: null }],
        tags: []
      } as any,
      weights,
      { now }
    );
    expect(score).toBeLessThan(85);
  });

  it('reduces score for stale programs based on freshness decay', () => {
    const recent = scoreProgram(
      baseProfile,
      {
        id: 4,
        country_code: 'US',
        jurisdiction_code: 'US-CA',
        industry_codes: ['111110'],
        start_date: '2024-01-01',
        end_date: '2024-12-31',
        updated_at: now,
        benefits: [{ type: 'grant', max_amount_cents: 100_000, min_amount_cents: null, currency_code: 'USD', notes: null }],
        tags: []
      } as any,
      weights,
      { now }
    );
    const old = scoreProgram(
      baseProfile,
      {
        id: 5,
        country_code: 'US',
        jurisdiction_code: 'US-CA',
        industry_codes: ['111110'],
        start_date: '2024-01-01',
        end_date: '2024-12-31',
        updated_at: now - 200 * 24 * 60 * 60 * 1000,
        benefits: [{ type: 'grant', max_amount_cents: 100_000, min_amount_cents: null, currency_code: 'USD', notes: null }],
        tags: []
      } as any,
      weights,
      { now }
    );
    expect(old).toBeLessThan(recent);
  });
});
