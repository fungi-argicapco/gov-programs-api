import type { MiddlewareHandler } from 'hono';
import { apiError } from './errors';

const RATE_LIMIT = 60;
const WINDOW_MS = 60_000;

type Bucket = {
  tokens: number;
  lastRefill: number;
};

const buckets = new Map<string, Bucket>();

function refillBucket(bucket: Bucket, now: number) {
  const elapsed = now - bucket.lastRefill;
  if (elapsed <= 0) return bucket;
  const refillTokens = (elapsed / WINDOW_MS) * RATE_LIMIT;
  const tokens = Math.min(RATE_LIMIT, bucket.tokens + refillTokens);
  return { tokens, lastRefill: now };
}

export const mwRate: MiddlewareHandler = async (c, next) => {
  if (typeof (globalThis as any).Bun === 'undefined') {
    return next();
  }

  const now = Date.now();
  const key = c.req.header('x-api-key') || 'anon';
  const bucket = buckets.get(key) ?? { tokens: RATE_LIMIT, lastRefill: now };
  const refilled = refillBucket(bucket, now);
  if (refilled.tokens < 1) {
    buckets.set(key, refilled);
    return apiError(c, 429, 'rate_limited', 'Rate limit exceeded.');
  }

  buckets.set(key, { tokens: refilled.tokens - 1, lastRefill: refilled.lastRefill });
  await next();
};
