import { describe, expect, it } from 'vitest';

import { isDeadlinkMetricsRecord } from './precompute.coverage';

describe('isDeadlinkMetricsRecord', () => {
  it('accepts a valid metrics record', () => {
    const record = {
      rate: 0.25,
      n: 4,
      bad: [
        { id: 1, url: 'https://example.com/1' },
        { id: 2, url: 'https://example.com/2' },
      ],
    };

    expect(isDeadlinkMetricsRecord(record)).toBe(true);
  });

  it('rejects non-finite rates', () => {
    const record = { rate: Number.NaN, n: 2, bad: [] };
    expect(isDeadlinkMetricsRecord(record)).toBe(false);
  });

  it('rejects malformed bad entries', () => {
    const record = { rate: 0.1, n: 1, bad: [{ id: 'nope', url: 1 }] };
    expect(isDeadlinkMetricsRecord(record)).toBe(false);
  });
});
