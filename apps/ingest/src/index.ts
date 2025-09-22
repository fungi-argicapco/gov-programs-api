import type { Adapter, ProgramT } from '@common/types';
import { createDb } from '@db';
import { htmlTableGenericAdapter, jsonApiGenericAdapter, rssGenericAdapter } from './adapters';
import { persistProgram } from './persistence';

export interface SourceConfig {
  id: string;
  url: string;
  adapter?: Adapter['name'];
  metadata?: Record<string, unknown>;
}

export interface Env {
  DB: D1Database;
  RAW_R2: R2Bucket;
}

const adapters: Adapter[] = [rssGenericAdapter, htmlTableGenericAdapter, jsonApiGenericAdapter];

const adapterByName = new Map(adapters.map((adapter) => [adapter.name, adapter] as const));

const SOURCES: SourceConfig[] = [];
export const sources = SOURCES;

export const registerSource = (source: SourceConfig) => {
  SOURCES.push(source);
};

export const clearSources = () => {
  SOURCES.splice(0, SOURCES.length);
};

const resolveAdapter = (source: SourceConfig) => {
  if (source.adapter) {
    return adapterByName.get(source.adapter) ?? null;
  }
  return adapters.find((adapter) => adapter.supports(source.url)) ?? null;
};

const putRawSnapshot = async (env: Env, source: SourceConfig, payload: unknown) => {
  const key = `${source.id}/${Date.now()}.json`;
  await env.RAW_R2.put(key, JSON.stringify(payload, null, 2), {
    httpMetadata: { contentType: 'application/json' }
  });
};

const upsertPrograms = async (env: Env, source: SourceConfig, programs: ProgramT[], raw: unknown) => {
  const db = createDb(env.DB);
  for (const program of programs) {
    await persistProgram(env, program, db);
  }
  await putRawSnapshot(env, source, raw);
};

export default {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    for (const source of SOURCES) {
      const adapter = resolveAdapter(source);
      if (!adapter) {
        console.warn(`No adapter found for source ${source.id}`);
        continue;
      }
      ctx.waitUntil((async () => {
        try {
          const { programs, raw } = await adapter.execute(source.url, { fetch });
          await upsertPrograms(env, source, programs, raw);
        } catch (error) {
          console.error(`Failed to ingest ${source.id}`, error);
        }
      })());
    }
  }
};
