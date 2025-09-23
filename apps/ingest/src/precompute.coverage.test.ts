import { describe, expect, it } from 'vitest';

import { isDeadlinkMetrics } from './precompute.coverage';

describe('isDeadlinkMetrics', () => {
  it('accepts a valid metrics record', () => {
    const record = { rate: 0.25 };

    expect(isDeadlinkMetrics(record)).toBe(true);
  });

  it('rejects non-finite rates', () => {
    const record = { rate: Number.NaN };
    expect(isDeadlinkMetrics(record)).toBe(false);
  });

  it('rejects objects without a rate', () => {
    const record = { other: 42 };
    expect(isDeadlinkMetrics(record)).toBe(false);
  });
});
