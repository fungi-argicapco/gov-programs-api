const SIC_KV_KEY = 'xwalk:sic_naics:v1';
const FX_KV_KEY = 'currency:rates:v1';

type LookupEnv = { LOOKUPS_KV?: KVNamespace };

async function loadJsonFromKv<T>(env: LookupEnv | undefined, key: string): Promise<T | null> {
  if (!env?.LOOKUPS_KV) return null;
  try {
    const value = await env.LOOKUPS_KV.get(key, 'json');
    if (value && typeof value === 'object') {
      return value as T;
    }
  } catch (err) {
    console.warn('lookup_kv_error', key, err);
  }
  return null;
}

async function loadSampleJson<T>(path: string): Promise<T> {
  if (typeof process === 'object' && typeof process.cwd === 'function') {
    const module = await import(path, { assert: { type: 'json' } });
    return (module.default ?? module) as T;
  }
  return {} as T;
}

export async function loadSicNaics(env: LookupEnv): Promise<Record<string, string[]>> {
  const fromKv = await loadJsonFromKv<Record<string, string[]>>(env, SIC_KV_KEY);
  if (fromKv) return fromKv;
  return loadSampleJson<Record<string, string[]>>('../../../data/lookups/crosswalk.sic_naics.sample.json');
}

export async function loadFxToUSD(env: LookupEnv): Promise<Record<string, number>> {
  const fromKv = await loadJsonFromKv<Record<string, number>>(env, FX_KV_KEY);
  if (fromKv) return fromKv;
  return loadSampleJson<Record<string, number>>('../../../data/lookups/currency.rates.sample.json');
}

export async function mapSicToNaics(env: LookupEnv, sicCodes: string[]): Promise<string[]> {
  if (!Array.isArray(sicCodes) || sicCodes.length === 0) return [];
  const lookup = await loadSicNaics(env);
  const result = new Set<string>();
  for (const code of sicCodes) {
    const matches = lookup[code];
    if (!Array.isArray(matches)) continue;
    for (const value of matches) {
      if (typeof value === 'string' && value.trim()) {
        result.add(value);
      }
    }
  }
  return Array.from(result);
}
