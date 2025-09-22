import { upsertPrograms } from '../upsert';
import { MAPPERS } from './mappers';

type IngestEnv = { DB: D1Database; RAW_R2?: R2Bucket; LOOKUPS_KV?: KVNamespace };

type Mapper = (row: any) => {
  title: string;
  summary?: string;
  url?: string;
  status?: 'open' | 'scheduled' | 'closed' | 'unknown';
  benefit_type?: 'grant' | 'rebate' | 'tax_credit' | 'loan' | 'guarantee' | 'voucher' | 'other';
  industry_codes?: string[];
  start_date?: string;
  end_date?: string;
  benefits?: { type: string; min_amount_cents?: number | null; max_amount_cents?: number | null; currency_code?: string; notes?: string }[];
  criteria?: { kind: string; operator: string; value: string }[];
  tags?: string[];
  source_id?: number;
};

type JsonApiResult = {
  attempted: number;
  outcomes: Awaited<ReturnType<typeof upsertPrograms>>;
};

const resolveMapper = (map?: Mapper, mapFn?: string): Mapper => {
  if (map) return map;
  if (mapFn && MAPPERS[mapFn]) return MAPPERS[mapFn];
  return (row: any) => ({
    title: row?.title ?? 'Untitled Program',
    summary: row?.summary ?? row?.description,
    url: row?.url
  });
};

export async function ingestJsonApiGeneric(env: IngestEnv, opts: {
  url: string;
  path?: string;
  data?: unknown;
  map?: Mapper;
  mapFn?: string;
  country: 'US' | 'CA';
  authority: string;
  jurisdiction: string;
  limit?: number;
  sourceId?: number;
}): Promise<JsonApiResult> {
  const mapper = resolveMapper(opts.map, opts.mapFn);
  const json = opts.data ?? await (await fetch(opts.url)).json();
  const rows = opts.path ? opts.path.split('.').reduce((acc: any, k: string) => acc?.[k], json) : json;
  const arr = Array.isArray(rows) ? rows : [];
  const payload = arr.slice(0, opts.limit ?? 200).map((raw) => {
    const mapped = mapper(raw);
    return {
      adapter: 'json_api_generic',
      source_url: opts.url,
      raw,
      program: {
        country_code: opts.country,
        authority_level: opts.authority as any,
        jurisdiction_code: opts.jurisdiction,
        title: mapped.title,
        summary: mapped.summary,
        url: mapped.url,
        status: (mapped.status as any) ?? 'unknown',
        benefit_type: mapped.benefit_type,
        industry_codes: mapped.industry_codes,
        start_date: mapped.start_date,
        end_date: mapped.end_date,
        benefits: mapped.benefits ?? [],
        criteria: mapped.criteria ?? [],
        tags: mapped.tags ?? [],
        source_id: mapped.source_id ?? opts.sourceId
      }
    };
  });
  const outcomes = await upsertPrograms(env, payload as any);
  return { attempted: payload.length, outcomes };
}
