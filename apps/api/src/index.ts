import { Hono } from 'hono';
import { Env } from './db';
import { buildProgramsQuery } from './query';
import { listSourcesWithMetrics, buildCoverageResponse, type CoverageResponse } from './coverage';
import { mwAuth, hashKey, type AuthVariables } from './mw.auth';
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
import { adminUi } from './admin/ui';

const MATCH_RESPONSE_LIMIT = 50;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RANK_LIMIT = 200;
const FIVE_MINUTES_MS = 5 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

function parseTimeInput(raw: string | null): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const numeric = Number(trimmed);
  if (Number.isFinite(numeric)) {
    return numeric;
  }
  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function toIsoTimestamp(ts: number): string {
  return new Date(ts).toISOString();
}

function formatUtcDay(date: Date): string {
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, '0');
  const day = `${date.getUTCDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDayParam(value: string | null, fallback: string): string {
  if (!value) return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  const parsed = Date.parse(trimmed);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return formatUtcDay(new Date(parsed));
}

function parseQuotaValue(input: unknown): number | null | undefined {
  if (input === undefined) {
    return null;
  }
  if (input === null) {
    return null;
  }
  if (typeof input === 'number') {
    return Number.isFinite(input) ? Math.max(0, Math.trunc(input)) : undefined;
  }
  if (typeof input === 'string') {
    const numeric = Number(input);
    return Number.isFinite(numeric) ? Math.max(0, Math.trunc(numeric)) : undefined;
  }
  return undefined;
}

function generateRawApiKey(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function auditMeta(payload: Record<string, unknown>): string | null {
  const entries = Object.entries(payload).filter(([, value]) => value !== undefined);
  if (entries.length === 0) {
    return null;
  }
  return JSON.stringify(Object.fromEntries(entries));
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

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
app.use('/v1/ops', mwRate, mwAuth);
app.use('/v1/ops/*', mwRate, mwAuth);
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

app.get('/v1/ops/metrics', async (c) => {
  const auth = c.get('auth');
  if (!auth) return apiError(c, 401, 'unauthorized', 'Authentication required.');
  if (auth.role !== 'admin') {
    return apiError(c, 403, 'forbidden', 'You do not have access to this resource.');
  }

  const url = new URL(c.req.url);
  const params = url.searchParams;
  const bucketParam = params.get('bucket') ?? '5m';
  const bucket = bucketParam === '1h' ? '1h' : bucketParam === '5m' ? '5m' : null;
  if (!bucket) {
    return apiError(c, 400, 'invalid_bucket', 'bucket must be 5m or 1h.');
  }

  const now = Date.now();
  const toMs = parseTimeInput(params.get('to')) ?? now;
  const fromMs = parseTimeInput(params.get('from')) ?? toMs - ONE_DAY_MS;
  const rangeStart = Math.min(fromMs, toMs);
  const rangeEnd = Math.max(fromMs, toMs);
  const fromBucket = Math.floor(rangeStart / FIVE_MINUTES_MS) * FIVE_MINUTES_MS;
  const toBucket = Math.floor(rangeEnd / FIVE_MINUTES_MS) * FIVE_MINUTES_MS;

  const bindings: Array<string | number> = [fromBucket, toBucket];
  let query =
    'SELECT bucket_ts, route, status_class, count, p50_ms, p95_ms, p99_ms, bytes_out FROM request_metrics_5m WHERE bucket_ts BETWEEN ? AND ?';
  const routeFilter = params.get('route');
  if (routeFilter) {
    query += ' AND route = ?';
    bindings.push(routeFilter);
  }
  query += ' ORDER BY bucket_ts ASC, route ASC, status_class ASC';

  const rows = (await c.env.DB.prepare(query).bind(...bindings).all<any>()).results ?? [];
  const aggregates = new Map<
    string,
    {
      bucket_ts: number;
      route: string;
      status_class: string;
      count: number;
      bytes_out: number;
      p50_weight: number;
      p95_weight: number;
      p99_weight: number;
    }
  >();

  for (const row of rows) {
    const route = String(row.route ?? '');
    const statusClass = String(row.status_class ?? '');
    const baseBucket = Number(row.bucket_ts ?? 0);
    const bucketTs = bucket === '1h' ? Math.floor(baseBucket / HOUR_MS) * HOUR_MS : baseBucket;
    const count = Number(row.count ?? 0);
    const bytesOut = Number(row.bytes_out ?? 0);
    const p50 = Number(row.p50_ms ?? 0);
    const p95 = Number(row.p95_ms ?? 0);
    const p99 = Number(row.p99_ms ?? 0);
    const key = `${bucketTs}|${route}|${statusClass}`;
    let agg = aggregates.get(key);
    if (!agg) {
      agg = {
        bucket_ts: bucketTs,
        route,
        status_class: statusClass,
        count: 0,
        bytes_out: 0,
        p50_weight: 0,
        p95_weight: 0,
        p99_weight: 0,
      };
      aggregates.set(key, agg);
    }
    agg.count += count;
    agg.bytes_out += bytesOut;
    if (count > 0) {
      agg.p50_weight += p50 * count;
      agg.p95_weight += p95 * count;
      agg.p99_weight += p99 * count;
    }
  }

  const data = Array.from(aggregates.values())
    .map((agg) => {
      const denom = agg.count > 0 ? agg.count : 1;
      return {
        bucket_ts: agg.bucket_ts,
        route: agg.route,
        status_class: agg.status_class,
        count: agg.count,
        p50_ms: agg.count > 0 ? Math.round(agg.p50_weight / denom) : 0,
        p95_ms: agg.count > 0 ? Math.round(agg.p95_weight / denom) : 0,
        p99_ms: agg.count > 0 ? Math.round(agg.p99_weight / denom) : 0,
        bytes_out: agg.bytes_out,
      };
    })
    .sort(
      (a, b) =>
        a.bucket_ts - b.bucket_ts ||
        a.route.localeCompare(b.route) ||
        a.status_class.localeCompare(b.status_class)
    );

  return c.json({
    data,
    meta: {
      from: toIsoTimestamp(fromBucket),
      to: toIsoTimestamp(toBucket),
      bucket,
    },
  });
});

app.get('/v1/ops/slo', async (c) => {
  const auth = c.get('auth');
  if (!auth) return apiError(c, 401, 'unauthorized', 'Authentication required.');
  if (auth.role !== 'admin') {
    return apiError(c, 403, 'forbidden', 'You do not have access to this resource.');
  }

  const url = new URL(c.req.url);
  const params = url.searchParams;
  const now = new Date();
  const defaultTo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const defaultFrom = new Date(defaultTo.getTime() - 6 * ONE_DAY_MS);
  const toDay = parseDayParam(params.get('to'), formatUtcDay(defaultTo));
  const fromDayRaw = parseDayParam(params.get('from'), formatUtcDay(defaultFrom));

  let rangeFrom = fromDayRaw;
  let rangeTo = toDay;
  const fromComparable = Date.parse(`${rangeFrom}T00:00:00Z`);
  const toComparable = Date.parse(`${rangeTo}T00:00:00Z`);
  if (Number.isFinite(fromComparable) && Number.isFinite(toComparable) && fromComparable > toComparable) {
    rangeFrom = toDay;
    rangeTo = fromDayRaw;
  }

  const rows = (
    await c.env.DB.prepare(
      `SELECT day_utc, route, requests, err_rate, p99_ms, slo_ok, budget_burn FROM slo_windows_daily WHERE day_utc BETWEEN ? AND ? ORDER BY day_utc ASC, route ASC`
    )
      .bind(rangeFrom, rangeTo)
      .all<any>()
  ).results ?? [];

  const data: Array<{
    day_utc: string;
    route: string;
    requests: number;
    err_rate: number;
    p99_ms: number;
    slo_ok: boolean;
    budget_burn: number | null;
  }> = [];
  let totalRequests = 0;
  let errWeighted = 0;
  let p99Weighted = 0;
  const routeSummary = new Map<string, { route: string; requests: number; errWeight: number; p99Weight: number }>();

  for (const row of rows) {
    const route = String(row.route ?? '');
    const requests = Number(row.requests ?? 0);
    const errRate = Number(row.err_rate ?? 0);
    const p99 = Number(row.p99_ms ?? 0);
    const sloOk = Boolean(Number(row.slo_ok ?? 0));
    const budgetRaw = row.budget_burn;
    const budgetNumber =
      budgetRaw === null || budgetRaw === undefined ? null : Number(budgetRaw);
    const budgetValue = budgetNumber !== null && Number.isFinite(budgetNumber) ? budgetNumber : null;

    data.push({
      day_utc: String(row.day_utc ?? ''),
      route,
      requests,
      err_rate: errRate,
      p99_ms: p99,
      slo_ok: sloOk,
      budget_burn: budgetValue,
    });

    totalRequests += requests;
    errWeighted += errRate * requests;
    p99Weighted += p99 * requests;

    const existing = routeSummary.get(route) ?? { route, requests: 0, errWeight: 0, p99Weight: 0 };
    existing.requests += requests;
    existing.errWeight += errRate * requests;
    existing.p99Weight += p99 * requests;
    routeSummary.set(route, existing);
  }

  const overallAvailability = totalRequests > 0 ? 1 - errWeighted / totalRequests : 1;
  const overallP99 = totalRequests > 0 ? p99Weighted / totalRequests : 0;

  const routes = Array.from(routeSummary.values())
    .map((entry) => {
      const reqs = entry.requests;
      const errRate = reqs > 0 ? entry.errWeight / reqs : 0;
      return {
        route: entry.route,
        requests: reqs,
        err_rate: errRate,
        availability: reqs > 0 ? 1 - errRate : 1,
        p99_ms: reqs > 0 ? entry.p99Weight / reqs : 0,
      };
    })
    .sort((a, b) => a.route.localeCompare(b.route));

  return c.json({
    data,
    summary: {
      overall_availability: overallAvailability,
      overall_p99: overallP99,
      routes,
    },
  });
});

app.get('/v1/ops/alerts', async (c) => {
  const auth = c.get('auth');
  if (!auth) return apiError(c, 401, 'unauthorized', 'Authentication required.');
  if (auth.role !== 'admin') {
    return apiError(c, 403, 'forbidden', 'You do not have access to this resource.');
  }

  const rows = await c.env.DB.prepare(
    'SELECT id, kind, details, created_at, resolved_at FROM ops_alerts WHERE resolved_at IS NULL ORDER BY created_at DESC'
  ).all<any>();

  return c.json({ data: rows.results ?? [] });
});

app.post('/v1/ops/alerts/resolve', async (c) => {
  const auth = c.get('auth');
  if (!auth) return apiError(c, 401, 'unauthorized', 'Authentication required.');
  if (auth.role !== 'admin') {
    return apiError(c, 403, 'forbidden', 'You do not have access to this resource.');
  }

  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return apiError(c, 400, 'invalid_json', 'Request body must be valid JSON.');
  }

  if (!Array.isArray(body?.ids)) {
    return apiError(c, 400, 'invalid_ids', 'ids must be an array of numbers.');
  }

  const ids = body.ids
    .map((value: unknown) => Number(value))
    .filter((value: number) => Number.isInteger(value) && value > 0);

  if (ids.length === 0) {
    return c.json({ resolved: 0 });
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const placeholders = ids.map(() => '?').join(',');
  const stmt = c.env.DB.prepare(
    `UPDATE ops_alerts SET resolved_at = ? WHERE id IN (${placeholders}) AND resolved_at IS NULL`
  );
  const result = await stmt.bind(nowSeconds, ...ids).run();
  const resolved = Number(result?.meta?.changes ?? 0);

  return c.json({ resolved });
});

app.get('/v1/admin/api-keys', async (c) => {
  const auth = c.get('auth');
  if (!auth) return apiError(c, 401, 'unauthorized', 'Authentication required.');
  if (auth.role !== 'admin') {
    return apiError(c, 403, 'forbidden', 'You do not have access to this resource.');
  }

  const rows = await c.env.DB.prepare(
    `SELECT id, name, role, quota_daily, quota_monthly, last_seen_at, created_at, updated_at FROM api_keys ORDER BY created_at DESC`
  ).all<any>();

  const data = (rows.results ?? []).map((row: any) => ({
    id: Number(row.id),
    name: row.name ?? null,
    role: row.role,
    quota_daily: toNullableNumber(row.quota_daily),
    quota_monthly: toNullableNumber(row.quota_monthly),
    last_seen_at: toNullableNumber(row.last_seen_at),
    created_at: toNullableNumber(row.created_at),
    updated_at: toNullableNumber(row.updated_at),
  }));

  return c.json({ data });
});

app.post('/v1/admin/api-keys', async (c) => {
  const auth = c.get('auth');
  if (!auth) return apiError(c, 401, 'unauthorized', 'Authentication required.');
  if (auth.role !== 'admin') {
    return apiError(c, 403, 'forbidden', 'You do not have access to this resource.');
  }

  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return apiError(c, 400, 'invalid_json', 'Request body must be valid JSON.');
  }

  const name = typeof body?.name === 'string' ? body.name.trim() : null;
  const role =
    body?.role === 'admin' || body?.role === 'partner' || body?.role === 'read' ? (body.role as 'admin' | 'partner' | 'read') : 'read';
  const quotaDaily = parseQuotaValue(body?.quota_daily);
  const quotaMonthly = parseQuotaValue(body?.quota_monthly);

  if (quotaDaily === undefined || quotaMonthly === undefined) {
    return apiError(c, 400, 'invalid_quota', 'quota_daily and quota_monthly must be numbers or null.');
  }

  const rawKey = generateRawApiKey();
  const keyHash = await hashKey(rawKey);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const result = await c.env.DB.prepare(
    `INSERT INTO api_keys (key_hash, role, name, quota_daily, quota_monthly, created_at, updated_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`
  )
    .bind(keyHash, role, name, quotaDaily, quotaMonthly, nowSeconds, nowSeconds)
    .run();

  const id = Number(result?.meta?.last_row_id ?? 0);

  await c.env.DB.prepare(
    `INSERT INTO admin_audits (actor_key_id, action, target, meta, ts) VALUES (?, ?, ?, ?, ?)`
  )
    .bind(
      auth.apiKeyId,
      'api_keys.create',
      String(id),
      auditMeta({ name, role, quota_daily: quotaDaily, quota_monthly: quotaMonthly }),
      nowSeconds
    )
    .run();

  return c.json({ id, raw_key: rawKey });
});

app.patch('/v1/admin/api-keys/:id', async (c) => {
  const auth = c.get('auth');
  if (!auth) return apiError(c, 401, 'unauthorized', 'Authentication required.');
  if (auth.role !== 'admin') {
    return apiError(c, 403, 'forbidden', 'You do not have access to this resource.');
  }

  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) {
    return apiError(c, 400, 'invalid_id', 'API key identifier is invalid.');
  }

  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return apiError(c, 400, 'invalid_json', 'Request body must be valid JSON.');
  }

  const current = await c.env.DB.prepare(
    `SELECT id, name, role, quota_daily, quota_monthly, created_at, updated_at, last_seen_at FROM api_keys WHERE id = ?`
  )
    .bind(id)
    .first<{
      id: number;
      name: string | null;
      role: 'admin' | 'partner' | 'read';
      quota_daily: number | null;
      quota_monthly: number | null;
      created_at: number | null;
      updated_at: number | null;
      last_seen_at: number | null;
    }>();

  if (!current) {
    return apiError(c, 404, 'not_found', 'Requested resource was not found.');
  }

  const updates: string[] = [];
  const values: any[] = [];
  const changes: Record<string, unknown> = {};

  if (Object.prototype.hasOwnProperty.call(body, 'name')) {
    const name = typeof body.name === 'string' ? body.name.trim() : null;
    if (name !== current.name) {
      updates.push('name = ?');
      values.push(name);
      changes.name = name;
    }
  }

  if (Object.prototype.hasOwnProperty.call(body, 'role')) {
    const role =
      body.role === 'admin' || body.role === 'partner' || body.role === 'read'
        ? (body.role as 'admin' | 'partner' | 'read')
        : null;
    if (!role) {
      return apiError(c, 400, 'invalid_role', 'role must be admin, partner, or read.');
    }
    if (role !== current.role) {
      updates.push('role = ?');
      values.push(role);
      changes.role = role;
    }
  }

  if (Object.prototype.hasOwnProperty.call(body, 'quota_daily')) {
    const quota = parseQuotaValue(body.quota_daily);
    if (quota === undefined) {
      return apiError(c, 400, 'invalid_quota', 'quota_daily must be a number or null.');
    }
    if (quota !== current.quota_daily) {
      updates.push('quota_daily = ?');
      values.push(quota);
      changes.quota_daily = quota;
    }
  }

  if (Object.prototype.hasOwnProperty.call(body, 'quota_monthly')) {
    const quota = parseQuotaValue(body.quota_monthly);
    if (quota === undefined) {
      return apiError(c, 400, 'invalid_quota', 'quota_monthly must be a number or null.');
    }
    if (quota !== current.quota_monthly) {
      updates.push('quota_monthly = ?');
      values.push(quota);
      changes.quota_monthly = quota;
    }
  }

  if (updates.length > 0) {
    updates.push('updated_at = ?');
    const nowSeconds = Math.floor(Date.now() / 1000);
    values.push(nowSeconds, id);
    await c.env.DB.prepare(
      `UPDATE api_keys SET ${updates.join(', ')} WHERE id = ?`
    )
      .bind(...values)
      .run();

    await c.env.DB.prepare(
      `INSERT INTO admin_audits (actor_key_id, action, target, meta, ts) VALUES (?, ?, ?, ?, ?)`
    )
      .bind(auth.apiKeyId, 'api_keys.update', String(id), auditMeta(changes) ?? null, nowSeconds)
      .run();
  }

  const updated = await c.env.DB.prepare(
    `SELECT id, name, role, quota_daily, quota_monthly, last_seen_at, created_at, updated_at FROM api_keys WHERE id = ?`
  )
    .bind(id)
    .first<any>();

  return c.json({
    id: Number(updated?.id ?? id),
    name: updated?.name ?? null,
    role: updated?.role ?? current.role,
    quota_daily: toNullableNumber(updated?.quota_daily),
    quota_monthly: toNullableNumber(updated?.quota_monthly),
    last_seen_at: toNullableNumber(updated?.last_seen_at ?? current.last_seen_at),
    created_at: toNullableNumber(updated?.created_at ?? current.created_at),
    updated_at: toNullableNumber(updated?.updated_at ?? null),
  });
});

app.delete('/v1/admin/api-keys/:id', async (c) => {
  const auth = c.get('auth');
  if (!auth) return apiError(c, 401, 'unauthorized', 'Authentication required.');
  if (auth.role !== 'admin') {
    return apiError(c, 403, 'forbidden', 'You do not have access to this resource.');
  }

  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) {
    return apiError(c, 400, 'invalid_id', 'API key identifier is invalid.');
  }

  const existing = await c.env.DB.prepare('SELECT id FROM api_keys WHERE id = ? LIMIT 1')
    .bind(id)
    .first<{ id: number }>();

  if (!existing) {
    return c.json({ deleted: false });
  }

  await c.env.DB.prepare('DELETE FROM api_keys WHERE id = ?')
    .bind(id)
    .run();

  const nowSeconds = Math.floor(Date.now() / 1000);
  await c.env.DB.prepare(
    `INSERT INTO admin_audits (actor_key_id, action, target, meta, ts) VALUES (?, ?, ?, ?, ?)`
  )
    .bind(auth.apiKeyId, 'api_keys.delete', String(id), null, nowSeconds)
    .run();

  return c.json({ deleted: true });
});

app.get('/admin', mwRate, async (c) => {
  const auth = c.get('auth');
  if (!auth) {
    return apiError(c, 401, 'unauthorized', 'Authentication required.');
  }
  if (auth.role !== 'admin') {
    return apiError(c, 403, 'forbidden', 'You do not have access to this resource.');
  }

  return new Response(adminUi(c), {
    headers: { 'content-type': 'text/html; charset=utf-8' },
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
