import { ingestRssGeneric } from './adapters/rss_generic';
import { ingestHtmlTableGeneric } from './adapters/html_table_generic';
import { ingestJsonApiGeneric } from './adapters/json_api_generic';
import { PHASE1_SOURCES } from '../../../data/sources/phase1';

async function ensureSource(env: { DB: D1Database }, params: {
  name: string;
  url: string;
  license?: string;
  tos_url?: string;
  authority_level: string;
  jurisdiction_code: string;
}): Promise<number> {
  const existing = await env.DB.prepare(
    `SELECT id FROM sources WHERE name = ? AND jurisdiction_code = ? LIMIT 1`
  ).bind(params.name, params.jurisdiction_code).first<{ id: number }>();
  if (existing) {
    await env.DB.prepare(
      `UPDATE sources SET url = ?, license = ?, tos_url = ?, authority_level = ? WHERE id = ?`
    ).bind(params.url, params.license ?? null, params.tos_url ?? null, params.authority_level, existing.id).run();
    return existing.id;
  }
  const result = await env.DB.prepare(
    `INSERT INTO sources (name, url, license, tos_url, authority_level, jurisdiction_code) VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(
    params.name,
    params.url,
    params.license ?? null,
    params.tos_url ?? null,
    params.authority_level,
    params.jurisdiction_code
  ).run();
  if ('meta' in result && result.meta && typeof result.meta.last_row_id === 'number') {
    return result.meta.last_row_id;
  }
  const row = await env.DB.prepare(`SELECT id FROM sources WHERE name = ? AND jurisdiction_code = ? LIMIT 1`)
    .bind(params.name, params.jurisdiction_code)
    .first<{ id: number }>();
  if (!row) throw new Error('failed_to_insert_source');
  return row.id;
}

export default {
  async scheduled(_event: ScheduledEvent, env: { DB: D1Database; RAW_R2?: R2Bucket }, _ctx: ExecutionContext) {
    for (const source of PHASE1_SOURCES) {
      if (!source.enabled) continue;
      const sourceId = await ensureSource(env, {
        name: source.source.name,
        url: source.source.url,
        license: source.source.license,
        tos_url: source.source.tos_url,
        authority_level: source.authority,
        jurisdiction_code: source.jurisdiction
      });
      try {
        switch (source.kind) {
          case 'json':
            await ingestJsonApiGeneric(env, {
              url: source.url,
              data: source.data,
              path: undefined,
              country: source.country,
              authority: source.authority,
              jurisdiction: source.jurisdiction,
              limit: source.limit,
              sourceId,
              map: (row: any) => ({ ...row, source_id: sourceId })
            });
            break;
          case 'html':
            await ingestHtmlTableGeneric(env, {
              url: source.url,
              country: source.country,
              authority: source.authority,
              jurisdiction: source.jurisdiction,
              tableSelector: 'table.programs',
              html: source.html,
              limit: source.limit,
              columns: source.columns,
              sourceId
            });
            break;
          case 'rss':
            await ingestRssGeneric(env, {
              url: source.url,
              feed: source.feed,
              country: source.country,
              authority: source.authority,
              jurisdiction: source.jurisdiction,
              limit: source.limit,
              sourceId
            });
            break;
        }
      } catch (err) {
        console.error('ingest_error', { source: source.url, kind: source.kind, err });
      }
    }
  }
};
