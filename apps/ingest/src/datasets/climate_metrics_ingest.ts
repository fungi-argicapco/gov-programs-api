import type { D1Database } from '@cloudflare/workers-types';

import {
  CLIMATE_ISO_CROSSWALK,
  CLIMATE_METRIC_SERVICES,
  CLIMATE_METRICS_SEED_VERSION,
  NRI_COUNTY_METRICS,
  type NdGainMetric,
  type AqueductCountryMetric,
  type AqueductProvinceMetric,
  type InformGlobalMetric,
  type InformSubnationalMetric,
  type EpiMetric,
  type UnepMetric
} from './climate_metrics';
import { loadClimateSourceData, sha256Hex } from './climate_fetch';
import { stableStringify } from '../util/json';
import {
  getLatestDatasetSnapshot,
  recordDatasetSnapshot,
  upsertDatasetServices,
  type DatasetIngestSummary
} from './utils';

export const CLIMATE_METRICS_DATASET_ID = 'climate_esg_metrics';
export const CLIMATE_METRICS_VERSION = CLIMATE_METRICS_SEED_VERSION;
const DATASET_ID = CLIMATE_METRICS_DATASET_ID;
const VERSION = CLIMATE_METRICS_VERSION;

const now = () => Date.now();

type InsertClimateCountry = {
  indicator: string;
  countryIso3: string;
  year: number | null;
  value: number | null;
  unit?: string | null;
  metadata?: Record<string, unknown> | null;
};

type InsertClimateSubnational = {
  indicator: string;
  countryIso3: string;
  adminLevel: string;
  adminCode: string;
  isoCode?: string | null;
  year: number | null;
  value: number | null;
  unit?: string | null;
  metadata?: Record<string, unknown> | null;
};

type CrosswalkEntry = {
  countryIso3: string;
  adminCode: string;
  adminName: string;
  adminLevel: string;
  iso31662: string | null;
};

function buildCrosswalkMap(): Map<string, CrosswalkEntry> {
  const map = new Map<string, CrosswalkEntry>();
  for (const entry of CLIMATE_ISO_CROSSWALK) {
    map.set(`${entry.countryIso3}:${entry.adminCode}`, entry);
  }
  return map;
}

async function deleteExistingCountry(env: { DB: D1Database }, source: string): Promise<void> {
  await env.DB.prepare(
    `DELETE FROM climate_country_metrics WHERE dataset_id = ? AND source = ? AND version = ?`
  )
    .bind(DATASET_ID, source, VERSION)
    .run();
}

async function deleteExistingSubnational(env: { DB: D1Database }, source: string): Promise<void> {
  await env.DB.prepare(
    `DELETE FROM climate_subnational_metrics WHERE dataset_id = ? AND source = ? AND version = ?`
  )
    .bind(DATASET_ID, source, VERSION)
    .run();
}

async function insertCountryMetrics(env: { DB: D1Database }, rows: InsertClimateCountry[], source: string) {
  await deleteExistingCountry(env, source);
  if (rows.length === 0) return;
  const timestamp = now();
  const insertSql =
    `INSERT INTO climate_country_metrics (dataset_id, indicator, country_iso3, year, value, unit, metadata, version, source, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  const statements = rows.map((record) =>
    env.DB.prepare(insertSql).bind(
      DATASET_ID,
      record.indicator,
      record.countryIso3,
      record.year,
      record.value,
      record.unit ?? null,
      record.metadata ? stableStringify(record.metadata) : null,
      VERSION,
      source,
      timestamp,
      timestamp
    )
  );
  await env.DB.batch(statements);
}

async function insertSubnationalMetrics(
  env: { DB: D1Database },
  rows: InsertClimateSubnational[],
  source: string
) {
  await deleteExistingSubnational(env, source);
  if (rows.length === 0) return;
  const timestamp = now();
  const insertSql =
    `INSERT INTO climate_subnational_metrics (dataset_id, indicator, country_iso3, admin_level, admin_code, iso_code, year, value, unit, metadata, version, source, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  const statements = rows.map((record) =>
    env.DB.prepare(insertSql).bind(
      DATASET_ID,
      record.indicator,
      record.countryIso3,
      record.adminLevel,
      record.adminCode,
      record.isoCode ?? null,
      record.year,
      record.value,
      record.unit ?? null,
      record.metadata ? stableStringify(record.metadata) : null,
      VERSION,
      source,
      timestamp,
      timestamp
    )
  );
  await env.DB.batch(statements);
}

function buildNdGainCountryMetrics(metrics: readonly NdGainMetric[]): InsertClimateCountry[] {
  const records: InsertClimateCountry[] = [];
  for (const entry of metrics) {
    if (entry.index !== null) {
      records.push({
        indicator: 'nd_gain_index',
        countryIso3: entry.iso3,
        year: entry.year,
        value: entry.index
      });
    }
    if (entry.vulnerability !== null) {
      records.push({
        indicator: 'nd_gain_vulnerability',
        countryIso3: entry.iso3,
        year: entry.year,
        value: entry.vulnerability
      });
    }
    if (entry.readiness !== null) {
      records.push({
        indicator: 'nd_gain_readiness',
        countryIso3: entry.iso3,
        year: entry.year,
        value: entry.readiness
      });
    }
  }
  return records;
}

function buildAqueductCountryMetrics(metrics: readonly AqueductCountryMetric[]): InsertClimateCountry[] {
  return metrics.map((entry) => ({
    indicator: entry.indicator,
    countryIso3: entry.iso3,
    year: 2023,
    value: entry.value
  }));
}

function buildAqueductProvinceMetrics(metrics: readonly AqueductProvinceMetric[]): InsertClimateSubnational[] {
  return metrics.map((entry) => ({
    indicator: entry.indicator,
    countryIso3: entry.countryIso3,
    adminLevel: 'province',
    adminCode: entry.provinceCode,
    isoCode: entry.isoCode ?? entry.provinceCode,
    year: 2023,
    value: entry.value,
    metadata: { province_name: entry.provinceName }
  }));
}

function buildNriCountyMetrics(): InsertClimateSubnational[] {
  return NRI_COUNTY_METRICS.map((entry) => ({
    indicator: 'nri_expected_annual_loss',
    countryIso3: entry.countryIso3,
    adminLevel: 'county',
    adminCode: entry.countyFips,
    isoCode: `${entry.stateIso}-${entry.countyFips}`,
    year: entry.year,
    value: entry.ealTotal,
    metadata: {
      social_vulnerability: entry.socialVulnerability,
      community_resilience: entry.communityResilience,
      county_name: entry.countyName
    }
  }));
}

function buildInformCountryMetrics(metrics: readonly InformGlobalMetric[]): InsertClimateCountry[] {
  const rows: InsertClimateCountry[] = [];
  for (const entry of metrics) {
    if (entry.riskScore !== null) {
      rows.push({ indicator: 'inform_risk_score', countryIso3: entry.iso3, year: entry.year, value: entry.riskScore });
    }
    if (entry.hazardExposure !== null) {
      rows.push({
        indicator: 'inform_hazard_exposure',
        countryIso3: entry.iso3,
        year: entry.year,
        value: entry.hazardExposure
      });
    }
    if (entry.vulnerability !== null) {
      rows.push({
        indicator: 'inform_vulnerability',
        countryIso3: entry.iso3,
        year: entry.year,
        value: entry.vulnerability
      });
    }
    if (entry.copingCapacity !== null) {
      rows.push({
        indicator: 'inform_coping_capacity',
        countryIso3: entry.iso3,
        year: entry.year,
        value: entry.copingCapacity
      });
    }
  }
  return rows;
}

function buildInformSubnationalMetrics(
  metrics: readonly InformSubnationalMetric[],
  crosswalk: Map<string, CrosswalkEntry>
): InsertClimateSubnational[] {
  const rows: InsertClimateSubnational[] = [];
  for (const entry of metrics) {
    const key = `${entry.countryIso3}:${entry.adminCode}`;
    const mapped = crosswalk.get(key);
    const isoCode = entry.isoCode ?? mapped?.iso31662 ?? null;
    const base = {
      countryIso3: entry.countryIso3,
      adminLevel: mapped?.adminLevel ?? 'admin1',
      adminCode: entry.adminCode,
      isoCode,
      year: entry.year,
      metadata: { admin_name: entry.adminName }
    };
    if (entry.riskScore !== null) {
      rows.push({ ...base, indicator: 'inform_subnational_risk_score', value: entry.riskScore });
    }
    if (entry.hazardExposure !== null) {
      rows.push({ ...base, indicator: 'inform_subnational_hazard_exposure', value: entry.hazardExposure });
    }
    if (entry.vulnerability !== null) {
      rows.push({ ...base, indicator: 'inform_subnational_vulnerability', value: entry.vulnerability });
    }
    if (entry.copingCapacity !== null) {
      rows.push({ ...base, indicator: 'inform_subnational_coping_capacity', value: entry.copingCapacity });
    }
  }
  return rows;
}

function buildEpiCountryMetrics(metrics: readonly EpiMetric[]): InsertClimateCountry[] {
  const rows: InsertClimateCountry[] = [];
  for (const entry of metrics) {
    if (entry.epiScore !== null) {
      rows.push({ indicator: 'epi_score', countryIso3: entry.iso3, year: entry.year, value: entry.epiScore });
    }
    if (entry.climatePolicyScore !== null) {
      rows.push({
        indicator: 'epi_climate_policy_score',
        countryIso3: entry.iso3,
        year: entry.year,
        value: entry.climatePolicyScore
      });
    }
    if (entry.biodiversityScore !== null) {
      rows.push({
        indicator: 'epi_biodiversity_score',
        countryIso3: entry.iso3,
        year: entry.year,
        value: entry.biodiversityScore
      });
    }
  }
  return rows;
}

function buildUnepCountryMetrics(metrics: readonly UnepMetric[]): InsertClimateCountry[] {
  return metrics.map((entry) => ({
    indicator: `${entry.metric}`,
    countryIso3: entry.countryIso3,
    year: entry.year,
    value: entry.value,
    unit: entry.unit ?? null,
    metadata: {
      admin_level: entry.adminLevel,
      unit_code: entry.unitCode,
      unit_name: entry.unitName
    }
  }));
}

function buildUnepSubnationalMetrics(
  metrics: readonly UnepMetric[],
  crosswalk: Map<string, CrosswalkEntry>
): InsertClimateSubnational[] {
  return metrics.map((entry) => {
    const key = `${entry.countryIso3}:${entry.unitCode}`;
    const match = crosswalk.get(key);
    return {
      indicator: `${entry.metric}`,
      countryIso3: entry.countryIso3,
      adminLevel: match?.adminLevel ?? entry.adminLevel ?? 'admin1',
      adminCode: entry.unitCode,
      isoCode: entry.isoCode ?? match?.iso31662 ?? null,
      year: entry.year,
      value: entry.value,
      unit: entry.unit ?? null,
      metadata: {
        unit_name: entry.unitName,
        admin_level: entry.adminLevel
      }
    };
  });
}

export async function ingestClimateMetrics(env: { DB: D1Database; RAW_R2?: R2Bucket }): Promise<DatasetIngestSummary> {
  const climate = await loadClimateSourceData(env);
  const crosswalk = buildCrosswalkMap();

  const ndGainCountry = buildNdGainCountryMetrics(climate.ndGain.metrics);
  const aqueductCountry = buildAqueductCountryMetrics(climate.aqueductCountry.metrics);
  const aqueductProvince = buildAqueductProvinceMetrics(climate.aqueductProvince.metrics);
  const nriCounties = buildNriCountyMetrics();
  const informCountry = buildInformCountryMetrics(climate.informGlobal.metrics);
  const informSubnational = buildInformSubnationalMetrics(climate.informSubnational.metrics, crosswalk);
  const epiCountry = buildEpiCountryMetrics(climate.epi.metrics);
  const unepCountry = buildUnepCountryMetrics(climate.unepCountry.metrics);
  const unepSubnational = buildUnepSubnationalMetrics(climate.unepSubnational.metrics, crosswalk);

  const hashes = {
    nd_gain: climate.ndGain.hash,
    aqueduct_country: climate.aqueductCountry.hash,
    aqueduct_province: climate.aqueductProvince.hash,
    inform_global: climate.informGlobal.hash,
    inform_subnational: climate.informSubnational.hash,
    yale_epi: climate.epi.hash,
    unep_country: climate.unepCountry.hash,
    unep_subnational: climate.unepSubnational.hash,
    nri_county: await sha256Hex(stableStringify(NRI_COUNTY_METRICS))
  };

  const previousSnapshot = await getLatestDatasetSnapshot(env, DATASET_ID);
  const previousHashes = previousSnapshot?.payload?.hashes ? stableStringify(previousSnapshot.payload.hashes) : null;
  const currentHashes = stableStringify(hashes);

  await upsertDatasetServices(
    env,
    DATASET_ID,
    VERSION,
    CLIMATE_METRIC_SERVICES.map((service) => ({
      serviceName: service.serviceName,
      endpoint: service.endpoint,
      httpMethods: service.httpMethods,
      parameters: service.parameters,
      authentication: service.authentication,
      rateLimit: service.rateLimit,
      cadence: service.cadence,
      changeDetection: service.changeDetection,
      statusPage: service.statusPage,
      readiness: service.readiness,
      notes: service.notes,
      sourceUrl: service.sourceUrl,
      verificationDate: service.verificationDate
    }))
  );

  if (previousHashes && previousHashes === currentHashes) {
    return {
      datasetId: DATASET_ID,
      version: VERSION,
      tables: [
        { table: 'climate_country_metrics', inserted: 0, updated: 0, skipped: ndGainCountry.length + aqueductCountry.length + informCountry.length + epiCountry.length + unepCountry.length, errors: [] },
        { table: 'climate_subnational_metrics', inserted: 0, updated: 0, skipped: aqueductProvince.length + nriCounties.length + informSubnational.length + unepSubnational.length, errors: [] }
      ]
    };
  }

  await insertCountryMetrics(env, ndGainCountry, 'nd_gain');
  await insertCountryMetrics(env, aqueductCountry, 'wri_aqueduct');
  await insertSubnationalMetrics(env, aqueductProvince, 'wri_aqueduct_province');
  await insertSubnationalMetrics(env, nriCounties, 'fema_nri_county');
  await insertCountryMetrics(env, informCountry, 'inform_global');
  await insertSubnationalMetrics(env, informSubnational, 'inform_subnational');
  await insertCountryMetrics(env, epiCountry, 'yale_epi');
  await insertCountryMetrics(env, unepCountry, 'unep_surface_water');
  await insertSubnationalMetrics(env, unepSubnational, 'unep_surface_water_subnational');

  await recordDatasetSnapshot(env, DATASET_ID, VERSION, {
    hashes,
    sources: {
      nd_gain: climate.ndGain.source,
      aqueduct_country: climate.aqueductCountry.source,
      aqueduct_province: climate.aqueductProvince.source,
      inform_global: climate.informGlobal.source,
      inform_subnational: climate.informSubnational.source,
      yale_epi: climate.epi.source,
      unep_country: climate.unepCountry.source,
      unep_subnational: climate.unepSubnational.source,
      nri_county: 'seed'
    },
    counts: {
      nd_gain_country: ndGainCountry.length,
      aqueduct_country: aqueductCountry.length,
      aqueduct_province: aqueductProvince.length,
      nri_county: nriCounties.length,
      inform_country: informCountry.length,
      inform_subnational: informSubnational.length,
      epi_country: epiCountry.length,
      unep_country: unepCountry.length,
      unep_subnational: unepSubnational.length
    }
  });

  return {
    datasetId: DATASET_ID,
    version: VERSION,
    tables: [
      {
        table: 'climate_country_metrics',
        inserted:
          ndGainCountry.length +
          aqueductCountry.length +
          informCountry.length +
          epiCountry.length +
          unepCountry.length,
        updated: 0,
        skipped: 0,
        errors: []
      },
      {
        table: 'climate_subnational_metrics',
        inserted: aqueductProvince.length + nriCounties.length + informSubnational.length + unepSubnational.length,
        updated: 0,
        skipped: 0,
        errors: []
      }
    ]
  };
}
