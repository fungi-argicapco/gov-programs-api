import type { D1Database } from '@cloudflare/workers-types';

type IngestEnv = {
  DB: D1Database;
  LOOKUPS_KV?: KVNamespace;

  ALERTS_MAX_DELIVERY_ATTEMPTS?: string;
};

export const DEFAULT_MAX_DELIVERY_ATTEMPTS = 10;

async function loadSigningSecret(env: IngestEnv): Promise<string> {
  if (env.LOOKUPS_KV) {
    try {
      const value = await env.LOOKUPS_KV.get('alerts:signing_secret');
      if (value) return value;
    } catch (err) {
      console.warn('alerts_secret_lookup_failed', err);
    }
  }
  return 'test-secret';
}

async function signPayload(secret: string, payload: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  const bytes = new Uint8Array(signature);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function runOutbox(
  env: IngestEnv,
  opts?: { fetchImpl?: typeof fetch; now?: number; maxAttempts?: number }
): Promise<void> {
  const fetchImpl = opts?.fetchImpl ?? fetch;
  const now = opts?.now ?? Date.now();
  const envMax = Number(env.ALERTS_MAX_DELIVERY_ATTEMPTS);
  const maxAttempts = opts?.maxAttempts
    ?? (Number.isFinite(envMax) && envMax > 0 ? Math.floor(envMax) : DEFAULT_MAX_DELIVERY_ATTEMPTS);
  const secret = await loadSigningSecret(env);
  const queued = await env.DB.prepare(
    `SELECT id, subscription_id, payload_json, attempts FROM alert_outbox WHERE status = 'queued' ORDER BY queued_at ASC LIMIT 50`
  ).all<{ id: number; subscription_id: number; payload_json: string; attempts: number }>();
  const rows = queued.results ?? [];
  if (!rows.length) return;

  for (const row of rows) {
    const subscription = await env.DB.prepare(
      `SELECT id, sink, target, active FROM alert_subscriptions WHERE id = ?`
    )
      .bind(row.subscription_id)
      .first<{ id: number; sink: string; target: string; active: number }>();
    if (!subscription || subscription.active === 0) {
      await env.DB.prepare(`UPDATE alert_outbox SET status = 'error' WHERE id = ?`).bind(row.id).run();
      continue;
    }
    if (subscription.sink !== 'webhook') {
      await env.DB.prepare(`UPDATE alert_outbox SET status = 'error' WHERE id = ?`).bind(row.id).run();
      continue;
    }
    const payload = row.payload_json ?? '';
    const signature = await signPayload(secret, payload);
    let status = 'queued';
    let attempts = Number(row.attempts ?? 0) + 1;
    let deliveredAt: number | null = null;
    try {
      const response = await fetchImpl(subscription.target, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-signature': signature
        },
        body: payload
      });
      if (response.status >= 200 && response.status < 300) {
        status = 'ok';
        deliveredAt = now;
      } else {
        status = attempts >= maxAttempts ? 'error' : 'queued';
      }
    } catch (err) {
      console.warn('alerts_outbox_delivery_error', err);
      status = attempts >= maxAttempts ? 'error' : 'queued';
    }
    await env.DB.prepare(
      `UPDATE alert_outbox SET status = ?, attempts = ?, delivered_at = ? WHERE id = ?`
    )
      .bind(status, attempts, deliveredAt, row.id)
      .run();
  }
}
