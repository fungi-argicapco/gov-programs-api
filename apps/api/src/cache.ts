import type { Context } from 'hono';

const encoder = new TextEncoder();

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => normalize(entry));
  }
  if (value && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const normalized: Record<string, unknown> = {};
    const keys = Object.keys(source).sort();
    for (const key of keys) {
      normalized[key] = normalize(source[key]);
    }
    return normalized;
  }
  return value;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(normalize(value));
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(input));
  const bytes = new Uint8Array(digest);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function buildCacheKey(reqUrl: string): string {
  const url = new URL(reqUrl);
  const params = new URLSearchParams(url.search);
  const entries = Array.from(params.entries()).sort(([aKey, aVal], [bKey, bVal]) => {
    if (aKey === bKey) {
      return aVal.localeCompare(bVal);
    }
    return aKey.localeCompare(bKey);
  });
  const normalized = new URLSearchParams();
  for (const [key, value] of entries) {
    normalized.append(key, value);
  }
  const search = normalized.toString();
  url.search = search ? `?${search}` : '';
  url.hash = '';
  return url.toString();
}

export async function computeEtag(
  payload: unknown,
  ids?: number[] | null,
  maxUpdatedAt?: number | null
): Promise<string> {
  const body = stableStringify({
    q: payload,
    ids: ids ?? null,
    maxUpdatedAt: maxUpdatedAt ?? null,
  });
  return sha256Hex(body);
}

export async function cacheGet(_c: Context, key: string): Promise<Response | null> {
  const cacheStorage = (globalThis as any).caches?.default as Cache | undefined;
  if (!cacheStorage) {
    return null;
  }
  const cached = await cacheStorage.match(new Request(key, { method: 'GET' }));
  if (!cached) {
    return null;
  }
  const res = new Response(cached.body, cached);
  res.headers.set('X-Cache', 'HIT');
  return res;
}

export async function cachePut(
  _c: Context,
  key: string,
  res: Response,
  ttlSeconds = 60
): Promise<void> {
  const maxAge = Math.max(0, Math.floor(ttlSeconds));
  const sMaxAge = Math.max(maxAge, maxAge * 5);
  const cacheControl = `public, max-age=${maxAge}, s-maxage=${sMaxAge}`;
  res.headers.set('Cache-Control', cacheControl);
  const cacheStorage = (globalThis as any).caches?.default as Cache | undefined;
  if (!cacheStorage) {
    return;
  }
  const request = new Request(key, { method: 'GET' });
  const clone = res.clone();
  clone.headers.set('Cache-Control', cacheControl);
  await cacheStorage.put(request, clone);
}
