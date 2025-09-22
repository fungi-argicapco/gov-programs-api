import { Hono } from 'hono';
import { z } from 'zod';
import type { ProgramT } from '@common/types';
import { createDb, fetchCoverageStats, fetchProgramById, fetchPrograms, fetchSources, type ProgramFilters } from '@db';

type Bindings = {
  DB: D1Database;
};

type Variables = {
  db: ReturnType<typeof createDb>;
};

const listSchema = z.object({
  q: z.string().optional(),
  state: z.string().length(2).optional(),
  industry: z.array(z.string()).optional(),
  benefit_type: z.array(z.string()).optional(),
  status: z.array(z.string()).optional(),
  start: z.string().optional(),
  end: z.string().optional(),
  sort: z.enum(['relevance', 'recent', 'closing_soon']).optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0)
});

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.use('*', async (c, next) => {
  if (!c.get('db')) {
    c.set('db', createDb(c.env.DB));
  }
  await next();
});

app.get('/v1/health', (c) => c.json({ ok: true, service: 'gov-programs-api' }));

const toFilters = (input: z.infer<typeof listSchema>): ProgramFilters => ({
  search: input.q,
  state: input.state,
  industries: input.industry,
  benefitTypes: input.benefit_type,
  statuses: input.status,
  startDate: input.start,
  endDate: input.end,
  sort: input.sort ?? 'recent'
});

const serializeProgram = (program: ProgramT) => ({
  ...program,
  industries: program.industries,
  tags: program.tags,
  criteria: program.criteria
});

app.get('/v1/programs', async (c) => {
  const url = new URL(c.req.url);
  const params = Object.fromEntries(url.searchParams.entries());
  const industries = url.searchParams.getAll('industry');
  const benefitTypes = url.searchParams.getAll('benefit_type');
  const statuses = url.searchParams.getAll('status');

  const parsed = listSchema.safeParse({
    ...params,
    q: params.q,
    state: params.state,
    industry: industries.length ? industries : undefined,
    benefit_type: benefitTypes.length ? benefitTypes : undefined,
    status: statuses.length ? statuses : undefined,
    start: params.start,
    end: params.end,
    sort: params.sort,
    limit: params.limit,
    offset: params.offset
  });

  if (!parsed.success) {
    return c.json({ error: 'Invalid query', details: parsed.error.flatten() }, 400);
  }

  const filters = toFilters(parsed.data);
  const db = c.get('db');
  const { data, total } = await fetchPrograms(db, filters, parsed.data.limit, parsed.data.offset);

  return c.json({
    data: data.map(serializeProgram),
    meta: {
      total,
      limit: parsed.data.limit,
      offset: parsed.data.offset
    }
  });
});

app.get('/v1/programs/:id', async (c) => {
  const db = c.get('db');
  const program = await fetchProgramById(db, c.req.param('id'));
  if (!program) {
    return c.json({ error: 'Not found' }, 404);
  }
  return c.json(serializeProgram(program));
});

app.get('/v1/stats/coverage', async (c) => {
  const db = c.get('db');
  const stats = await fetchCoverageStats(db);
  return c.json(stats);
});

app.get('/v1/sources', async (c) => {
  const db = c.get('db');
  const sources = await fetchSources(db);
  return c.json({ data: sources });
});

export default app;
