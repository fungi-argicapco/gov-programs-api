import type { D1Database } from '@cloudflare/workers-types';

import type { NormalizedProgram } from './normalize';

type EnrichEnv = {
  LOOKUPS_KV?: KVNamespace;
  DB?: D1Database;
};

type NaicsEntry = {
  code: string;
  synonyms: string[];
};

type CachedLookup = {
  ts: number;
  entries: NaicsEntry[];
};

type IndustryMappingEntry = {
  tags: string[];
  confidence: number | null;
};

const MAX_CODES = 6;
const CACHE_TTL_MS = 5 * 60 * 1000;

let lookupCache: CachedLookup | null = null;
let lookupCacheSource: 'kv' | 'fallback' | null = null;
let mappingCache: { ts: number; entries: Map<string, IndustryMappingEntry> } | null = null;
let mappingCacheStatus: 'ok' | 'error' | null = null;

async function loadSampleLookup(): Promise<NaicsEntry[]> {
  try {
    const module = await import('../../../data/lookups/naics.sample.json', { with: { type: 'json' } });
    const data = module.default ?? module;
    if (Array.isArray(data)) {
      return data
        .map((entry: any) => ({
          code: String(entry.code ?? entry.naics ?? ''),
          synonyms: Array.isArray(entry.synonyms)
            ? entry.synonyms
                .map((value: any) => String(value ?? '').toLowerCase())
                .filter((token: string) => token.length > 2)
            : []
        }))
        .filter((entry) => entry.code && entry.synonyms.length > 0);
    }
    if (data && typeof data === 'object') {
      return Object.entries(data as Record<string, string | string[] | { synonyms?: string[] }>)
        .map(([code, value]) => {
          if (Array.isArray(value)) {
            return {
              code,
              synonyms: value
                .map((v) => String(v).toLowerCase())
                .filter((token) => token.length > 2)
            };
          }
          if (typeof value === 'string') {
            return {
              code,
              synonyms: value
                .toLowerCase()
                .split(/\s+/)
                .filter((token) => token.length > 2)
            };
          }
          if (value && typeof value === 'object' && Array.isArray(value.synonyms)) {
            return {
              code,
              synonyms: value.synonyms
                .map((v) => String(v).toLowerCase())
                .filter((token) => token.length > 2)
            };
          }
          return { code, synonyms: [] };
        })
        .filter((entry) => entry.code && entry.synonyms.length > 0);
    }
  } catch (err) {
    console.warn('enrich_naics_sample_load_failed', err);
  }
  return [];
}

async function loadLookup(env: EnrichEnv): Promise<NaicsEntry[]> {
  const hasValidCache = lookupCache !== null && Date.now() - lookupCache.ts < CACHE_TTL_MS;
  if (lookupCache && hasValidCache && (!env.LOOKUPS_KV || lookupCacheSource === 'kv')) {
    return lookupCache.entries;
  }

  let entries: NaicsEntry[] = [];
  if (env.LOOKUPS_KV) {
    try {
      const raw = await env.LOOKUPS_KV.get('naics:synonyms:v1', 'json');
      if (raw) {
        entries = Array.isArray(raw)
          ? raw
          : Object.entries(raw as Record<string, string[] | { code: string; synonyms: string[] }>)
              .map(([code, value]) => {
                if (Array.isArray(value)) return { code, synonyms: value };
                return { code: value.code ?? code, synonyms: value.synonyms ?? [] };
              });
      }
    } catch (err) {
      console.warn('enrich_naics_kv_load_failed', err);
    }
  }

  if (entries.length === 0) {
    entries = await loadSampleLookup();
    lookupCacheSource = 'fallback';
  } else {
    lookupCacheSource = 'kv';
  }

  lookupCache = {
    ts: Date.now(),
    entries: entries.map((entry) => ({
      code: entry.code,
      synonyms: Array.isArray(entry.synonyms)
        ? entry.synonyms.map((s) => s.toLowerCase()).filter((token) => token.length > 2)
        : []
    }))
  };
  return lookupCache.entries;
}

function normalizeTags(raw: unknown): string[] {
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((value) => String(value)).filter((value) => value.trim().length > 0);
      }
    } catch {
      // ignore malformed JSON
    }
  }
  if (Array.isArray(raw)) {
    return raw.map((value) => String(value)).filter((value) => value.trim().length > 0);
  }
  return [];
}

async function loadIndustryMappings(env: EnrichEnv): Promise<Map<string, IndustryMappingEntry>> {
  if (!env.DB) {
    return new Map();
  }
  const hasValidCache = mappingCache !== null && Date.now() - mappingCache.ts < CACHE_TTL_MS;
  if (mappingCache && hasValidCache && mappingCacheStatus === 'ok') {
    return mappingCache.entries;
  }

  try {
    const rows = await env.DB.prepare('SELECT naics_code, tags, confidence FROM industry_mappings').all<{
      naics_code: string;
      tags: string | null;
      confidence: number | null;
    }>();

    const map = new Map<string, IndustryMappingEntry>();
    for (const row of rows.results ?? []) {
      if (!row.naics_code) continue;
      const tags = normalizeTags(row.tags);
      map.set(String(row.naics_code), {
        tags,
        confidence: typeof row.confidence === 'number' ? row.confidence : null
      });
    }
    mappingCache = { ts: Date.now(), entries: map };
    mappingCacheStatus = 'ok';
    return map;
  } catch (err) {
    console.warn('enrich_industry_mapping_load_failed', err);
    mappingCache = { ts: Date.now(), entries: new Map() };
    mappingCacheStatus = 'error';
    return mappingCache.entries;
  }
}

function mergeTags(primary: string[], secondary: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const tag of primary) {
    const normalized = tag.trim();
    if (!normalized) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  for (const tag of secondary) {
    const normalized = tag.trim();
    if (!normalized) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

const tokenize = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

export async function enrichNaics(program: NormalizedProgram, env: EnrichEnv): Promise<NormalizedProgram> {
  const entries = await loadLookup(env);
  if (entries.length === 0) {
    return program;
  }
  const haystackParts: string[] = [program.title ?? ''];
  if (program.summary) haystackParts.push(program.summary);
  if (Array.isArray(program.criteria)) {
    for (const c of program.criteria) {
      if (c.value) haystackParts.push(String(c.value));
    }
  }
  if (Array.isArray(program.tags)) {
    haystackParts.push(...program.tags.map((t) => String(t)));
  }
  const haystackTokens = new Set(tokenize(haystackParts.join(' ')));
  const codes = new Set<string>((program.industry_codes ?? []).map((code) => String(code)));
  for (const entry of entries) {
    if (codes.size >= MAX_CODES) break;
    for (const synonym of entry.synonyms) {
      if (haystackTokens.has(synonym.toLowerCase())) {
        codes.add(entry.code);
        break;
      }
    }
  }
  const codeList = Array.from(codes).slice(0, MAX_CODES);

  let derivedTags: string[] = [];
  if (codeList.length > 0) {
    const mappings = await loadIndustryMappings(env);
    const tagSet = new Set<string>();
    for (const code of codeList) {
      const mapping = mappings.get(code);
      if (!mapping) continue;
      for (const tag of mapping.tags) {
        const normalized = String(tag).trim();
        if (normalized) {
          tagSet.add(normalized);
        }
      }
    }
    derivedTags = Array.from(tagSet);
  }

  const mergedTags = mergeTags(program.tags ?? [], derivedTags);
  return {
    ...program,
    industry_codes: codeList,
    tags: mergedTags
  };
}

export function resetEnrichmentCaches(): void {
  lookupCache = null;
  lookupCacheSource = null;
  mappingCache = null;
  mappingCacheStatus = null;
}
