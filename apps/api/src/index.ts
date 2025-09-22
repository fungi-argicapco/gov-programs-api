import { Hono } from 'hono';
import { Env } from './db';
import { buildProgramsQuery } from './query';
import { listSourcesWithMetrics, buildCoverageResponse } from './coverage';
import { mwAuth, type AuthVariables } from './mw.auth';
import { mwRate } from './mw.rate';
import { createAlertSubscription, createSavedQuery, deleteSavedQuery, getSavedQuery } from './saved';
import { scoreProgramWithReasons, suggestStack, loadWeights, type Profile as MatchProfile, type ProgramRecord } from './match';
import { loadFxToUSD } from '@common/lookups';
import { getUtcDayStart, getUtcMonthStart } from './time';

const DEFAULT_MATCH_RESPONSE_LIMIT = 50;

const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

function parseIndustryCodes(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function fetchProgramRelations(env: Env, ids: number[]) {
  if (ids.length === 0) {
    return {
      benefits: new Map<number, any[]>(),
      criteria: new Map<number, any[]>(),
      tags: new Map<number, string[]>()
    };
  }
  const placeholders = ids.map(() => '?').join(',');
  const [benefits, criteria, tags] = await Promise.all([
    env.DB.prepare(`SELECT program_id, type, min_amount_cents, max_amount_cents, currency_code, notes FROM benefits WHERE program_id IN (${placeholders})`).bind(...ids).all<any>(),
    env.DB.prepare(`SELECT program_id, kind, operator, value FROM criteria WHERE program_id IN (${placeholders})`).bind(...ids).all<any>(),
    env.DB.prepare(`SELECT program_id, tag FROM tags WHERE program_id IN (${placeholders})`).bind(...ids).all<any>()
  ]);
  const benefitMap = new Map<number, any[]>();
  for (const row of benefits.results ?? []) {
    const list = benefitMap.get(row.program_id) ?? [];
    list.push({
      type: row.type,
      min_amount_cents: row.min_amount_cents ?? null,
      max_amount_cents: row.max_amount_cents ?? null,
      currency_code: row.currency_code ?? null,
      notes: row.notes ?? null
    });
    benefitMap.set(row.program_id, list);
  }
  const criteriaMap = new Map<number, any[]>();
  for (const row of criteria.results ?? []) {
    const list = criteriaMap.get(row.program_id) ?? [];
    list.push({ kind: row.kind, operator: row.operator, value: row.value });
    criteriaMap.set(row.program_id, list);
  }
  const tagMap = new Map<number, string[]>();
  for (const row of tags.results ?? []) {
    const list = tagMap.get(row.program_id) ?? [];
    list.push(row.tag);
    tagMap.set(row.program_id, list);
  }
  return { benefits: benefitMap, criteria: criteriaMap, tags: tagMap };
}

function buildProgramForMatch(row: any, relations: {
  benefits: Map<number, any[]>;
  criteria: Map<number, any[]>;
  tags: Map<number, string[]>;
}): { programRecord: ProgramRecord; payload: any } {
  const industryCodes = parseIndustryCodes(row.industry_codes);
  const benefits = relations.benefits.get(row.id) ?? [];
  const criteria = relations.criteria.get(row.id) ?? [];
  const tags = relations.tags.get(row.id) ?? [];
  const programRecord: ProgramRecord = {
    id: Number(row.id),
    uid: row.uid,
    source_id: row.source_id ?? null,
    country_code: row.country_code as 'US' | 'CA' | 'UK',
    jurisdiction_code: row.jurisdiction_code ?? null,
    authority_level: row.authority_level ?? null,
    industry_codes: industryCodes,
    start_date: row.start_date ?? null,
    end_date: row.end_date ?? null,
    updated_at: Number(row.updated_at ?? 0),
    title: row.title,
    summary: row.summary ?? null,
    benefit_type: row.benefit_type ?? null,
    status: row.status ?? null,
    url: row.url ?? null,
    benefits: benefits.map((benefit: any) => ({
      type: benefit.type ?? null,
      notes: benefit.notes ?? null,
      max_amount_cents: benefit.max_amount_cents ?? null,
      min_amount_cents: benefit.min_amount_cents ?? null,
      currency_code: benefit.currency_code ?? null
    })),
    criteria,
    tags
  };
  const payload = {
    ...row,
    industry_codes: industryCodes,
    benefits,
    criteria,
    tags
  };
  return { programRecord, payload };
}

type MatchFilters = {
  country?: string;
  jurisdiction?: string;
  industry?: string[];
  from?: string;
  to?: string;
  limit?: number;
};

function sanitizeProfile(raw: any): MatchProfile | null {
  if (!raw || typeof raw !== 'object') return null;
  const country = typeof raw.country_code === 'string' ? raw.country_code.toUpperCase() : '';
  if (country !== 'US' && country !== 'CA' && country !== 'UK') return null;
  const naicsCodes = Array.isArray(raw.naics)
    ? raw.naics
        .map((code: any) => String(code))
        .filter((code: string): code is string => code.length > 0)
    : [];
  const profile: MatchProfile = {
    country_code: country,
    naics: Array.from(new Set(naicsCodes))
  };
  if (typeof raw.jurisdiction_code === 'string' && raw.jurisdiction_code.trim()) {
    profile.jurisdiction_code = raw.jurisdiction_code.trim();
  }
  if (raw.capex_cents !== undefined) {
    const capex = Number(raw.capex_cents);
    if (Number.isFinite(capex) && capex >= 0) {
      profile.capex_cents = Math.round(capex);
    }
  }
  if (typeof raw.start_date === 'string' && raw.start_date.trim()) {
    profile.start_date = raw.start_date.trim();
  }
  if (typeof raw.end_date === 'string' && raw.end_date.trim()) {
    profile.end_date = raw.end_date.trim();
  }
  return profile;
}

function sanitizeFilters(raw: any): MatchFilters {
  if (!raw || typeof raw !== 'object') return {};
  const filters: MatchFilters = {};
  if (typeof raw.country === 'string' && raw.country.trim()) {
    filters.country = raw.country.trim();
  }
  if (typeof raw.jurisdiction === 'string' && raw.jurisdiction.trim()) {
    filters.jurisdiction = raw.jurisdiction.trim();
  }
  if (Array.isArray(raw.industry)) {
    filters.industry = raw.industry
      .map((code: any) => String(code))
      .filter((code: string): code is string => code.length > 0);
  } else if (typeof raw.industry === 'string' && raw.industry.trim()) {
    filters.industry = [raw.industry.trim()];
  }
  if (typeof raw.from === 'string' && raw.from.trim()) {
    filters.from = raw.from.trim();
  }
  if (typeof raw.to === 'string' && raw.to.trim()) {
    filters.to = raw.to.trim();
  }
  const limit = Number(raw.limit);
  if (Number.isFinite(limit) && limit > 0) {
    filters.limit = Math.floor(limit);
  }
  return filters;
}

async function getScoredPrograms(
  env: Env,
  profile: MatchProfile,
  filters: MatchFilters,
  limit: number,
  weights: Awaited<ReturnType<typeof loadWeights>>,
  fxRates: Record<string, number>,
  now: number
) {
  const { sql, params } = buildProgramsQuery({
    country: filters.country ?? profile.country_code,
    jurisdiction: filters.jurisdiction ?? profile.jurisdiction_code,
    industry: filters.industry && filters.industry.length ? filters.industry : undefined,
    from: filters.from ?? profile.start_date,
    to: filters.to ?? profile.end_date,
    limit: Math.min(limit, 100),
    offset: 0,
    sort: '-updated_at'
  });
  const data = await env.DB.prepare(sql).bind(...params).all<any>();
  const rows = data.results ?? [];
  const relations = await fetchProgramRelations(env, rows.map((row: any) => Number(row.id)));
  const detailed = await Promise.all(
    rows.map(async (row: any) => {
      const { programRecord, payload } = buildProgramForMatch(row, relations);
      const scored = await scoreProgramWithReasons(profile, programRecord, weights, env, { fxRates, now });
      const recordWithScore: ProgramRecord = { ...programRecord, score: scored.score };
      return { payload, record: recordWithScore, score: scored.score, reasons: scored.reasons };
    })
  );
  detailed.sort((a, b) => b.score - a.score);
  return detailed;
}

app.get('/v1/health', (c) => c.json({ ok: true, service: 'gov-programs-api' }));

app.get('/v1/programs', async (c) => {
  const url = new URL(c.req.url);
  const qp = url.searchParams;
  const country = qp.get('country') || undefined; // 'US'|'CA'
  const state = qp.get('state') || qp.get('province') || undefined;
  const jurisdiction = state ? `${country || 'US'}-${state}` : undefined;
  const industry = qp.getAll('industry[]').concat(qp.getAll('industry'));
  const benefitType = qp.getAll('benefit_type[]').concat(qp.getAll('benefit_type'));
  const status = qp.getAll('status[]').concat(qp.getAll('status'));
  const from = qp.get('from') || undefined;
  const to = qp.get('to') || undefined;
  const sort = (qp.get('sort') as any) || '-updated_at';
  const page = parseInt(qp.get('page') || '1', 10);
  const pageSize = Math.min(parseInt(qp.get('page_size') || '25', 10), 100);
  const offset = (page - 1) * pageSize;

  const { sql, countSql, params } = buildProgramsQuery({
    q: qp.get('q') || undefined,
    country, jurisdiction, industry, benefitType, status, from, to, sort,
    limit: pageSize, offset
  });

  const data = await c.env.DB.prepare(sql).bind(...params).all<any>();
  const count = await c.env.DB.prepare(countSql).bind(...params).first<{ total: number }>();
  const rows = data.results ?? [];
  const relations = await fetchProgramRelations(c.env, rows.map((r: any) => Number(r.id))); 
  const enriched = rows.map((row: any) => ({
    ...row,
    industry_codes: parseIndustryCodes(row.industry_codes),
    benefits: relations.benefits.get(row.id) ?? [],
    criteria: relations.criteria.get(row.id) ?? [],
    tags: relations.tags.get(row.id) ?? []
  }));

  return c.json({ data: enriched, meta: { total: Number(count?.total ?? 0), page, pageSize } });
});

app.use('/v1/saved-queries', mwRate, mwAuth);
app.use('/v1/saved-queries/*', mwRate, mwAuth);
app.use('/v1/alerts', mwRate, mwAuth);
app.use('/v1/usage/me', mwRate, mwAuth);
app.use('/v1/match', mwRate, mwAuth);
app.use('/v1/stacks', mwRate, mwAuth);
app.use('/v1/stacks/*', mwRate, mwAuth);
app.use('/v1/admin', mwRate, mwAuth);
app.use('/v1/admin/*', mwRate, mwAuth);

app.post('/v1/match', async (c) => {
  const auth = c.get('auth');
  if (!auth) return c.json({ error: 'unauthorized' }, 401);
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid_json' }, 400);
  }
  const profile = sanitizeProfile(body?.profile);
  if (!profile) {
    return c.json({ error: 'invalid_profile' }, 400);
  }
  const filters = sanitizeFilters(body?.filters);
  const weights = await loadWeights(c.env);
  const fxRates = await loadFxToUSD(c.env);
  if (!fxRates.USD) fxRates.USD = 1;
  const now = Date.now();
  const scored = await getScoredPrograms(c.env, profile, filters, filters.limit ?? 100, weights, fxRates, now);
  return c.json({
    data: scored.slice(0, DEFAULT_MATCH_RESPONSE_LIMIT).map((entry) => ({
      program: entry.payload,
      score: entry.score,
      reasons: entry.reasons
    }))
  });
});

app.post('/v1/stacks/suggest', async (c) => {
  const auth = c.get('auth');
  if (!auth) return c.json({ error: 'unauthorized' }, 401);
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid_json' }, 400);
  }
  const profile = sanitizeProfile(body?.profile);
  if (!profile) {
    return c.json({ error: 'invalid_profile' }, 400);
  }
  const filters = sanitizeFilters(body?.filters);
  const weights = await loadWeights(c.env);
  const fxRates = await loadFxToUSD(c.env);
  if (!fxRates.USD) fxRates.USD = 1;
  const now = Date.now();
  const scored = await getScoredPrograms(c.env, profile, filters, filters.limit ?? 150, weights, fxRates, now);
  const stackCandidates = scored.slice(0, 100).map((entry) => entry.record);
  const stack = await suggestStack(profile, stackCandidates, { env: c.env, fxRates, now });
  return c.json({
    stack: stack.selected,
    value_usd: stack.value_usd,
    coverage_ratio: stack.coverage_ratio,
    constraints_hit: stack.constraints_hit
  });
});

app.get('/v1/admin/sources/health', async (c) => {
  const auth = c.get('auth');
  if (!auth) return c.json({ error: 'unauthorized' }, 401);
  if (auth.role !== 'admin') return c.json({ error: 'forbidden' }, 403);
  const metrics = await listSourcesWithMetrics(c.env);
  const errorRows = await c.env.DB.prepare(
    `SELECT source_id, message FROM ingestion_runs WHERE status = 'error' AND message IS NOT NULL ORDER BY ended_at DESC`
  ).all<{ source_id: number; message: string }>();
  const errorMap = new Map<number, string>();
  for (const row of errorRows.results ?? []) {
    if (!errorMap.has(row.source_id) && row.message) {
      errorMap.set(row.source_id, row.message);
    }
  }
  return c.json({
    data: metrics.map((metric) => ({
      id: metric.source_id,
      name: metric.id,
      jurisdiction_code: metric.jurisdiction_code,
      last_success_at: metric.last_success_at,
      success_rate_7d: metric.success_rate_7d,
      last_error: errorMap.get(metric.source_id) ?? null
    }))
  });
});

app.post('/v1/admin/ingest/retry', async (c) => {
  const auth = c.get('auth');
  if (!auth) return c.json({ error: 'unauthorized' }, 401);
  if (auth.role !== 'admin') return c.json({ error: 'forbidden' }, 403);
  const url = new URL(c.req.url);
  const sourceId = Number(url.searchParams.get('source'));
  if (!Number.isInteger(sourceId) || sourceId <= 0) {
    return c.json({ error: 'invalid_source' }, 400);
  }
  const exists = await c.env.DB.prepare('SELECT id FROM sources WHERE id = ? LIMIT 1')
    .bind(sourceId)
    .first<{ id: number }>();
  if (!exists) {
    return c.json({ error: 'not_found' }, 404);
  }
  const nowSeconds = Math.floor(Date.now() / 1000);
  await c.env.DB.prepare(
    `INSERT INTO ingestion_runs (source_id, started_at, ended_at, status, message)
     VALUES (?, ?, ?, 'partial', 'queued for admin retry')`
  )
    .bind(sourceId, nowSeconds, nowSeconds)
    .run();
  return c.json({ queued: true, source_id: sourceId });
});

app.post('/v1/saved-queries', async (c) => {
  const auth = c.get('auth');
  if (!auth) return c.json({ error: 'unauthorized' }, 401);
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid_json' }, 400);
  }
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const queryJson = typeof body?.query_json === 'string' ? body.query_json : '';
  if (!name || !queryJson) {
    return c.json({ error: 'invalid_payload' }, 400);
  }
  const id = await createSavedQuery(c.env, auth.apiKeyId, { name, query_json: queryJson });
  return c.json({ id });
});

app.get('/v1/saved-queries/:id', async (c) => {
  const auth = c.get('auth');
  if (!auth) return c.json({ error: 'unauthorized' }, 401);
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id)) {
    return c.json({ error: 'not_found' }, 404);
  }
  const row = await getSavedQuery(c.env, auth.apiKeyId, id);
  if (!row) {
    return c.json({ error: 'not_found' }, 404);
  }
  return c.json(row);
});

app.delete('/v1/saved-queries/:id', async (c) => {
  const auth = c.get('auth');
  if (!auth) return c.json({ error: 'unauthorized' }, 401);
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id)) {
    return c.json({ error: 'not_found' }, 404);
  }
  const deleted = await deleteSavedQuery(c.env, auth.apiKeyId, id);
  if (!deleted) {
    return c.json({ error: 'not_found' }, 404);
  }
  return c.json({ ok: true });
});

app.post('/v1/alerts', async (c) => {
  const auth = c.get('auth');
  if (!auth) return c.json({ error: 'unauthorized' }, 401);
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid_json' }, 400);
  }
  const savedQueryId = Number(body?.saved_query_id);
  const sink = typeof body?.sink === 'string' ? body.sink : '';
  const target = typeof body?.target === 'string' ? body.target : '';
  if (!Number.isInteger(savedQueryId) || !sink || !target) {
    return c.json({ error: 'invalid_payload' }, 400);
  }
  const savedQuery = await getSavedQuery(c.env, auth.apiKeyId, savedQueryId);
  if (!savedQuery) {
    return c.json({ error: 'not_found' }, 404);
  }
  const id = await createAlertSubscription(c.env, {
    saved_query_id: savedQuery.id,
    sink,
    target
  });
  return c.json({ id });
});

app.get('/v1/usage/me', async (c) => {
  const auth = c.get('auth');
  if (!auth) return c.json({ error: 'unauthorized' }, 401);
  const now = new Date();
  const nowSeconds = Math.floor(now.getTime() / 1000);
  const dayStart = getUtcDayStart(now);
  const monthStart = getUtcMonthStart(now);

  const [dayUsage, monthUsage] = await Promise.all([
    c.env.DB.prepare('SELECT COALESCE(SUM(cost), 0) as total FROM usage_events WHERE api_key_id = ? AND ts >= ?')
      .bind(auth.apiKeyId, dayStart)
      .first<{ total: number | null }>(),
    c.env.DB.prepare('SELECT COALESCE(SUM(cost), 0) as total FROM usage_events WHERE api_key_id = ? AND ts >= ?')
      .bind(auth.apiKeyId, monthStart)
      .first<{ total: number | null }>()
  ]);

  return c.json({
    day: { used: Number(dayUsage?.total ?? 0), window_started_at: dayStart },
    month: { used: Number(monthUsage?.total ?? 0), window_started_at: monthStart },
    limits: {
      daily: auth.quotaDaily,
      monthly: auth.quotaMonthly,
      last_seen_at: nowSeconds
    }
  });
});

app.get('/v1/programs/:id', async (c) => {
  const id = c.req.param('id');
  // Try lookup by uid first
  let row = await c.env.DB.prepare(
    `SELECT * FROM programs WHERE uid = ? LIMIT 1`
  ).bind(id).first<any>();
  // If not found, and id is an integer, try lookup by id
  if (!row && /^\d+$/.test(id)) {
    row = await c.env.DB.prepare(
      `SELECT * FROM programs WHERE id = ? LIMIT 1`
    ).bind(Number(id)).first<any>();
  }
  if (!row) return c.json({ error: 'not_found' }, 404);
  const relations = await fetchProgramRelations(c.env, [Number(row.id)]);
  return c.json({
    ...row,
    industry_codes: parseIndustryCodes(row.industry_codes),
    benefits: relations.benefits.get(row.id) ?? [],
    criteria: relations.criteria.get(row.id) ?? [],
    tags: relations.tags.get(row.id) ?? []
  });
});

app.get('/v1/sources', async (c) => {
  const rows = await listSourcesWithMetrics(c.env);
  return c.json({
    data: rows.map((row) => ({
      id: row.id,
      source_id: row.source_id,
      authority: row.authority,
      jurisdiction_code: row.jurisdiction_code,
      url: row.url,
      license: row.license,
      tos_url: row.tos_url,
      last_success_at: row.last_success_at,
      success_rate_7d: row.success_rate_7d
    }))
  });
});

app.get('/v1/stats/coverage', async (c) => {
  const payload = await buildCoverageResponse(c.env);
  return c.json(payload);
});

export default app;
