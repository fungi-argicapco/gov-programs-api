import type { Env } from './db';

export type SavedQuery = {
  id: number;
  api_key_id: number;
  name: string;
  query_json: string;
  created_at: number | null;
  updated_at: number | null;
};

export type AlertSubscription = {
  id: number;
  saved_query_id: number;
  sink: string;
  target: string;
  active: number;
  created_at: number | null;
  updated_at: number | null;
};

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

export async function createSavedQuery(env: Env, apiKeyId: number, data: { name: string; query_json: string }) {
  const ts = nowSeconds();
  const result = await env.DB.prepare(
    'INSERT INTO saved_queries (api_key_id, name, query_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
  )
    .bind(apiKeyId, data.name, data.query_json, ts, ts)
    .run();
  const id = Number(result.meta?.last_row_id ?? 0);
  return id;
}

export async function getSavedQuery(env: Env, apiKeyId: number, id: number) {
  const row = await env.DB.prepare(
    'SELECT id, api_key_id, name, query_json, created_at, updated_at FROM saved_queries WHERE id = ? AND api_key_id = ? LIMIT 1'
  )
    .bind(id, apiKeyId)
    .first<SavedQuery | null>();
  return row ?? null;
}

export async function deleteSavedQuery(env: Env, apiKeyId: number, id: number) {
  const result = await env.DB.prepare('DELETE FROM saved_queries WHERE id = ? AND api_key_id = ?')
    .bind(id, apiKeyId)
    .run();
  const changes = Number(result.meta?.changes ?? 0);
  return changes > 0;
}

export async function createAlertSubscription(
  env: Env,
  params: { saved_query_id: number; sink: string; target: string }
) {
  const ts = nowSeconds();
  const result = await env.DB.prepare(
    'INSERT INTO alert_subscriptions (saved_query_id, sink, target, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
  )
    .bind(params.saved_query_id, params.sink, params.target, ts, ts)
    .run();
  const id = Number(result.meta?.last_row_id ?? 0);
  return id;
}
