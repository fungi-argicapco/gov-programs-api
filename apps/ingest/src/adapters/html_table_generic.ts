import * as cheerio from 'cheerio';
import { upsertPrograms } from '../upsert';

export async function ingestHtmlTableGeneric(env: { DB: D1Database }, opts: {
  url: string; tableSelector: string;
  columns: { title: string; url?: string; summary?: string; start?: string; end?: string; status?: string };
  country: 'US'|'CA'; authority: string; jurisdiction: string; limit?: number;
}) {
  const res = await fetch(opts.url);
  const html = await res.text();
  const $ = cheerio.load(html);
  const rows = $(`${opts.tableSelector} tr`).toArray().slice(1, (opts.limit ?? 200)+1);

  const get = (row: any, sel?: string) => sel ? $(row).find(sel).text().trim() : undefined;
  const aHref = (row: any, sel?: string) => sel ? ($(row).find(sel).attr('href') || '').trim() : undefined;

  const payload = rows.map((r) => {
    const title = get(r, opts.columns.title) || 'Untitled';
    return {
      country_code: opts.country,
      authority_level: opts.authority as any,
      jurisdiction_code: opts.jurisdiction,
      title,
      summary: get(r, opts.columns.summary),
      url: aHref(r, opts.columns.url),
      start_date: get(r, opts.columns.start),
      end_date: get(r, opts.columns.end),
      status: (get(r, opts.columns.status) as any) || 'unknown'
    };
  });
  await upsertPrograms(env, payload as any);
}
