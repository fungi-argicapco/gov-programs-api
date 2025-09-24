import { beforeEach, describe, expect, it } from 'vitest';
import app from '../apps/api/src/index';

const noopCache = {
  async match() {
    return undefined;
  },
  async put() {
    return undefined;
  },
};

describe('API error envelope', () => {
  beforeEach(() => {
    (globalThis as any).caches = { default: noopCache };
  });

  it('returns the standardized error body for missing programs', async () => {
    const env = {
      DB: {
        prepare: () => ({
          bind: () => ({
            first: async () => null,
            all: async () => ({ results: [] }),
          }),
          first: async () => null,
          all: async () => ({ results: [] }),
        }),
      },
    };

    const response = await app.fetch(new Request('http://test.local/v1/programs/does-not-exist'), env as any);
    expect(response.status).toBe(404);
    expect(response.headers.get('Cache-Control')).toBe('no-store');

    const body = await response.json();
    expect(body).toEqual({
      error: {
        code: 'not_found',
        message: 'Requested resource was not found.',
        details: null,
      },
    });
  });
});
