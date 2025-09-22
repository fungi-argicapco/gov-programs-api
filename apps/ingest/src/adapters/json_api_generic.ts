import { upsertPrograms } from '../upsert';

export async function ingestJsonApiGeneric(env: { DB: D1Database }, opts: {
  url: string; path?: string; map: (row: any)=>{
    title: string; summary?: string; url?: string;
    status?: 'open'|'scheduled'|'closed'|'unknown';
    benefit_type?: 'grant'|'rebate'|'tax_credit'|'loan'|'guarantee'|'voucher'|'other';
    industry_codes?: string[];
    start_date?: string; end_date?: string;
  };
  country: 'US'|'CA'; authority: string; jurisdiction: string; limit?: number;
}) {
  const res = await fetch(opts.url);
  const json = await res.json();
  const rows = opts.path ? opts.path.split('.').reduce((acc: any, k: string)=>acc?.[k], json) : json;
  const arr = Array.isArray(rows) ? rows : [];
  const payload = arr.slice(0, opts.limit ?? 200).map((raw) => {
    const m = opts.map(raw);
    return {
      country_code: opts.country,
      authority_level: opts.authority as any,
      jurisdiction_code: opts.jurisdiction,
      title: m.title,
      summary: m.summary,
      url: m.url,
      status: m.status ?? 'unknown',
      benefit_type: m.benefit_type,
      industry_codes: m.industry_codes,
      start_date: m.start_date,
      end_date: m.end_date
    };
  });
  await upsertPrograms(env, payload as any);
}
