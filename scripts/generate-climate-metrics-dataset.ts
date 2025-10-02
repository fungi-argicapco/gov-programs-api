#!/usr/bin/env bun
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parse } from 'csv-parse/sync';

const VERSION = '2025-10-02';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const RAW_BASE = path.join(ROOT, 'data', 'climate_esg', 'raw');
const OUTPUT_DIR = path.join(ROOT, 'apps', 'ingest', 'src', 'datasets');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'climate_metrics.ts');

function readCsv(filePath: string) {
  const csv = readFileSync(filePath, 'utf8');
  return parse(csv, { columns: true, skip_empty_lines: true, trim: true }) as Record<string, string>[];
}

function numberOrNull(value: string | undefined): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) ? numeric : null;
}

function buildNdGainRecords() {
  const indexRows = readCsv(path.join(RAW_BASE, 'nd_gain', 'nd_gain_index.csv'));
  const vulnerabilityRows = readCsv(path.join(RAW_BASE, 'nd_gain', 'nd_gain_vulnerability.csv'));
  const readinessRows = readCsv(path.join(RAW_BASE, 'nd_gain', 'nd_gain_readiness.csv'));

  const records = new Map<string, { iso3: string; year: number | null; index: number | null; vulnerability: number | null; readiness: number | null }>();

  const ensureRecord = (iso3: string, year: string | undefined) => {
    const key = `${iso3}-${year ?? 'null'}`;
    if (!records.has(key)) {
      records.set(key, {
        iso3,
        year: numberOrNull(year) ?? null,
        index: null,
        vulnerability: null,
        readiness: null
      });
    }
    return records.get(key)!;
  };

  for (const row of indexRows) {
    const rec = ensureRecord(row.iso3, row.year);
    rec.index = numberOrNull(row.index);
  }
  for (const row of vulnerabilityRows) {
    const rec = ensureRecord(row.iso3, row.year);
    rec.vulnerability = numberOrNull(row.vulnerability);
  }
  for (const row of readinessRows) {
    const rec = ensureRecord(row.iso3, row.year);
    rec.readiness = numberOrNull(row.readiness);
  }

  return Array.from(records.values()).sort((a, b) => {
    if (a.iso3 === b.iso3) {
      return (a.year ?? 0) - (b.year ?? 0);
    }
    return a.iso3.localeCompare(b.iso3);
  });
}

function buildAqueductCountry() {
  const rows = readCsv(path.join(RAW_BASE, 'aqueduct', 'aqueduct_country_baseline.csv'));
  return rows.map((row) => ({
    iso3: row.iso3,
    indicator: row.indicator,
    value: numberOrNull(row.value)
  }));
}

function buildAqueductProvince() {
  const rows = readCsv(path.join(RAW_BASE, 'aqueduct', 'aqueduct_province_baseline.csv'));
  return rows.map((row) => ({
    countryIso3: row.country_iso3,
    provinceCode: row.province_code,
    provinceName: row.province_name,
    indicator: row.indicator,
    value: numberOrNull(row.value)
  }));
}

function buildNriCounties() {
  const rows = readCsv(path.join(RAW_BASE, 'nri', 'nri_counties.csv'));
  return rows.map((row) => ({
    countryIso3: row.country_iso3,
    stateIso: row.state_iso,
    countyFips: row.county_fips,
    countyName: row.county_name,
    year: numberOrNull(row.year),
    ealTotal: numberOrNull(row.eal_total),
    socialVulnerability: numberOrNull(row.social_vulnerability),
    communityResilience: numberOrNull(row.community_resilience)
  }));
}

function emitArray(name: string, typeName: string, value: unknown[]): string {
  const json = JSON.stringify(value, null, 2);
  return `export const ${name}: readonly ${typeName}[] = ${json} as const;`;
}

function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const ndGain = buildNdGainRecords();
  const aqueductCountry = buildAqueductCountry();
  const aqueductProvince = buildAqueductProvince();
  const nriCounties = buildNriCounties();

  const services = [
    {
      serviceName: 'nd_gain_country_index',
      endpoint: 'https://gain.nd.edu/assets/gain/files/resources-2025-20-05-11h12.zip',
      httpMethods: ['GET'],
      parameters: null,
      authentication: 'none',
      rateLimit: 'static download; fetch annually',
      cadence: 'annual',
      changeDetection: 'file name + ETag',
      statusPage: null,
      readiness: 'partial',
      notes: 'ND-GAIN 2025 release; monitor site for revised file path each year.',
      sourceUrl: 'https://gain.nd.edu/our-work/climate-adaptation-resilience-download-data',
      verificationDate: VERSION
    },
    {
      serviceName: 'wri_aqueduct_country_rankings',
      endpoint: 'https://files.wri.org/aqueduct/aqueduct-4-0-country-rankings.zip',
      httpMethods: ['GET'],
      parameters: null,
      authentication: 'none',
      rateLimit: 'large file; prefer single fetch per release',
      cadence: 'adhoc',
      changeDetection: 'file hash',
      statusPage: null,
      readiness: 'partial',
      notes: 'Aqueduct 4.0 rankings; includes country, province scores.',
      sourceUrl: 'https://www.wri.org/data/aqueduct-water-risk-atlas',
      verificationDate: VERSION
    },
    {
      serviceName: 'fema_nri_counties',
      endpoint: 'https://www.fema.gov/sites/default/files/documents/fema_nri_table_counties.zip',
      httpMethods: ['GET'],
      parameters: null,
      authentication: 'none',
      rateLimit: 'static download; update on new NRI release',
      cadence: 'annual',
      changeDetection: 'file hash',
      statusPage: 'https://hazards.fema.gov/nri/status',
      readiness: 'yes',
      notes: 'FEMA NRI county-level table; includes EAL and vulnerability metrics.',
      sourceUrl: 'https://hazards.fema.gov/nri/data-resources',
      verificationDate: VERSION
    }
  ];

  const lines = [
    '// Auto-generated by scripts/generate-climate-metrics-dataset.ts',
    '// Do not edit by hand.',
    '',
    `export const CLIMATE_METRICS_SEED_VERSION = '${VERSION}';`,
    '',
    'export type NdGainMetric = {',
    '  iso3: string;',
    '  year: number | null;',
    '  index: number | null;',
    '  vulnerability: number | null;',
    '  readiness: number | null;',
    '};',
    emitArray('ND_GAIN_METRICS', 'NdGainMetric', ndGain),
    '',
    'export type AqueductCountryMetric = {',
    '  iso3: string;',
    '  indicator: string;',
    '  value: number | null;',
    '};',
    emitArray('AQUEDUCT_COUNTRY_METRICS', 'AqueductCountryMetric', aqueductCountry),
    '',
    'export type AqueductProvinceMetric = {',
    '  countryIso3: string;',
    '  provinceCode: string;',
    '  provinceName: string;',
    '  indicator: string;',
    '  value: number | null;',
    '};',
    emitArray('AQUEDUCT_PROVINCE_METRICS', 'AqueductProvinceMetric', aqueductProvince),
    '',
    'export type NriCountyMetric = {',
    '  countryIso3: string;',
    '  stateIso: string;',
    '  countyFips: string;',
    '  countyName: string;',
    '  year: number | null;',
    '  ealTotal: number | null;',
    '  socialVulnerability: number | null;',
    '  communityResilience: number | null;',
    '};',
    emitArray('NRI_COUNTY_METRICS', 'NriCountyMetric', nriCounties),
    '',
    'export type ClimateMetricService = {',
    '  serviceName: string;',
    '  endpoint: string;',
    '  httpMethods: readonly string[];',
    '  parameters: Record<string, unknown> | null;',
    '  authentication: string | null;',
    '  rateLimit: string | null;',
    '  cadence: string | null;',
    '  changeDetection: string | null;',
    '  statusPage: string | null;',
    '  readiness: string | null;',
    '  notes: string | null;',
    '  sourceUrl: string | null;',
    '  verificationDate: string | null;',
    '};',
    emitArray('CLIMATE_METRIC_SERVICES', 'ClimateMetricService', services)
  ];

  const content = `${lines.join('\n')}`;
  writeFileSync(OUTPUT_FILE, `${content}\n`, 'utf8');
}

main();
