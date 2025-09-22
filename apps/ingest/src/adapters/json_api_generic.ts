import { upsertPrograms } from '../upsert';

type IngestEnv = { DB: D1Database; RAW_R2?: R2Bucket };

export async function ingestJsonApiGeneric(env: IngestEnv, opts: {
  url: string; path?: string; data?: unknown;
  map: (row: any)=>{
    title: string; summary?: string; url?: string;
    status?: 'open'|'scheduled'|'closed'|'unknown';
    benefit_type?: 'grant'|'rebate'|'tax_credit'|'loan'|'guarantee'|'voucher'|'other';
    industry_codes?: string[];
    start_date?: string; end_date?: string;
    benefits?: { type: string; min_amount_cents?: number|null; max_amount_cents?: number|null; currency_code?: string; notes?: string }[];
    criteria?: { kind: string; operator: string; value: string }[];
    tags?: string[];
    source_id?: number;
  };
  country: 'US'|'CA'; authority: string; jurisdiction: string; limit?: number;
  sourceId?: number;
}) {
  const json = opts.data ?? await (await fetch(opts.url)).json();
  const rows = opts.path ? opts.path.split('.').reduce((acc: any, k: string)=>acc?.[k], json) : json;
  const arr = Array.isArray(rows) ? rows : [];
  const payload = arr.slice(0, opts.limit ?? 200).map((raw) => {
    const m = opts.map(raw);
    return {
      adapter: 'json_api_generic',
      source_url: opts.url,
      raw,
      program: {
        country_code: opts.country,
        authority_level: opts.authority as any,
        jurisdiction_code: opts.jurisdiction,
        title: m.title,
        summary: m.summary,
        url: m.url,
        status: (m.status as any) ?? 'unknown',
        benefit_type: m.benefit_type,
        industry_codes: m.industry_codes,
        start_date: m.start_date,
        end_date: m.end_date,
        benefits: m.benefits ?? [],
        criteria: m.criteria ?? [],
        tags: m.tags ?? [],
        source_id: m.source_id ?? opts.sourceId
      }
    };
  });
  await upsertPrograms(env, payload as any);
}
