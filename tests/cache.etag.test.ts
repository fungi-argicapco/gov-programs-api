import { describe, expect, it, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { CACHE_CONTROL_VALUE, buildCacheKey, cacheGet, cachePut, computeEtag, etagMatches } from '../apps/api/src/cache';

const memoryStore = new Map<string, { response: Response; expiresAt: number }>();

function installCacheStub() {
  const stub = {
    async match(request: Request) {
      const entry = memoryStore.get(request.url);
      if (!entry) return undefined;
      if (entry.expiresAt <= Date.now()) {
        memoryStore.delete(request.url);
        return undefined;
      }
      return entry.response.clone();
    },
    async put(request: Request, response: Response) {
      const clone = response.clone();
      const cacheControl = clone.headers.get('Cache-Control') ?? '';
      const maxAgeMatch = cacheControl.match(/max-age=(\d+)/i);
      const maxAgeSeconds = maxAgeMatch ? Number(maxAgeMatch[1]) : 0;
      const expiresAt = Date.now() + maxAgeSeconds * 1000;
      memoryStore.set(request.url, { response: clone, expiresAt });
    },
  };
  (globalThis as any).caches = { default: stub };
}

function clearCacheStub() {
  memoryStore.clear();
}

describe('computeEtag', () => {
  beforeEach(() => {
    installCacheStub();
    clearCacheStub();
  });

  it('produces a stable hash for identical payloads', async () => {
    const payload = { data: ['one', 'two'] };
    const first = await computeEtag(payload, [1, 2], 123);
    const second = await computeEtag({ data: ['one', 'two'] }, [1, 2], 123);
    expect(first).toBe(second);
    const diffIds = await computeEtag(payload, [1, 3], 123);
    expect(diffIds).not.toBe(first);
    const diffUpdatedAt = await computeEtag(payload, [1, 2], 124);
    expect(diffUpdatedAt).not.toBe(first);
  });
});

describe('Cache API integration', () => {
  beforeEach(() => {
    installCacheStub();
    clearCacheStub();
  });

  it('serves cached responses with 304 handling', async () => {
    const app = new Hono();
    const generation = 42;

    app.get('/resource', async (c) => {
      const cacheKey = buildCacheKey(c.req.url);
      const ifNoneMatch = c.req.header('if-none-match');
      const cached = await cacheGet(c, cacheKey);
      if (cached) {
        const cachedEtag = cached.headers.get('ETag');
        if (cachedEtag && etagMatches(ifNoneMatch, cachedEtag)) {
          const headers = new Headers();
          headers.set('ETag', cachedEtag);
          headers.set('X-Cache', 'HIT');
          const cachedControl = cached.headers.get('Cache-Control');
          if (cachedControl) {
            headers.set('Cache-Control', cachedControl);
          }
          return new Response(null, { status: 304, headers });
        }
        return cached;
      }

      const payload = { data: ['alpha'], meta: { generation } };
      const etagValue = `"${await computeEtag(payload, [1], generation)}"`;

      if (etagMatches(ifNoneMatch, etagValue)) {
        const res304 = c.json(payload);
        res304.headers.set('ETag', etagValue);
        await cachePut(c, cacheKey, res304);
        const headers = new Headers({
          ETag: etagValue,
          'Cache-Control': res304.headers.get('Cache-Control') ?? CACHE_CONTROL_VALUE,
          'X-Cache': 'MISS',
        });
        return new Response(null, { status: 304, headers });
      }

      const res = c.json(payload);
      res.headers.set('ETag', etagValue);
      await cachePut(c, cacheKey, res);
      res.headers.set('X-Cache', 'MISS');
      return res;
    });

    const url = 'http://test.local/resource';
    const first = await app.fetch(new Request(url));
    expect(first.status).toBe(200);
    expect(first.headers.get('ETag')).toBeTruthy();
    expect(first.headers.get('X-Cache')).toBe('MISS');
    const etag = first.headers.get('ETag');
    expect(etag).toBeTruthy();

    const second = await app.fetch(
      new Request(url, {
        headers: {
          'If-None-Match': etag!,
        },
      })
    );
    expect(second.status).toBe(304);
    expect(second.headers.get('X-Cache')).toBe('HIT');
    expect(second.headers.get('ETag')).toBe(etag);

    const third = await app.fetch(new Request(url));
    expect(third.status).toBe(200);
    const cacheHeader = third.headers.get('X-Cache') ?? '';
    expect(cacheHeader.toUpperCase()).toMatch(/HIT|REVALIDATED/);
    expect(third.headers.get('ETag')).toBe(etag);
  });
});
