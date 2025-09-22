import * as cheerio from 'cheerio';
import { upsertPrograms } from '../upsert';

type IngestEnv = { DB: D1Database; RAW_R2?: R2Bucket };

export async function ingestHtmlTableGeneric(env: IngestEnv, opts: {
  url: string; tableSelector: string; html?: string;
  columns: { title: string; url?: string; summary?: string; start?: string; end?: string; status?: string };
  country: 'US'|'CA'; authority: string; jurisdiction: string; limit?: number;
  sourceId?: number;
}) {
  const html = opts.html ?? await (await fetch(opts.url)).text();
  const $ = cheerio.load(html);
  const rows = $(`${opts.tableSelector} tr`).toArray().slice(1, (opts.limit ?? 200)+1);

  const get = (row: any, sel?: string) => sel ? $(row).find(sel).text().trim() : undefined;
  const aHref = (row: any, sel?: string) => sel ? ($(row).find(sel).attr('href') || '').trim() : undefined;

  const payload = rows.map((r) => {
    const title = get(r, opts.columns.title) || 'Untitled';
    const summaryRaw = get(r, opts.columns.summary);
    const summary = summaryRaw && summaryRaw.trim().length > 0 ? summaryRaw : undefined;
    const startRaw = get(r, opts.columns.start);
    const endRaw = get(r, opts.columns.end);
    const startDate = startRaw && startRaw.trim().length > 0 ? startRaw : undefined;
    const endDate = endRaw && endRaw.trim().length > 0 ? endRaw : undefined;
    return {
      adapter: 'html_table_generic',
      source_url: opts.url,
      raw: $.html(r),
      program: {
        country_code: opts.country,
        authority_level: opts.authority as any,
        jurisdiction_code: opts.jurisdiction,
        title,
        summary,
        url: aHref(r, opts.columns.url),
        start_date: startDate,
        end_date: endDate,
        status: (get(r, opts.columns.status) as any) || 'unknown',
        benefits: [],
        criteria: [],
        tags: [],
        source_id: opts.sourceId
      }
    };
  });
  await upsertPrograms(env, payload as any);
}
