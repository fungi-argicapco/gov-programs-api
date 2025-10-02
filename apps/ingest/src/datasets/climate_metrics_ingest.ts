import type { D1Database } from '@cloudflare/workers-types';

import {
  AQUEDUCT_COUNTRY_METRICS,
  AQUEDUCT_PROVINCE_METRICS,
  CLIMATE_METRIC_SERVICES,
  CLIMATE_METRICS_SEED_VERSION,
  ND_GAIN_METRICS,
  NRI_COUNTY_METRICS
} from './climate_metrics';
import { stableStringify } from '../util/json';
import { recordDatasetSnapshot, upsertDatasetServices, type DatasetIngestSummary } from './utils';

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

function buildNdGainCountryMetrics(): InsertClimateCountry[] {
  const records: InsertClimateCountry[] = [];
  for (const entry of ND_GAIN_METRICS) {
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

function buildAqueductCountryMetrics(): InsertClimateCountry[] {
  return AQUEDUCT_COUNTRY_METRICS.map((entry) => ({
    indicator: entry.indicator,
    countryIso3: entry.iso3,
    year: 2023,
    value: entry.value
  }));
}

function buildAqueductProvinceMetrics(): InsertClimateSubnational[] {
  return AQUEDUCT_PROVINCE_METRICS.map((entry) => ({
    indicator: entry.indicator,
    countryIso3: entry.countryIso3,
    adminLevel: 'province',
    adminCode: entry.provinceCode,
    isoCode: entry.provinceCode,
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

export async function ingestClimateMetrics(env: { DB: D1Database }): Promise<DatasetIngestSummary> {
  const ndGainCountry = buildNdGainCountryMetrics();
  const aqueductCountry = buildAqueductCountryMetrics();
  const aqueductProvince = buildAqueductProvinceMetrics();
  const nriCounties = buildNriCountyMetrics();

  await insertCountryMetrics(env, ndGainCountry, 'nd_gain');
  await insertCountryMetrics(env, aqueductCountry, 'wri_aqueduct');
  await insertSubnationalMetrics(env, aqueductProvince, 'wri_aqueduct_province');
  await insertSubnationalMetrics(env, nriCounties, 'fema_nri_county');

  await recordDatasetSnapshot(env, DATASET_ID, VERSION, {
    nd_gain_records: ndGainCountry.length,
    aqueduct_country_records: aqueductCountry.length,
    aqueduct_province_records: aqueductProvince.length,
    nri_records: nriCounties.length
  });

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

  return {
    datasetId: DATASET_ID,
    version: VERSION,
    tables: [
      {
        table: 'climate_country_metrics',
        inserted: ndGainCountry.length + aqueductCountry.length,
        updated: 0,
        skipped: 0,
        errors: []
      },
      {
        table: 'climate_subnational_metrics',
        inserted: aqueductProvince.length + nriCounties.length,
        updated: 0,
        skipped: 0,
        errors: []
      }
    ]
  };
}
