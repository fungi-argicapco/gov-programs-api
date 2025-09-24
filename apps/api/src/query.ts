const MAX_INDUSTRY_CODES = 100;

type Filters = {
  q?: string;
  country?: string;
  jurisdiction?: string;            // e.g., US-WA or CA-ON
  industry?: string[];              // NAICS codes
  benefitType?: string[];
  status?: string[];
  from?: string;                    // YYYY-MM-DD
  to?: string;                      // YYYY-MM-DD
  sort?: 'updated_at'|'-updated_at'|'title'|'-title';
  limit?: number;
  offset?: number;
};

export function buildProgramsQuery(f: Filters) {
  const where: string[] = [];
  const params: any[] = [];

  if (f.q && f.q.trim()) {
    where.push(`rowid IN (SELECT rowid FROM programs_fts WHERE programs_fts MATCH ?)`);
    params.push(f.q.trim());
  }
  if (f.country) { where.push(`country_code = ?`); params.push(f.country); }
  if (f.jurisdiction) { where.push(`jurisdiction_code = ?`); params.push(f.jurisdiction); }

  if (Array.isArray(f.industry) && f.industry.length > 0) {
    // Limit the number of industry codes to prevent excessively large queries
    if (f.industry.length > MAX_INDUSTRY_CODES) {
      throw new Error(`Too many industry codes: received ${f.industry.length}, maximum allowed is ${MAX_INDUSTRY_CODES}`);
    }
    const industryCodes = f.industry.slice(0, MAX_INDUSTRY_CODES);
    if (industryCodes.length > 0) {
      where.push(`EXISTS (SELECT 1 FROM json_each(programs.industry_codes) WHERE value IN (${industryCodes.map(() => '?').join(',')}))`);
      params.push(...industryCodes);
    }
  }
  if (f.benefitType?.length) {
    where.push(`benefit_type IN (${f.benefitType.map(()=>'?').join(',')})`);
    params.push(...f.benefitType);
  }
  if (f.status?.length) {
    where.push(`status IN (${f.status.map(()=>'?').join(',')})`);
    params.push(...f.status);
  }
  if (f.from) { where.push(`(end_date IS NULL OR end_date >= ?)`); params.push(f.from); }
  if (f.to)   { where.push(`(start_date IS NULL OR start_date <= ?)`); params.push(f.to); }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  let orderBy = `ORDER BY updated_at DESC`;
  if (f.sort === 'title') orderBy = `ORDER BY title ASC`;
  if (f.sort === '-title') orderBy = `ORDER BY title DESC`;
  if (f.sort === 'updated_at') orderBy = `ORDER BY updated_at ASC`;
  if (f.sort === '-updated_at') orderBy = `ORDER BY updated_at DESC`;

  const limit = Math.max(1, Math.min(f.limit ?? 25, 500));
  const offset = Math.max(0, f.offset ?? 0);

  const sql = `
    SELECT id, uid, country_code, authority_level, jurisdiction_code, title, summary,
           benefit_type, status, industry_codes, start_date, end_date, url, source_id,
           created_at, updated_at
    FROM programs
    ${whereSql}
    ${orderBy}
    LIMIT ${limit} OFFSET ${offset};
  `.trim();

  const countSql = `
    SELECT count(*) as total FROM programs ${whereSql};
  `.trim();

  return { sql, countSql, params };
}
