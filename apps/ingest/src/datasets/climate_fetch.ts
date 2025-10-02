import { stableStringify } from '../util/json';
import {
  ND_GAIN_METRICS,
  AQUEDUCT_COUNTRY_METRICS,
  AQUEDUCT_PROVINCE_METRICS,
  INFORM_GLOBAL_METRICS,
  INFORM_SUBNATIONAL_METRICS,
  EPI_METRICS,
  UNEP_COUNTRY_METRICS,
  UNEP_SUBNATIONAL_METRICS,
  type NdGainMetric,
  type AqueductCountryMetric,
  type AqueductProvinceMetric,
  type InformGlobalMetric,
  type InformSubnationalMetric,
  type EpiMetric,
  type UnepMetric
} from './climate_metrics';

const encoder = new TextEncoder();

type ClimateDataset<T> = {
  metrics: readonly T[];
  hash: string;
  version: string | null;
  source: 'seed' | 'r2';
};

export type ClimateSourceData = {
  ndGain: ClimateDataset<NdGainMetric>;
  aqueductCountry: ClimateDataset<AqueductCountryMetric>;
  aqueductProvince: ClimateDataset<AqueductProvinceMetric>;
  informGlobal: ClimateDataset<InformGlobalMetric>;
  informSubnational: ClimateDataset<InformSubnationalMetric>;
  epi: ClimateDataset<EpiMetric>;
  unepCountry: ClimateDataset<UnepMetric>;
  unepSubnational: ClimateDataset<UnepMetric>;
};

export async function sha256Hex(input: string): Promise<string> {
  try {
    const buf = await crypto.subtle.digest('SHA-256', encoder.encode(input));
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch (error) {
    console.warn('Failed to compute SHA-256 via subtle crypto, falling back to FNV1a hash', error);
    let hash = 0x811c9dc5;
    const view = encoder.encode(input);
    for (let i = 0; i < view.length; i++) {
      hash ^= view[i];
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16);
  }
}

async function loadFromR2<T>(bucket: R2Bucket | undefined, key: string): Promise<ClimateDataset<T> | null> {
  if (!bucket) return null;
  try {
    const object = await bucket.get(key);
    if (!object) return null;
    const body = await object.text();
    const parsed = JSON.parse(body) as { metrics?: T[]; version?: string };
    if (!Array.isArray(parsed.metrics)) {
      console.warn(`[climate-fetch] R2 object ${key} missing metrics array, falling back to seeds.`);
      return null;
    }
    const hash = await sha256Hex(stableStringify(parsed.metrics));
    return {
      metrics: parsed.metrics,
      hash,
      version: parsed.version ?? null,
      source: 'r2'
    };
  } catch (error) {
    console.error(`[climate-fetch] Failed to load ${key} from R2`, error);
    return null;
  }
}

async function fromSeed<T>(metrics: readonly T[], version: string | null): Promise<ClimateDataset<T>> {
  return {
    metrics,
    hash: await sha256Hex(stableStringify(metrics)),
    version,
    source: 'seed'
  };
}

export async function loadClimateSourceData(env: { RAW_R2?: R2Bucket }): Promise<ClimateSourceData> {
  const bucket = env.RAW_R2;

  const ndGain =
    (await loadFromR2<NdGainMetric>(bucket, 'climate/nd_gain.json')) ??
    (await fromSeed(ND_GAIN_METRICS, null));

  const aqueductCountry =
    (await loadFromR2<AqueductCountryMetric>(bucket, 'climate/aqueduct_country.json')) ??
    (await fromSeed(AQUEDUCT_COUNTRY_METRICS, null));

  const aqueductProvince =
    (await loadFromR2<AqueductProvinceMetric>(bucket, 'climate/aqueduct_province.json')) ??
    (await fromSeed(AQUEDUCT_PROVINCE_METRICS, null));

  const informGlobal =
    (await loadFromR2<InformGlobalMetric>(bucket, 'climate/inform_global.json')) ??
    (await fromSeed(INFORM_GLOBAL_METRICS, null));

  const informSubnational =
    (await loadFromR2<InformSubnationalMetric>(bucket, 'climate/inform_subnational.json')) ??
    (await fromSeed(INFORM_SUBNATIONAL_METRICS, null));

  const epi =
    (await loadFromR2<EpiMetric>(bucket, 'climate/yale_epi.json')) ??
    (await fromSeed(EPI_METRICS, null));

  const unepCountry =
    (await loadFromR2<UnepMetric>(bucket, 'climate/unep_country.json')) ??
    (await fromSeed(UNEP_COUNTRY_METRICS, null));

  const unepSubnational =
    (await loadFromR2<UnepMetric>(bucket, 'climate/unep_subnational.json')) ??
    (await fromSeed(UNEP_SUBNATIONAL_METRICS, null));

  return {
    ndGain,
    aqueductCountry,
    aqueductProvince,
    informGlobal,
    informSubnational,
    epi,
    unepCountry,
    unepSubnational
  };
}
