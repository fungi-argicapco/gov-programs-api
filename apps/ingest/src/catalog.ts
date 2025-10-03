import { SOURCES, type SourceDef } from '../../../data/sources/phase2';
import {
  ingestHtmlTableGeneric,
  ingestJsonApiGeneric,
  ingestRssGeneric
} from './adapters';
import type { UpsertOutcome } from './upsert';
import {
  createConsoleMetricsAdapter,
  summarizeOutcomes,
  type MetricsAdapter,
  type RunDiffSummary,
  type RunStatus
} from './metrics';

type IngestEnv = {
  DB: D1Database;
  RAW_R2?: R2Bucket;
  LOOKUPS_KV?: KVNamespace;
  [key: string]: unknown;
};

type CatalogRunMetrics = {
  source: SourceDef;
  sourceRowId: number;
  runId: number | null;
  status: RunStatus;
  fetched: number;
  inserted: number;
  updated: number;
  unchanged: number;
  errors: number;
  durationMs: number;
  startedAt: number;
  endedAt: number;
  notes: string[];
  diffSummary: RunDiffSummary;
};

type RunCatalogOptions = {
  sourceIds?: string[];
  metricsAdapter?: MetricsAdapter;
};

type EnvRecord = Record<string, unknown>;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function lookupEnvValue(env: IngestEnv, key: string): string | undefined {
  const record = env as EnvRecord;
  const direct = record[key];
  if (typeof direct === 'string' && direct.trim() !== '') {
    return direct;
  }
  if (typeof direct === 'number' || typeof direct === 'boolean') {
    return String(direct);
  }
  if (typeof process !== 'undefined' && process.env) {
    const fallback = process.env[key];
    if (fallback && fallback.trim() !== '') {
      return fallback;
    }
  }
  return undefined;
}

function isEnvPlaceholder(candidate: unknown): candidate is { env: string } {
  return typeof candidate === 'object' && candidate !== null && 'env' in candidate;
}

function resolveRequestValue(value: unknown, env: IngestEnv): unknown {
  if (isEnvPlaceholder(value)) {
    const envKey = String((value as { env: string }).env);
    const resolved = lookupEnvValue(env, envKey);
    if (resolved === undefined) {
      throw new Error(`missing_env:${envKey}`);
    }
    return resolved;
  }
  if (typeof value === 'string') {
    const dynamic = resolveDynamicPlaceholder(value);
    if (dynamic !== null) {
      return dynamic;
    }
  }
  return value;
}

function resolveRequestBody(body: unknown, env: IngestEnv): unknown {
  if (Array.isArray(body)) {
    return body.map((item) => resolveRequestBody(item, env));
  }
  if (typeof body === 'object' && body !== null) {
    if (isEnvPlaceholder(body)) {
      return resolveRequestValue(body, env);
    }
    const entries = Object.entries(body as Record<string, unknown>).map(([key, value]) => [key, resolveRequestBody(value, env)]);
    return Object.fromEntries(entries);
  }
  return resolveRequestValue(body, env);
}

function formatDateMmDdYyyy(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  const year = date.getFullYear();
  return `${month}/${day}/${year}`;
}

function resolveDynamicPlaceholder(value: string): string | null {
  if (!value.startsWith('__') || !value.endsWith('__')) {
    return null;
  }
  if (value === '__TODAY__') {
    return formatDateMmDdYyyy(new Date());
  }
  const daysAgoMatch = /^__DAYS_AGO_(\d+)__$/.exec(value);
  if (daysAgoMatch) {
    const days = Number(daysAgoMatch[1]);
    if (Number.isFinite(days)) {
      const date = new Date();
      date.setDate(date.getDate() - days);
      return formatDateMmDdYyyy(date);
    }
  }
  return null;
}

function isMissingEnvError(error: unknown): error is Error {
  return error instanceof Error && typeof error.message === 'string' && error.message.startsWith('missing_env:');
}

function buildRequest(source: SourceDef, env: IngestEnv): { url: string; init: RequestInit } {
  const url = new URL(source.entrypoint);
  if (source.request?.query) {
    for (const [key, raw] of Object.entries(source.request.query)) {
      const resolved = resolveRequestValue(raw, env);
      if (resolved === undefined || resolved === null) {
        throw new Error(`missing_query:${key}`);
      }
      url.searchParams.set(key, String(resolved));
    }
  }

  const method = source.request?.method ?? 'GET';
  const headers = new Headers();
  headers.set('User-Agent', 'gov-programs-ingest/2.0 (+https://program.fungiagricap.com)');

  if (source.request?.headers) {
    for (const [key, raw] of Object.entries(source.request.headers)) {
      const resolved = resolveRequestValue(raw, env);
      if (resolved === undefined || resolved === null) {
        throw new Error(`missing_header:${key}`);
      }
      headers.set(key, String(resolved));
    }
  }

  const init: RequestInit = { method, headers, redirect: 'follow' };

  if (source.request?.body !== undefined && method !== 'GET') {
    const resolvedBody = resolveRequestBody(source.request.body, env);
    if (typeof resolvedBody === 'string') {
      init.body = resolvedBody;
    } else {
      if (!headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
      }
      init.body = JSON.stringify(resolvedBody);
    }
  }

  return { url: url.toString(), init };
}

async function ensureSource(env: IngestEnv, source: SourceDef): Promise<number> {
  const existing = await env.DB.prepare(`SELECT id FROM sources WHERE name = ? LIMIT 1`)
    .bind(source.id)
    .first<{ id: number }>()
    .catch(() => null);
  if (existing?.id) {
    await env.DB.prepare(
      `UPDATE sources SET url = ?, license = ?, tos_url = ?, authority_level = ?, jurisdiction_code = ? WHERE id = ?`
    )
      .bind(
        source.entrypoint,
        source.license ?? null,
        source.tosUrl ?? null,
        source.authority,
        source.jurisdiction,
        existing.id
      )
      .run();
    return existing.id;
  }
  const result = await env.DB.prepare(
    `INSERT INTO sources (name, url, license, tos_url, authority_level, jurisdiction_code) VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(
      source.id,
      source.entrypoint,
      source.license ?? null,
      source.tosUrl ?? null,
      source.authority,
      source.jurisdiction
    )
    .run();
  const insertedId = (result as any)?.meta?.last_row_id;
  if (typeof insertedId === 'number' && insertedId > 0) {
    return insertedId;
  }
  const row = await env.DB.prepare(`SELECT id FROM sources WHERE name = ? LIMIT 1`).bind(source.id).first<{ id: number }>();
  if (!row?.id) {
    throw new Error(`failed_to_ensure_source:${source.id}`);
  }
  return row.id;
}

function getDurableRateLimiter(env: IngestEnv) {
  const bindingName = (env as any).CF_DO_BINDING;
  if (!bindingName) return null;
  const binding = (env as any)[bindingName];
  if (!binding || typeof binding.idFromName !== 'function') return null;
  return binding as any;
}

type TokenBucketState = { tokens: number; updated: number };

async function consumeRate(env: IngestEnv, host: string, rate: { rps: number; burst: number }) {
  const durable = getDurableRateLimiter(env);
  if (durable) {
    try {
      const id = durable.idFromName(host);
      const stub = durable.get(id);
      const response = await stub.fetch('https://rate-limiter.consume', {
        method: 'POST',
        body: JSON.stringify({ host, rate })
      });
      if (response.status === 200) return;
      const retry = Number(response.headers.get('Retry-After')) * 1000 || 500;
      await sleep(retry);
      return consumeRate(env, host, rate);
    } catch {
      // Fallback to in-memory implementation below.
    }
  }
  const globalKey = '__rl__';
  const store: Map<string, TokenBucketState> = (globalThis as any)[globalKey] ?? new Map();
  if (!(globalKey in globalThis)) {
    (globalThis as any)[globalKey] = store;
  }
  while (true) {
    const now = Date.now();
    const state = store.get(host) ?? { tokens: rate.burst, updated: now };
    const elapsed = (now - state.updated) / 1000;
    const tokens = Math.min(rate.burst, state.tokens + elapsed * rate.rps);
    if (tokens >= 1) {
      state.tokens = tokens - 1;
      state.updated = now;
      store.set(host, state);
      return;
    }
    state.tokens = tokens;
    state.updated = now;
    store.set(host, state);
    const waitMs = Math.ceil(((1 - tokens) / rate.rps) * 1000);
    await sleep(Math.max(waitMs, 50));
  }
}

function snapshotKey(sourceId: string, at: Date): string {
  const year = at.getUTCFullYear();
  const month = String(at.getUTCMonth() + 1).padStart(2, '0');
  const day = String(at.getUTCDate()).padStart(2, '0');
  const hour = String(at.getUTCHours()).padStart(2, '0');
  const epoch = Math.floor(at.getTime() / 1000);
  return `${sourceId}/${year}/${month}/${day}/${hour}/${epoch}.json`;
}

async function writeSnapshot(env: IngestEnv, source: SourceDef, at: Date, body: string) {
  if (!env.RAW_R2) return;
  try {
    const key = snapshotKey(source.id, at);
    const contentType = source.kind === 'json' ? 'application/json' : source.kind === 'rss' ? 'application/xml' : 'text/html';
    await env.RAW_R2.put(key, body, { httpMetadata: { contentType } });
  } catch {
    // Ignore R2 errors to avoid blocking ingestion runs.
  }
}

function aggregate(outcomes: UpsertOutcome[]) {
  let inserted = 0;
  let updated = 0;
  let unchanged = 0;
  for (const outcome of outcomes) {
    if (outcome.status === 'inserted') inserted += 1;
    else if (outcome.status === 'updated') updated += 1;
    else unchanged += 1;
  }
  return { inserted, updated, unchanged };
}

function deriveFailureStatus({
  fetched,
  inserted,
  updated
}: {
  fetched: number;
  inserted: number;
  updated: number;
}): RunStatus {
  const fetchedAnyRecords = fetched > 0;
  const persistedAnyChanges = inserted > 0 || updated > 0;
  if (fetchedAnyRecords && persistedAnyChanges) {
    return 'partial';
  }
  return 'error';
}

export async function runCatalogOnce(
  env: IngestEnv,
  now: Date = new Date(),
  options: RunCatalogOptions = {}
): Promise<CatalogRunMetrics[]> {
  const metrics: CatalogRunMetrics[] = [];
  const adapter = options.metricsAdapter ?? createConsoleMetricsAdapter();
  const sources = options.sourceIds && options.sourceIds.length > 0
    ? SOURCES.filter((src) => options.sourceIds?.includes(src.id))
    : SOURCES;

  const emptySummary = () => summarizeOutcomes([]);

  for (const source of sources) {
    const startedAt = Date.now();
    let fetched = 0;
    let inserted = 0;
    let updated = 0;
    let unchanged = 0;
    let errors = 0;
    let status: RunStatus = 'ok';
    const notes: string[] = [];
    let diffSummary: RunDiffSummary = emptySummary();
    let runId: number | null = null;
    let sourceRowId = -1;

    try {
      sourceRowId = await ensureSource(env, source);
    } catch (err: any) {
      errors = 1;
      status = 'error';
      notes.push(`ensure_source_failed:${err?.message ?? String(err)}`);
      const endedAt = Date.now();
      const durationMs = Math.max(0, endedAt - startedAt);
      const event = {
        sourceId: source.id,
        sourceRowId,
        runId: null,
        status,
        startedAt,
        endedAt,
        durationMs,
        fetched,
        inserted,
        updated,
        unchanged,
        errors,
        notes: notes.slice(),
        diffSummary: emptySummary()
      } satisfies Parameters<NonNullable<MetricsAdapter['onRunComplete']>>[0];
      await adapter.onRunComplete?.(event);
      metrics.push({
        source,
        sourceRowId,
        runId: null,
        status,
        fetched,
        inserted,
        updated,
        unchanged,
        errors,
        durationMs,
        startedAt,
        endedAt,
        notes: notes.slice(),
        diffSummary: emptySummary()
      });
      continue;
    }

    try {
      const runInsert = await env.DB.prepare(
        `INSERT INTO ingestion_runs (source_id, started_at, ended_at, status, fetched, inserted, updated, unchanged, errors, message, notes, critical)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(sourceRowId, startedAt, startedAt, 'ok', 0, 0, 0, 0, 0, null, null, 0)
        .run();
      const insertedId = Number((runInsert as any)?.meta?.last_row_id ?? 0);
      if (Number.isFinite(insertedId) && insertedId > 0) {
        runId = insertedId;
      }
    } catch (err: any) {
      notes.push(`run_init_failed:${err?.message ?? String(err)}`);
    }

    await adapter.onRunStart?.({
      sourceId: source.id,
      sourceRowId,
      runId,
      startedAt
    });

    let outcomes: UpsertOutcome[] = [];

    try {
      let request: { url: string; init: RequestInit } | null = null;
      let syntheticData: unknown | null = null;
      let syntheticReason: string | null = null;

      try {
        request = buildRequest(source, env);
      } catch (error) {
        if (source.synthetic && isMissingEnvError(error)) {
          syntheticData = source.synthetic.data;
          syntheticReason = source.synthetic.reason;
        } else {
          throw error;
        }
      }

      if (syntheticData !== null) {
        const body = JSON.stringify(syntheticData);
        await writeSnapshot(env, source, new Date(startedAt), body);
        if (source.parser !== 'json_api_generic') {
          throw new Error('synthetic_data_unsupported_parser');
        }
        const result = await ingestJsonApiGeneric(env, {
          url: source.entrypoint,
          data: syntheticData,
          path: source.path,
          country: source.country,
          authority: source.authority,
          jurisdiction: source.jurisdiction,
          sourceId: sourceRowId,
          mapFn: source.mapFn,
          runId: runId ?? undefined
        });
        fetched = result.attempted;
        outcomes = result.outcomes;
        notes.push(`synthetic_data:${syntheticReason}`);
      } else if (request) {
        const { url, init } = request;
        await consumeRate(env, new URL(url).host, source.rate);
        const response = await fetch(url, init);
        if (!response.ok) {
          throw new Error(`http_${response.status}`);
        }
        const body = await response.text();
        await writeSnapshot(env, source, new Date(startedAt), body);

        switch (source.parser) {
          case 'json_api_generic': {
            const parsed = body.length ? JSON.parse(body) : {};
            const result = await ingestJsonApiGeneric(env, {
              url,
              data: parsed,
              path: source.path,
              country: source.country,
              authority: source.authority,
              jurisdiction: source.jurisdiction,
              sourceId: sourceRowId,
              mapFn: source.mapFn,
              runId: runId ?? undefined
            });
            fetched = result.attempted;
            outcomes = result.outcomes;
            break;
          }
          case 'rss_generic': {
            const result = await ingestRssGeneric(env, {
              url,
              feed: body,
              country: source.country,
              authority: source.authority,
              jurisdiction: source.jurisdiction,
              sourceId: sourceRowId,
              runId: runId ?? undefined
            });
            fetched = result.attempted;
            outcomes = result.outcomes;
            break;
          }
          case 'html_table_generic': {
            const result = await ingestHtmlTableGeneric(env, {
              url,
              html: body,
              tableSelector: 'table',
              columns: { title: 'td:first-child' },
              country: source.country,
              authority: source.authority,
              jurisdiction: source.jurisdiction,
              sourceId: sourceRowId,
              runId: runId ?? undefined
            });
            fetched = result.attempted;
            outcomes = result.outcomes;
            break;
          }
          default:
            throw new Error(`unsupported_parser:${source.parser}`);
        }
      }

      ({ inserted, updated, unchanged } = aggregate(outcomes));
      diffSummary = summarizeOutcomes(outcomes);
    } catch (err: any) {
      status = deriveFailureStatus({ fetched, inserted, updated });
      errors += 1;
      notes.push(`ingest_error:${err?.message ?? String(err)}`);
    }

    if (errors > 0 && status === 'ok') {
      status = deriveFailureStatus({ fetched, inserted, updated });
    }

    const endedAt = Date.now();
    const durationMs = Math.max(0, endedAt - startedAt);

    if (runId) {
      try {
        await env.DB.prepare(
          `UPDATE ingestion_runs
             SET ended_at = ?,
                 status = ?,
                 fetched = ?,
                 inserted = ?,
                 updated = ?,
                 unchanged = ?,
                 errors = ?,
                 message = ?,
                 notes = ?,
                 critical = ?
           WHERE id = ?`
        )
          .bind(
            endedAt,
            status,
            fetched,
            inserted,
            updated,
            unchanged,
            errors,
            notes[0] ?? null,
            notes.length > 0 ? JSON.stringify(notes) : null,
            diffSummary.criticalChanges > 0 ? 1 : 0,
            runId
          )
          .run();
      } catch (err: any) {
        notes.push(`run_update_failed:${err?.message ?? String(err)}`);
      }
    }

    const event = {
      sourceId: source.id,
      sourceRowId,
      runId,
      status,
      startedAt,
      endedAt,
      durationMs,
      fetched,
      inserted,
      updated,
      unchanged,
      errors,
      notes: notes.slice(),
      diffSummary
    } satisfies Parameters<NonNullable<MetricsAdapter['onRunComplete']>>[0];

    await adapter.onRunComplete?.(event);

    metrics.push({
      source,
      sourceRowId,
      runId,
      status,
      fetched,
      inserted,
      updated,
      unchanged,
      errors,
      durationMs,
      startedAt,
      endedAt,
      notes: notes.slice(),
      diffSummary
    });
  }

  return metrics;
}
