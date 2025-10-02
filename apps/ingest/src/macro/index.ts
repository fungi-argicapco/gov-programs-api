import type { MacroIngestionSummary } from './ingest';

import { ingestMacroMetrics as ingestWithSources } from './ingest';
import { MACRO_SOURCES } from './sources';
import type { FetchLike } from './worldbank';

export { MACRO_SOURCES } from './sources';
export type { MacroIngestionSummary } from './ingest';

export async function ingestMacroMetrics(
  env: { DB: D1Database },
  opts: { fetchImpl?: FetchLike } = {}
): Promise<MacroIngestionSummary[]> {
  return ingestWithSources(env, MACRO_SOURCES, opts);
}
