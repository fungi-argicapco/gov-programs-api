import { normalizeToProgram, NormalizedProgram } from './normalize';

export async function upsertPrograms(env: { DB: D1Database }, items: Omit<NormalizedProgram,'uid'>[]) {
  for (const it of items) {
    const p = await normalizeToProgram(it);
    const now = Date.now();
    await env.DB.prepare(`
      INSERT INTO programs (uid, country_code, authority_level, jurisdiction_code, title, summary, benefit_type, status, industry_codes, start_date, end_date, url, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, json(?), ?, ?, ?, ?, ?)
      ON CONFLICT(uid) DO UPDATE SET
        summary=excluded.summary,
        benefit_type=excluded.benefit_type,
        status=excluded.status,
        industry_codes=excluded.industry_codes,
        start_date=excluded.start_date,
        end_date=excluded.end_date,
        url=excluded.url,
        updated_at=excluded.updated_at
    `).bind(
      p.uid, p.country_code, p.authority_level, p.jurisdiction_code, p.title, p.summary ?? null, p.benefit_type ?? null, p.status,
      JSON.stringify(p.industry_codes || []), p.start_date ?? null, p.end_date ?? null, p.url ?? null, now, now
    ).run();
  }
}
