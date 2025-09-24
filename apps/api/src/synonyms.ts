import type { Env } from './db';

export async function loadSynonyms(env: Env): Promise<Record<string, string[]>> {
  if (!env.LOOKUPS_KV) {
    return {};
  }
  try {
    const stored = await env.LOOKUPS_KV.get('syn:terms', 'json');
    if (!Array.isArray(stored)) {
      return {};
    }
    const map = new Map<string, Set<string>>();
    for (const entry of stored) {
      if (!Array.isArray(entry) || entry.length < 2) continue;
      const from = String(entry[0]).toLowerCase();
      const to = String(entry[1]).toLowerCase();
      if (!from || !to) continue;
      if (!map.has(from)) {
        map.set(from, new Set<string>());
      }
      map.get(from)?.add(to);
    }
    const result: Record<string, string[]> = {};
    for (const [key, values] of map.entries()) {
      result[key] = Array.from(values);
    }
    return result;
  } catch (err) {
    console.warn('synonyms_lookup_failed', err);
    return {};
  }
}
