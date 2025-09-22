import { ingestRssGeneric } from './adapters/rss_generic';
import { ingestHtmlTableGeneric } from './adapters/html_table_generic';
import { ingestJsonApiGeneric } from './adapters/json_api_generic';

export default {
  async scheduled(_event: ScheduledEvent, env: { DB: D1Database }, _ctx: ExecutionContext) {
    // Example stubs (safe no-op if unreachable); replace with real sources.
    try {
      await ingestRssGeneric(env, {
        url: 'https://example.org/feed', country: 'US', authority: 'state', jurisdiction: 'US-WA', limit: 0
      });
    } catch {}
    try {
      await ingestHtmlTableGeneric(env, {
        url: 'https://example.org/table', tableSelector: 'table.programs',
        columns: { title: 'td:nth-child(1) a', url: 'td:nth-child(1) a', summary: 'td:nth-child(2)' },
        country: 'US', authority: 'state', jurisdiction: 'US-CA', limit: 0
      });
    } catch {}
    try {
      await ingestJsonApiGeneric(env, {
        url: 'https://example.org/api/programs', path: 'data',
        map: (r:any)=>({ title: r.title, summary: r.summary, url: r.url }),
        country: 'CA', authority: 'prov', jurisdiction: 'CA-ON', limit: 0
      });
    } catch {}
  }
};
