import { Hono } from 'hono';
import { Env } from './db';
import { buildProgramsQuery } from './query';

const app = new Hono<{ Bindings: Env }>();

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
  const rows = await c.env.DB.prepare(`SELECT * FROM sources ORDER BY jurisdiction_code, name`).all<any>();
  return c.json({ data: rows.results ?? [] });
});

app.get('/v1/stats/coverage', async (c) => {
  const byJur = await c.env.DB.prepare(`
    SELECT country_code, jurisdiction_code, count(*) as n
    FROM programs GROUP BY country_code, jurisdiction_code
  `).all<any>();
  const byBenefit = await c.env.DB.prepare(`
    SELECT benefit_type, count(*) as n FROM programs GROUP BY benefit_type
  `).all<any>();
  return c.json({ byJurisdiction: byJur.results ?? [], byBenefit: byBenefit.results ?? [] });
});

export default app;
