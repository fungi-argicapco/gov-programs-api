import { Hono } from 'hono';
import { Env } from './db';
import { buildProgramsQuery } from './query';

const app = new Hono<{ Bindings: Env }>();

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

  return c.json({ data: data.results ?? [], meta: { total: Number(count?.total ?? 0), page, pageSize } });
});

app.get('/v1/programs/:id', async (c) => {
  const id = c.req.param('id');
  const row = await c.env.DB.prepare(`
    SELECT * FROM programs WHERE uid = ? OR CAST(id AS TEXT) = ? LIMIT 1
  `).bind(id, id).first<any>();
  if (!row) return c.json({ error: 'not_found' }, 404);
  return c.json(row);
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
