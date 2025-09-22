import type { MiddlewareHandler } from 'hono';
import type { D1Database } from '@cloudflare/workers-types';
import type { Env } from './db';

type Role = 'admin' | 'partner' | 'read';

export type AuthInfo = {
  apiKeyId: number;
  role: Role;
  quotaDaily: number | null;
  quotaMonthly: number | null;
};

export type AuthVariables = {
  auth?: AuthInfo;
};

const encoder = new TextEncoder();

async function hashKey(rawKey: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(rawKey));
  const hashArray = Array.from(new Uint8Array(digest));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

function getUtcDayStart(now: Date): number {
  return Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 1000);
}

function getUtcMonthStart(now: Date): number {
  return Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) / 1000);
}

async function fetchUsage(env: Env, apiKeyId: number, startTs: number) {
  const row = await env.DB.prepare(
    'SELECT COALESCE(SUM(cost), 0) as total FROM usage_events WHERE api_key_id = ? AND ts >= ?'
  )
    .bind(apiKeyId, startTs)
    .first<{ total: number | null }>();
  return Number(row?.total ?? 0);
}

export const mwAuth: MiddlewareHandler<{ Bindings: Env; Variables: AuthVariables }> = async (c, next) => {
  const apiKey = c.req.header('x-api-key');
  if (!apiKey) {
    return c.json({ error: 'missing_api_key' }, 401);
  }

  const keyHash = await hashKey(apiKey);
  const record = await c.env.DB.prepare(
    'SELECT id, role, quota_daily, quota_monthly FROM api_keys WHERE key_hash = ? LIMIT 1'
  )
    .bind(keyHash)
    .first<{ id: number; role: Role; quota_daily: number | null; quota_monthly: number | null }>();

  if (!record) {
    return c.json({ error: 'forbidden' }, 403);
  }

  const now = new Date();
  const nowSeconds = Math.floor(now.getTime() / 1000);
  const dayStart = getUtcDayStart(now);
  const monthStart = getUtcMonthStart(now);

  const [dayUsage, monthUsage] = await Promise.all([
    fetchUsage(c.env, record.id, dayStart),
    fetchUsage(c.env, record.id, monthStart)
  ]);

  if (typeof record.quota_daily === 'number' && dayUsage >= record.quota_daily) {
    return c.json({ error: 'quota_exceeded', scope: 'daily' }, 429);
  }

  if (typeof record.quota_monthly === 'number' && monthUsage >= record.quota_monthly) {
    return c.json({ error: 'quota_exceeded', scope: 'monthly' }, 429);
  }

  await Promise.all([
    c.env.DB.prepare(
      'INSERT INTO usage_events (api_key_id, ts, route, cost) VALUES (?, ?, ?, 1)'
    )
      .bind(record.id, nowSeconds, c.req.path)
      .run(),
    c.env.DB.prepare('UPDATE api_keys SET last_seen_at = ? WHERE id = ?')
      .bind(nowSeconds, record.id)
      .run()
  ]);

  c.set('auth', {
    apiKeyId: record.id,
    role: record.role,
    quotaDaily: record.quota_daily ?? null,
    quotaMonthly: record.quota_monthly ?? null
  });

  await next();
};

export async function upsertDevApiKey(
  db: D1Database,
  params: {
    rawKey: string;
    role?: Role;
    name?: string;
    quotaDaily?: number | null;
    quotaMonthly?: number | null;
  }
) {
  const { rawKey, role = 'admin', name = 'dev', quotaDaily = null, quotaMonthly = null } = params;
  const keyHash = await hashKey(rawKey);
  const nowSeconds = Math.floor(Date.now() / 1000);
  await db
    .prepare(
      `INSERT INTO api_keys (key_hash, role, name, quota_daily, quota_monthly, created_at, updated_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(key_hash) DO UPDATE SET
         role = excluded.role,
         name = excluded.name,
         quota_daily = excluded.quota_daily,
         quota_monthly = excluded.quota_monthly,
         updated_at = excluded.updated_at`
    )
    .bind(keyHash, role, name, quotaDaily, quotaMonthly, nowSeconds, nowSeconds, nowSeconds)
    .run();
}

export { hashKey };
