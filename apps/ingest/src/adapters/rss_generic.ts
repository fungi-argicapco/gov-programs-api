import * as cheerio from 'cheerio';
import { upsertPrograms } from '../upsert';

type IngestEnv = { DB: D1Database; RAW_R2?: R2Bucket };

export async function ingestRssGeneric(env: IngestEnv, opts: { url: string; feed?: string; country: 'US'|'CA'; authority: string; jurisdiction: string; map?: (item: any)=>Partial<{title:string;summary:string;url:string;status:string;benefit_type:string;industry_codes:string[];start_date:string;end_date:string;tags:string[]}>; limit?: number; sourceId?: number }) {
  const xml = opts.feed ?? await (await fetch(opts.url)).text();
  const $ = cheerio.load(xml, { xmlMode: true });
  const items = $('item').toArray().slice(0, opts.limit ?? 50);
  const payload = items.map(el => {
    const t = $(el).find('title').first().text().trim();
    const link = $(el).find('link').first().text().trim();
    const desc = $(el).find('description').first().text().trim();
    const mapped = opts.map ? (opts.map({ title: t, link, desc }) || {}) : {};
    return {
      adapter: 'rss_generic',
      source_url: opts.url,
      raw: $.html(el),
      program: {
        country_code: opts.country,
        authority_level: opts.authority as any,
        jurisdiction_code: opts.jurisdiction,
        title: (mapped.title as string) ?? t,
        summary: (mapped.summary as string) ?? desc,
        url: (mapped.url as string) ?? link,
        status: (mapped.status as any) ?? 'unknown',
        benefit_type: mapped.benefit_type as any,
        industry_codes: (mapped.industry_codes as string[]) ?? [],
        start_date: mapped.start_date as string | undefined,
        end_date: mapped.end_date as string | undefined,
        tags: (mapped.tags as string[]) ?? [],
        benefits: [],
        criteria: [],
        source_id: opts.sourceId
      }
    };
  });
  await upsertPrograms(env, payload as any);
}
