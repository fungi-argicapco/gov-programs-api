import type { NormalizedProgram } from './normalize';

type EnrichEnv = {
  LOOKUPS_KV?: KVNamespace;
};

type NaicsEntry = {
  code: string;
  synonyms: string[];
};

type CachedLookup = {
  ts: number;
  entries: NaicsEntry[];
};

const MAX_CODES = 6;
let cache: CachedLookup | null = null;

async function loadLookup(env: EnrichEnv): Promise<NaicsEntry[]> {
  if (!env.LOOKUPS_KV) return [];
  const ttlMs = 5 * 60 * 1000;
  if (cache && Date.now() - cache.ts < ttlMs) {
    return cache.entries;
  }
  try {
    const raw = await env.LOOKUPS_KV.get('naics:synonyms:v1', 'json');
    if (!raw) {
      cache = { ts: Date.now(), entries: [] };
      return [];
    }
    const entries = Array.isArray(raw)
      ? raw
      : Object.entries(raw as Record<string, string[] | { code: string; synonyms: string[] }>)
          .map(([code, value]) => {
            if (Array.isArray(value)) return { code, synonyms: value };
            return { code: value.code ?? code, synonyms: value.synonyms ?? [] };
          });
    cache = { ts: Date.now(), entries: entries.map((e) => ({ code: e.code, synonyms: e.synonyms ?? [] })) };
    return cache.entries;
  } catch {
    cache = { ts: Date.now(), entries: [] };
    return [];
  }
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
  return {
    ...program,
    industry_codes: Array.from(codes).slice(0, MAX_CODES)
  };
}
