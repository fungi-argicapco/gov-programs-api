import { drizzle } from 'drizzle-orm/d1';
import { and, eq, inArray, or, sql } from 'drizzle-orm';
import type { ProgramCriterionT, ProgramT, ProgramTagT } from '@common/types';
import { programCriteria, programTags, programs, tags } from './schema';

export type DrizzleDatabase = ReturnType<typeof drizzle>;

export const createDb = (database: D1Database): DrizzleDatabase => drizzle(database);

const AUTHORITY_LEVELS: ReadonlySet<NonNullable<ProgramT['authorityLevel']>> = new Set([
  'local',
  'regional',
  'state',
  'federal'
]);

const BENEFIT_TYPES: ReadonlySet<NonNullable<ProgramT['benefitType']>> = new Set([
  'grant',
  'rebate',
  'tax_credit',
  'loan',
  'guarantee',
  'voucher',
  'other'
]);

const STATUSES: ReadonlySet<ProgramT['status']> = new Set(['open', 'scheduled', 'closed', 'unknown']);

const normalizeAuthorityLevel = (value: string | null): ProgramT['authorityLevel'] => {
  if (value && AUTHORITY_LEVELS.has(value as NonNullable<ProgramT['authorityLevel']>)) {
    return value as ProgramT['authorityLevel'];
  }
  return undefined;
};

const normalizeBenefitType = (value: string | null): ProgramT['benefitType'] => {
  if (value && BENEFIT_TYPES.has(value as NonNullable<ProgramT['benefitType']>)) {
    return value as ProgramT['benefitType'];
  }
  return undefined;
};

const normalizeStatus = (value: string | null): ProgramT['status'] => {
  if (value && STATUSES.has(value as ProgramT['status'])) {
    return value as ProgramT['status'];
  }
  return 'unknown';
};


const parseIndustries = (value: string | null): string[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const mapProgramRow = (row: typeof programs.$inferSelect): ProgramT => ({
  id: row.id,
  sourceId: row.sourceId ?? undefined,
  sourceName: row.sourceName ?? undefined,
  sourceUrl: row.sourceUrl ?? undefined,
  title: row.title,
  summary: row.summary ?? undefined,
  authorityLevel: normalizeAuthorityLevel(row.authorityLevel ?? null),
  stateCode: row.stateCode ?? undefined,
  industries: parseIndustries(row.industries),
  startDate: row.startDate ?? undefined,
  endDate: row.endDate ?? undefined,
  status: normalizeStatus(row.status ?? null),
  benefitType: normalizeBenefitType(row.benefitType ?? null),
  websiteUrl: row.websiteUrl ?? undefined,
  applicationUrl: row.applicationUrl ?? undefined,
  tags: [],
  criteria: [],
  lastIndexedAt: row.updatedAt ?? undefined
});

const buildSearchCondition = (filters: ProgramFilters) => {
  if (!filters.search) return undefined;
  // Escape embedded double quotes and wrap in double quotes for FTS safety
  const token = `"${filters.search.replace(/"/g, '""').trim()}"`;
  if (token === '""') return undefined;
  return sql`exists (select 1 from programs_fts where programs_fts.program_id = ${programs.id} and programs_fts match ${token})`;
};

const buildIndustryCondition = (codes?: string[]) => {
  if (!codes || codes.length === 0) return undefined;
  const clauses = codes.map((code) => sql`${programs.industries} like ${`%"${code}"%`}`);
  if (clauses.length === 1) return clauses[0];
  return or(...clauses);
};

const buildArrayCondition = (column: typeof programs.status | typeof programs.benefitType, values?: string[]) => {
  if (!values || values.length === 0) return undefined;
  return inArray(column, values.map((v) => v.toLowerCase()));
};

const buildDateCondition = (column: typeof programs.startDate | typeof programs.endDate, operator: '>=' | '<=', value?: string) => {
  if (!value) return undefined;
  return operator === '>='
    ? sql`${column} >= ${value}`
    : sql`${column} <= ${value}`;
};


const resolveOrderBy = (filters: ProgramFilters) => {
  if (filters.sort === 'closing_soon') {
    return sql`(case when ${programs.endDate} is null then 1 else 0 end), ${programs.endDate} asc`;
  }
  return sql`${programs.updatedAt} desc`;
};

const baseProgramQuery = (filters: ProgramFilters) => {
  const conditions = [
    buildSearchCondition(filters),
    filters.state ? eq(programs.stateCode, filters.state.toUpperCase()) : undefined,
    buildIndustryCondition(filters.industries),
    buildArrayCondition(programs.benefitType, filters.benefitTypes),
    buildArrayCondition(programs.status, filters.statuses),
    buildDateCondition(programs.startDate, '>=', filters.startDate),
    buildDateCondition(programs.endDate, '<=', filters.endDate)
  ].filter(Boolean) as ReturnType<typeof sql>[];

  return {
    where: conditions.length ? and(...conditions) : undefined,
    orderBy: resolveOrderBy(filters)
  };
};

export const fetchPrograms = async (db: DrizzleDatabase, filters: ProgramFilters, limit = 20, offset = 0) => {
  const { where, orderBy } = baseProgramQuery(filters);

  const baseSelect = db.select().from(programs);
  const rows = await (where ? baseSelect.where(where) : baseSelect)
    .orderBy(orderBy)
    .limit(limit)
    .offset(offset);

  const baseCount = db.select({ count: sql<number>`count(*)` }).from(programs);
  const totalRow = await (where ? baseCount.where(where) : baseCount);
  const total = totalRow[0]?.count ?? 0;

  if (rows.length === 0) {
    return { data: [] as ProgramT[], total };
  }

  const programIds = rows.map((row) => row.id);
  const [criteriaRows, tagRows] = await Promise.all([
    db.select().from(programCriteria).where(inArray(programCriteria.programId, programIds)).orderBy(programCriteria.position),
    db.select({
      programId: programTags.programId,
      tagId: tags.id,
      slug: tags.slug,
      label: tags.label
    })
      .from(programTags)
      .innerJoin(tags, eq(programTags.tagId, tags.id))
      .where(inArray(programTags.programId, programIds))
  ]);

  const criteriaByProgram = new Map<string, ProgramCriterionT[]>();
  for (const row of criteriaRows) {
    const list = criteriaByProgram.get(row.programId) ?? [];
    list.push({
      id: row.id,
      programId: row.programId,
      category: (row.category ?? 'other') as ProgramCriterionT['category'],
      label: row.label,
      value: row.value ?? undefined,
      notes: row.notes ?? undefined
    });
    criteriaByProgram.set(row.programId, list);
  }

  const tagsByProgram = new Map<string, ProgramTagT[]>();
  for (const row of tagRows) {
    const list = tagsByProgram.get(row.programId) ?? [];
    list.push({ id: row.tagId, slug: row.slug ?? '', label: row.label ?? '' });
    tagsByProgram.set(row.programId, list);
  }

  const programsList = rows.map((row) => {
    const program = mapProgramRow(row);
    program.criteria = criteriaByProgram.get(row.id) ?? [];
    program.tags = tagsByProgram.get(row.id) ?? [];
    return program;
  });

  return { data: programsList, total };
};

export const fetchProgramById = async (db: DrizzleDatabase, id: string) => {
  const rows = await db.select().from(programs).where(eq(programs.id, id)).limit(1);
  const row = rows[0];
  if (!row) return null;
  const [criteriaRows, tagRows] = await Promise.all([
    db.select().from(programCriteria).where(eq(programCriteria.programId, id)).orderBy(programCriteria.position),
    db.select({
      tagId: tags.id,
      slug: tags.slug,
      label: tags.label
    })
      .from(programTags)
      .innerJoin(tags, eq(programTags.tagId, tags.id))
      .where(eq(programTags.programId, id))
  ]);

  return {
    ...mapProgramRow(row),
    criteria: criteriaRows.map((criterion) => ({
      id: criterion.id,
      programId: criterion.programId,
      category: (criterion.category ?? 'other') as ProgramCriterionT['category'],
      label: criterion.label,
      value: criterion.value ?? undefined,
      notes: criterion.notes ?? undefined
    })),
    tags: tagRows.map((tag) => ({ id: tag.tagId, slug: tag.slug ?? '', label: tag.label ?? '' }))
  } satisfies ProgramT;
};

export const fetchCoverageStats = async (db: DrizzleDatabase) => {
  const byState = await db.select({ state: programs.stateCode, total: sql<number>`count(*)` })
    .from(programs)
    .groupBy(programs.stateCode);
  const byBenefit = await db.select({ benefitType: programs.benefitType, total: sql<number>`count(*)` })
    .from(programs)
    .groupBy(programs.benefitType);
  const byStatus = await db.select({ status: programs.status, total: sql<number>`count(*)` })
    .from(programs)
    .groupBy(programs.status);

  return { byState, byBenefit, byStatus };
};

export const fetchSources = async (db: DrizzleDatabase) => {
  const rows = await db.selectDistinct({
    sourceId: programs.sourceId,
    sourceName: programs.sourceName,
    sourceUrl: programs.sourceUrl
  }).from(programs);

  return rows.filter((row) => row.sourceId || row.sourceName || row.sourceUrl);
};

export interface ProgramFilters {
  search?: string;
  state?: string;
  industries?: string[];
  benefitTypes?: string[];
  statuses?: string[];
  startDate?: string;
  endDate?: string;
  sort?: 'relevance' | 'recent' | 'closing_soon';
}
