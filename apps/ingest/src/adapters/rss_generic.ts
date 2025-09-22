import * as cheerio from 'cheerio';
import { upsertPrograms } from '../upsert';

export async function ingestRssGeneric(env: { DB: D1Database }, opts: { url: string; country: 'US'|'CA'; authority: string; jurisdiction: string; map?: (item: any)=>Partial<{title:string;summary:string;url:string;status:string}>; limit?: number }) {
  const res = await fetch(opts.url);
  const xml = await res.text();
  const $ = cheerio.load(xml, { xmlMode: true });
  const items = $('item').toArray().slice(0, opts.limit ?? 50);
  const payload = items.map(el => {
    const t = $(el).find('title').first().text().trim();
    const link = $(el).find('link').first().text().trim();
    const desc = $(el).find('description').first().text().trim();
    const mapped = opts.map ? (opts.map({ title: t, link, desc }) || {}) : {};
    return {
      country_code: opts.country,
      authority_level: opts.authority as any,
      jurisdiction_code: opts.jurisdiction,
      title: mapped.title ?? t,
      summary: mapped.summary ?? desc,
      url: mapped.url ?? link,
      status: (mapped.status as any) ?? 'unknown'
    };
  });
  await upsertPrograms(env, payload as any);
}
