import { describe, it, expect } from 'vitest';
import { normalizeToProgram } from '../apps/ingest/src/normalize';

describe('normalizeToProgram', () => {
  it('produces stable uid for same triple', async () => {
    const a = await normalizeToProgram({ authority_level:'state', jurisdiction_code:'US-WA', country_code:'US', title:'ABC', status:'open', industry_codes: [] });
    const b = await normalizeToProgram({ authority_level:'state', jurisdiction_code:'US-WA', country_code:'US', title:'ABC', status:'open', industry_codes: [] });
    expect(a.uid).toBe(b.uid);
  });
});
