import { Hono } from 'hono';
import { Env } from './db';
import { buildProgramsQuery } from './query';
import { listSourcesWithMetrics, buildCoverageResponse, type CoverageResponse } from './coverage';
import { mwAuth, type AuthVariables } from './mw.auth';
import { mwMetrics } from './mw.metrics';
import { mwRate } from './mw.rate';
import { createAlertSubscription, createSavedQuery, deleteSavedQuery, getSavedQuery } from './saved';
import { scoreProgramWithReasons, suggestStack, loadWeights, type Profile as MatchProfile, type ProgramRecord } from './match';
import { loadFxToUSD } from '@common/lookups';
import { loadLtrWeights, rerank, textSim } from '@ml';
import { loadSynonyms } from './synonyms';
import { getUtcDayStart, getUtcMonthStart } from './time';
import { CACHE_CONTROL_VALUE, buildCacheKey, cacheGet, cachePut, computeEtag, etagMatches } from './cache';
import { apiError } from './errors';

const MATCH_RESPONSE_LIMIT = 50;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RANK_LIMIT = 200;

function safeNumber(value: any): number | null {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function computeFreshnessFeature(updatedAt: any, now: number): number {
  const ts = safeNumber(updatedAt);
  if (ts === null) return 0;
  const ageDays = (now - ts) / ONE_DAY_MS;
  if (!Number.isFinite(ageDays) || ageDays < 0) return 1;
  if (ageDays <= 7) return 1;
  if (ageDays >= 180) return 0;
  return Math.min(1, Math.max(0, (180 - ageDays) / (180 - 7)));
}

function computeJurisdictionFeature(
  rowCountry: string | null | undefined,
  rowJurisdiction: string | null | undefined,
  filterCountry?: string,
  filterJurisdiction?: string
): number {
  if (filterJurisdiction) {
    return rowJurisdiction === filterJurisdiction ? 1 : 0;
  }
  if (filterCountry) {
    return rowCountry?.toUpperCase() === filterCountry.toUpperCase() ? 1 : 0;
  }
  return 0.5;
}

function computeIndustryFeature(rowCodes: string[], filterCodes: string[]): number {
  if (!filterCodes.length) {
    return 0.5;
  }
  const rowSet = new Set(rowCodes);
  const filterSet = new Set(filterCodes);
  let overlap = 0;
  for (const code of filterSet) {
    if (rowSet.has(code)) {
      overlap += 1;
    }
  }
  const union = new Set([...rowSet, ...filterSet]);
  if (union.size === 0) return 0;
  return overlap / union.size;
}

function toTimestamp(value?: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function computeTimingFeature(
  programStart: string | null | undefined,
  programEnd: string | null | undefined,
  filterFrom?: string,
  filterTo?: string
): number {
  if (!filterFrom && !filterTo) {
    return 0.5;
  }
  const profileStart = filterFrom ? toTimestamp(filterFrom) ?? Number.NEGATIVE_INFINITY : Number.NEGATIVE_INFINITY;
  const profileEnd = filterTo ? toTimestamp(filterTo) ?? Number.POSITIVE_INFINITY : Number.POSITIVE_INFINITY;
  const programStartTs = toTimestamp(programStart) ?? Number.NEGATIVE_INFINITY;
  const programEndTs = toTimestamp(programEnd) ?? Number.POSITIVE_INFINITY;

  const overlapStart = Math.max(profileStart, programStartTs);
  const overlapEnd = Math.min(profileEnd, programEndTs);
  if (overlapStart > overlapEnd) return 0;

  const overlapDuration = overlapEnd - overlapStart;
  if (!Number.isFinite(overlapDuration) || overlapDuration <= 0) {
    return 0.5;
  }

  const profileDuration = profileEnd - profileStart;
  const programDuration = programEndTs - programStartTs;
  const finiteDurations = [profileDuration, programDuration]
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);
  const reference = finiteDurations[0];
  if (!reference || reference <= 0) {
    return 1;
  }
  return Math.min(1, Math.max(0, overlapDuration / reference));
}

const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

app.use('*', mwMetrics);

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
  const cacheKey = buildCacheKey(c.req.url);
  const ifNoneMatch = c.req.header('if-none-match');
  const cached = await cacheGet(c, cacheKey);
  if (cached) {
    const cachedEtag = cached.headers.get('ETag');
    if (cachedEtag && etagMatches(ifNoneMatch, cachedEtag)) {
      const headers = new Headers();
      headers.set('X-Cache', 'HIT');
      headers.set('ETag', cachedEtag);
      const cachedControl = cached.headers.get('Cache-Control') ?? CACHE_CONTROL_VALUE;
      headers.set('Cache-Control', cachedControl);
      return new Response(null, { status: 304, headers });
    }
    return cached;
  }

  const url = new URL(c.req.url);
  const qp = url.searchParams;
  const country = qp.get('country') || undefined; // 'US'|'CA'
  const state = qp.get('state') || qp.get('province') || undefined;
  const jurisdiction = state ? `${country || 'US'}-${state}` : undefined;
  const industry = qp
    .getAll('industry[]')
    .concat(qp.getAll('industry'))
    .map((code) => code.trim())
    .filter((code) => code.length > 0);
  const benefitType = qp.getAll('benefit_type[]').concat(qp.getAll('benefit_type'));
  const status = qp.getAll('status[]').concat(qp.getAll('status'));
  const from = qp.get('from') || undefined;
  const to = qp.get('to') || undefined;
  const sort = (qp.get('sort') as any) || '-updated_at';
  const page = parseInt(qp.get('page') || '1', 10);
  const pageSize = Math.min(parseInt(qp.get('page_size') || '25', 10), 100);
  const offset = (page - 1) * pageSize;
  const rankMode = qp.get('rank');
  const isLtr = rankMode === 'ltr';
  const requestedWindow = offset + pageSize;
  const rawRank = Number(qp.get('rank_n'));
  let rankLimit = Number.isFinite(rawRank) && rawRank > 0 ? Math.floor(rawRank) : DEFAULT_RANK_LIMIT;
  rankLimit = Math.max(pageSize, Math.min(rankLimit, 500));
  const fetchLimit = isLtr ? Math.max(rankLimit, requestedWindow) : pageSize;

  const { sql, countSql, params } = buildProgramsQuery({
    q: qp.get('q') || undefined,
    country,
    jurisdiction,
    industry,
    benefitType,
    status,
    from,
    to,
    sort,
    limit: fetchLimit,
    offset: isLtr ? 0 : offset,
  });

  const [data, stats] = await Promise.all([
    c.env.DB.prepare(sql).bind(...params).all<any>(),
    c.env.DB.prepare(countSql).bind(...params).first<{ total: number; max_updated_at: number | null }>(),
  ]);
  const rows = data.results ?? [];
  const total = Number(stats?.total ?? 0);
  const maxUpdatedAtValue = safeNumber(stats?.max_updated_at ?? null);
  const maxUpdatedAt = maxUpdatedAtValue && maxUpdatedAtValue > 0 ? maxUpdatedAtValue : null;

  const baseMeta: {
    total: number;
    page: number;
    pageSize: number;
    ranking?: { mode: 'ltr'; window: number };
  } = { total, page, pageSize };
  let payloadData: any[] = [];

  if (!isLtr) {
    const relations = await fetchProgramRelations(c.env, rows.map((r: any) => Number(r.id)));
    payloadData = rows.map((row: any) => ({
      ...row,
      industry_codes: parseIndustryCodes(row.industry_codes),
      benefits: relations.benefits.get(row.id) ?? [],
      criteria: relations.criteria.get(row.id) ?? [],
      tags: relations.tags.get(row.id) ?? [],
    }));
  } else {
    const [weights, synonyms] = await Promise.all([loadLtrWeights(c.env), loadSynonyms(c.env)]);
    const searchQuery = qp.get('q') || '';
    const now = Date.now();
    const ranked = rerank(
      rows.map((row: any) => {
        const codes = parseIndustryCodes(row.industry_codes);
        return {
          row,
          feats: {
            jur: computeJurisdictionFeature(row.country_code, row.jurisdiction_code, country, jurisdiction),
            ind: computeIndustryFeature(codes, industry),
            time: computeTimingFeature(
              row.start_date ?? null,
              row.end_date ?? null,
              from ?? undefined,
              to ?? undefined
            ),
            size: 0.5,
            fresh: computeFreshnessFeature(row.updated_at, now),
            text: textSim(searchQuery, row.title ?? '', row.summary ?? undefined, synonyms),
          },
        };
      }),
      weights
    );
    const paged = ranked.slice(offset, offset + pageSize);
    const selectedRows = paged.map((entry) => Number(entry.row.id));
    const relations = await fetchProgramRelations(c.env, selectedRows);
    payloadData = paged.map((entry) => {
      const row = entry.row;
      return {
        ...row,
        industry_codes: parseIndustryCodes(row.industry_codes),
        benefits: relations.benefits.get(row.id) ?? [],
        criteria: relations.criteria.get(row.id) ?? [],
        tags: relations.tags.get(row.id) ?? [],
      };
    });
    baseMeta.ranking = { mode: 'ltr', window: rankLimit };
  }

  const payload = { data: payloadData, meta: baseMeta };
  const responseIds = payloadData.map((row: any) => Number(row.id));
  const etagValue = `"${await computeEtag(payload, responseIds, maxUpdatedAt)}"`;

  if (etagMatches(ifNoneMatch, etagValue)) {
    const res = c.json(payload);
    res.headers.set('ETag', etagValue);
    await cachePut(c, cacheKey, res);
    const headers = new Headers({
      ETag: etagValue,
      'Cache-Control': res.headers.get('Cache-Control') ?? CACHE_CONTROL_VALUE,
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
  if (!auth) return apiError(c, 401, 'unauthorized', 'Authentication required.');
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return apiError(c, 400, 'invalid_json', 'Request body must be valid JSON.');
  }
  const profile = sanitizeProfile(body?.profile);
  if (!profile) {
    return apiError(c, 400, 'invalid_profile', 'Provided profile is invalid.');
  }
  const filters = sanitizeFilters(body?.filters);
  const weights = await loadWeights(c.env);
  const fxRates = await loadFxToUSD(c.env);
  if (!fxRates.USD) fxRates.USD = 1;
  const now = Date.now();
  const scored = await getScoredPrograms(c.env, profile, filters, filters.limit ?? 100, weights, fxRates, now);
  return c.json({
    data: scored.slice(0, MATCH_RESPONSE_LIMIT).map((entry) => ({
      program: entry.payload,
      score: entry.score,
      reasons: entry.reasons
    }))
  });
});

app.post('/v1/stacks/suggest', async (c) => {
  const auth = c.get('auth');
  if (!auth) return apiError(c, 401, 'unauthorized', 'Authentication required.');
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return apiError(c, 400, 'invalid_json', 'Request body must be valid JSON.');
  }
  const profile = sanitizeProfile(body?.profile);
  if (!profile) {
    return apiError(c, 400, 'invalid_profile', 'Provided profile is invalid.');
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
  if (!auth) return apiError(c, 401, 'unauthorized', 'Authentication required.');
  if (auth.role !== 'admin') {
    return apiError(c, 403, 'forbidden', 'You do not have access to this resource.');
  }
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
  if (!auth) return apiError(c, 401, 'unauthorized', 'Authentication required.');
  if (auth.role !== 'admin') {
    return apiError(c, 403, 'forbidden', 'You do not have access to this resource.');
  }
  const url = new URL(c.req.url);
  const sourceId = Number(url.searchParams.get('source'));
  if (!Number.isInteger(sourceId) || sourceId <= 0) {
    return apiError(c, 400, 'invalid_source', 'Source identifier is invalid.');
  }
  const exists = await c.env.DB.prepare('SELECT id FROM sources WHERE id = ? LIMIT 1')
    .bind(sourceId)
    .first<{ id: number }>();
  if (!exists) {
    return apiError(c, 404, 'not_found', 'Requested resource was not found.');
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
  if (!auth) return apiError(c, 401, 'unauthorized', 'Authentication required.');
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return apiError(c, 400, 'invalid_json', 'Request body must be valid JSON.');
  }
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const queryJson = typeof body?.query_json === 'string' ? body.query_json : '';
  if (!name || !queryJson) {
    return apiError(c, 400, 'invalid_payload', 'Saved query payload is invalid.');
  }
  const id = await createSavedQuery(c.env, auth.apiKeyId, { name, query_json: queryJson });
  return c.json({ id });
});

app.get('/v1/saved-queries/:id', async (c) => {
  const auth = c.get('auth');
  if (!auth) return apiError(c, 401, 'unauthorized', 'Authentication required.');
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id)) {
    return apiError(c, 404, 'not_found', 'Requested resource was not found.');
  }
  const row = await getSavedQuery(c.env, auth.apiKeyId, id);
  if (!row) {
    return apiError(c, 404, 'not_found', 'Requested resource was not found.');
  }
  return c.json(row);
});

app.delete('/v1/saved-queries/:id', async (c) => {
  const auth = c.get('auth');
  if (!auth) return apiError(c, 401, 'unauthorized', 'Authentication required.');
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id)) {
    return apiError(c, 404, 'not_found', 'Requested resource was not found.');
  }
  const deleted = await deleteSavedQuery(c.env, auth.apiKeyId, id);
  if (!deleted) {
    return apiError(c, 404, 'not_found', 'Requested resource was not found.');
  }
  return c.json({ ok: true });
});

app.post('/v1/alerts', async (c) => {
  const auth = c.get('auth');
  if (!auth) return apiError(c, 401, 'unauthorized', 'Authentication required.');
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return apiError(c, 400, 'invalid_json', 'Request body must be valid JSON.');
  }
  const savedQueryId = Number(body?.saved_query_id);
  const sink = typeof body?.sink === 'string' ? body.sink : '';
  const target = typeof body?.target === 'string' ? body.target : '';
  if (!Number.isInteger(savedQueryId) || !sink || !target) {
    return apiError(c, 400, 'invalid_payload', 'Alert payload is invalid.');
  }
  const savedQuery = await getSavedQuery(c.env, auth.apiKeyId, savedQueryId);
  if (!savedQuery) {
    return apiError(c, 404, 'not_found', 'Requested resource was not found.');
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
  if (!auth) return apiError(c, 401, 'unauthorized', 'Authentication required.');
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
  const cacheKey = buildCacheKey(c.req.url);
  const ifNoneMatch = c.req.header('if-none-match');
  const cached = await cacheGet(c, cacheKey);
  if (cached) {
    const cachedEtag = cached.headers.get('ETag');
    if (cachedEtag && etagMatches(ifNoneMatch, cachedEtag)) {
      const headers = new Headers();
      headers.set('X-Cache', 'HIT');
      headers.set('ETag', cachedEtag);
      const cachedControl = cached.headers.get('Cache-Control') ?? CACHE_CONTROL_VALUE;
      headers.set('Cache-Control', cachedControl);
      return new Response(null, { status: 304, headers });
    }
    return cached;
  }

  const id = c.req.param('id');
  // Try lookup by uid first
  let row = await c.env.DB.prepare(
    `SELECT * FROM programs WHERE uid = ? LIMIT 1`
  )
    .bind(id)
    .first<any>();
  // If not found, and id is an integer, try lookup by id
  if (!row && /^\d+$/.test(id)) {
    row = await c.env.DB.prepare(
      `SELECT * FROM programs WHERE id = ? LIMIT 1`
    )
      .bind(Number(id))
      .first<any>();
  }
  if (!row) {
    return apiError(c, 404, 'not_found', 'Requested resource was not found.');
  }
  const relations = await fetchProgramRelations(c.env, [Number(row.id)]);
  const payload = {
    ...row,
    industry_codes: parseIndustryCodes(row.industry_codes),
    benefits: relations.benefits.get(row.id) ?? [],
    criteria: relations.criteria.get(row.id) ?? [],
    tags: relations.tags.get(row.id) ?? [],
  };
  const updatedAtRaw = Number(row?.updated_at ?? 0);
  const updatedAt = Number.isFinite(updatedAtRaw) && updatedAtRaw > 0 ? updatedAtRaw : null;
  const etagValue = `"${await computeEtag(payload, [Number(row.id)], updatedAt)}"`;

  if (etagMatches(ifNoneMatch, etagValue)) {
    const res = c.json(payload);
    res.headers.set('ETag', etagValue);
    await cachePut(c, cacheKey, res);
    const headers = new Headers({
      ETag: etagValue,
      'Cache-Control': res.headers.get('Cache-Control') ?? CACHE_CONTROL_VALUE,
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

app.get('/v1/sources', async (c) => {
  const cacheKey = buildCacheKey(c.req.url);
  const ifNoneMatch = c.req.header('if-none-match');
  const cached = await cacheGet(c, cacheKey);
  if (cached) {
    const cachedEtag = cached.headers.get('ETag');
    if (cachedEtag && etagMatches(ifNoneMatch, cachedEtag)) {
      const headers = new Headers();
      headers.set('X-Cache', 'HIT');
      headers.set('ETag', cachedEtag);
      const cachedControl = cached.headers.get('Cache-Control') ?? CACHE_CONTROL_VALUE;
      headers.set('Cache-Control', cachedControl);
      return new Response(null, { status: 304, headers });
    }
    return cached;
  }

  const rows = await listSourcesWithMetrics(c.env);
  const payload = {
    data: rows.map((row) => ({
      id: row.id,
      source_id: row.source_id,
      authority: row.authority,
      jurisdiction_code: row.jurisdiction_code,
      url: row.url,
      license: row.license,
      tos_url: row.tos_url,
      last_success_at: row.last_success_at,
      success_rate_7d: row.success_rate_7d,
    })),
  };
  const ids = payload.data.map((row) => Number(row.id));
  const bucket = Math.floor(Date.now() / 60000);
  const etagValue = `"${await computeEtag(payload, ids, bucket)}"`;

  if (etagMatches(ifNoneMatch, etagValue)) {
    const res = c.json(payload);
    res.headers.set('ETag', etagValue);
    await cachePut(c, cacheKey, res);
    const headers = new Headers({
      ETag: etagValue,
      'Cache-Control': res.headers.get('Cache-Control') ?? CACHE_CONTROL_VALUE,
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

app.get('/v1/stats/coverage', async (c) => {
  const cacheKey = buildCacheKey(c.req.url);
  const ifNoneMatch = c.req.header('if-none-match');
  const cached = await cacheGet(c, cacheKey);
  if (cached) {
    const cachedEtag = cached.headers.get('ETag');
    if (cachedEtag && etagMatches(ifNoneMatch, cachedEtag)) {
      const headers = new Headers();
      headers.set('X-Cache', 'HIT');
      headers.set('ETag', cachedEtag);
      const cachedControl = cached.headers.get('Cache-Control') ?? CACHE_CONTROL_VALUE;
      headers.set('Cache-Control', cachedControl);
      return new Response(null, { status: 304, headers });
    }
    return cached;
  }

  const payload: CoverageResponse = await buildCoverageResponse(c.env);
  // Extract IDs from the payload for ETag computation
  // Assumes payload has a property 'sources' which is an array of objects with an 'id' property
  const ids: number[] = Array.isArray((payload as any).sources)
    ? (payload as any).sources.map((s: any) => s.id).filter((id: any) => typeof id === 'number')
    : [];
  const bucket = Math.floor(Date.now() / 60000);
  const etagValue = `"${await computeEtag(payload, ids, bucket)}"`;

  if (etagMatches(ifNoneMatch, etagValue)) {
    const res = c.json(payload);
    res.headers.set('ETag', etagValue);
    await cachePut(c, cacheKey, res);
    const headers = new Headers({
      ETag: etagValue,
      'Cache-Control': res.headers.get('Cache-Control') ?? CACHE_CONTROL_VALUE,
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

export default app;
