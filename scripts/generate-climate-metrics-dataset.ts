#!/usr/bin/env bun
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parse } from 'csv-parse/sync';

const VERSION = '2025-10-02';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const RAW_BASE = path.join(ROOT, 'data', 'climate_esg', 'raw');
const OVERRIDES_PATH = path.join(ROOT, 'data', 'climate_esg', 'crosswalk_overrides.json');
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

async function fetchJson(url: string): Promise<any> {
  const response = await fetch(url, {
    headers: {
      'accept': 'application/sparql-results+json',
      'user-agent': 'gov-programs-api/1.0 (+https://github.com/fungi-argicapco/gov-programs-api)'
    }
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

type CrosswalkEntry = {
  countryIso3: string;
  adminCode: string;
  adminName: string;
  adminLevel: string;
  iso31662: string | null;
};

async function fetchCrosswalkFromWikidata(iso3List: readonly string[]): Promise<CrosswalkEntry[]> {
  if (iso3List.length === 0) return [];
  const values = iso3List.map((code) => `"${code}"`).join(' ');
  const query = `
    SELECT ?iso3 ?subdivision ?subdivisionLabel ?isoCode ?nutsCode ?gaulCode WHERE {
      VALUES ?iso3 { ${values} }
      ?country wdt:P298 ?iso3 .
      ?subdivision wdt:P31/wdt:P279* wd:Q10864048 ;
                   wdt:P17 ?country ;
                   wdt:P300 ?isoCode .
      OPTIONAL { ?subdivision wdt:P605 ?nutsCode . }
      OPTIONAL { ?subdivision wdt:P2892 ?gaulCode . }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }
  `;
  const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`;
  const data = await fetchJson(url);
  const entries: CrosswalkEntry[] = [];
  for (const row of data.results.bindings ?? []) {
    const iso3 = row.iso3?.value;
    const code = row.isoCode?.value;
    const label = row.subdivisionLabel?.value;
    if (!iso3 || !code || !label) continue;
    entries.push({
      countryIso3: iso3,
      adminCode: code,
      adminName: label,
      adminLevel: row.gaulCode?.value ? 'GAUL' : row.nutsCode?.value ? 'NUTS' : 'ADM1',
      iso31662: code
    } satisfies CrosswalkEntry);
  }
  return entries;
}

function loadCrosswalkOverrides(): CrosswalkEntry[] {
  try {
    const raw = readFileSync(OVERRIDES_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((entry) => ({
        countryIso3: entry.countryIso3,
        adminCode: entry.adminCode,
        adminName: entry.adminName,
        adminLevel: entry.adminLevel ?? 'override',
        iso31662: entry.iso31662 ?? null
      }));
    }
  } catch (error) {
    console.warn(`[climate-crosswalk] Failed to read overrides at ${OVERRIDES_PATH}`, error);
  }
  return [];
}

function loadCrosswalkFallback(): CrosswalkEntry[] {
  const fallbackPath = path.join(RAW_BASE, 'crosswalk', 'iso_crosswalk.csv');
  try {
    const rows = readCsv(fallbackPath);
    return rows.map((row) => ({
      countryIso3: row.country_iso3,
      adminCode: row.admin_code,
      adminName: row.admin_name,
      adminLevel: row.admin_level,
      iso31662: row.iso_3166_2 ?? null
    }));
  } catch (error) {
    console.warn(`[climate-crosswalk] Failed to load fallback crosswalk from ${fallbackPath}`, error);
    return [];
  }
}

async function buildCrosswalkEntries(iso3List: readonly string[]): Promise<CrosswalkEntry[]> {
  const overrides = loadCrosswalkOverrides();
  try {
    const remote = await fetchCrosswalkFromWikidata(iso3List);
    const merged = [...remote];
    for (const override of overrides) {
      merged.push(override);
    }
    return merged;
  } catch (error) {
    console.warn('[climate-crosswalk] Falling back to local crosswalk', error);
    const fallback = loadCrosswalkFallback();
    return [...fallback, ...overrides];
  }
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

function buildAqueductProvince(crosswalk: Map<string, CrosswalkEntry>) {
  const rows = readCsv(path.join(RAW_BASE, 'aqueduct', 'aqueduct_province_baseline.csv'));
  return rows.map((row) => ({
    countryIso3: row.country_iso3,
    provinceCode: row.province_code,
    provinceName: row.province_name,
    indicator: row.indicator,
    value: numberOrNull(row.value),
    isoCode: crosswalk.get(`${row.country_iso3}:${row.province_code}`)?.iso31662 ?? row.province_code ?? null
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

function buildInformGlobal() {
  const rows = readCsv(path.join(RAW_BASE, 'inform', 'inform_global.csv'));
  return rows.map((row) => ({
    iso3: row.iso3,
    year: numberOrNull(row.year),
    riskScore: numberOrNull(row.risk_score),
    hazardExposure: numberOrNull(row.hazard_exposure),
    vulnerability: numberOrNull(row.vulnerability),
    copingCapacity: numberOrNull(row.coping_capacity)
  }));
}

function buildInformSubnational(crosswalk: Map<string, CrosswalkEntry>) {
  const rows = readCsv(path.join(RAW_BASE, 'inform', 'inform_subnational.csv'));
  return rows.map((row) => {
    const key = `${row.country_iso3}:${row.admin_code}`;
    const match = crosswalk.get(key);
    return {
      countryIso3: row.country_iso3,
      adminCode: row.admin_code,
      adminName: row.admin_name,
      year: numberOrNull(row.year),
      riskScore: numberOrNull(row.risk_score),
      hazardExposure: numberOrNull(row.hazard_exposure),
      vulnerability: numberOrNull(row.vulnerability),
      copingCapacity: numberOrNull(row.coping_capacity),
      isoCode: match?.iso31662 ?? null
    };
  });
}

function buildEpiScores() {
  const rows = readCsv(path.join(RAW_BASE, 'epi', 'epi_scores.csv'));
  return rows.map((row) => ({
    iso3: row.iso3,
    year: numberOrNull(row.year),
    epiScore: numberOrNull(row.epi_score),
    climatePolicyScore: numberOrNull(row.climate_policy_score),
    biodiversityScore: numberOrNull(row.biodiversity_score)
  }));
}

function buildUnepMetrics(crosswalk: Map<string, CrosswalkEntry>) {
  const rows = readCsv(path.join(RAW_BASE, 'unep', 'unep_surface_water.csv'));
  const country: any[] = [];
  const subnational: any[] = [];
  for (const row of rows) {
    const record = {
      countryIso3: row.country_iso3,
      adminLevel: row.admin_level,
      unitCode: row.unit_code,
      unitName: row.unit_name,
      metric: row.metric,
      year: numberOrNull(row.year),
      value: numberOrNull(row.value),
      unit: row.unit ?? null,
      isoCode: crosswalk.get(`${row.country_iso3}:${row.unit_code}`)?.iso31662 ?? null
    };
    if (row.admin_level === 'GAUL0') {
      country.push(record);
    } else {
      subnational.push(record);
    }
  }
  return { country, subnational };
}

function emitArray(name: string, typeName: string, value: unknown[]): string {
  const json = JSON.stringify(value, null, 2);
  return `export const ${name}: readonly ${typeName}[] = ${json} as const;`;
}

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const ndGain = buildNdGainRecords();
  const aqueductCountry = buildAqueductCountry();
  const nriCounties = buildNriCounties();
  const informGlobal = buildInformGlobal();
  const epiScores = buildEpiScores();
  const isoCodes = new Set<string>();
  ndGain.forEach((row) => row.iso3 && isoCodes.add(row.iso3));
  aqueductCountry.forEach((row) => row.iso3 && isoCodes.add(row.iso3));
  informGlobal.forEach((row) => row.iso3 && isoCodes.add(row.iso3));
  epiScores.forEach((row) => row.iso3 && isoCodes.add(row.iso3));
  nriCounties.forEach((row) => row.countryIso3 && isoCodes.add(row.countryIso3));

  const aqueductProvinceRaw = readCsv(path.join(RAW_BASE, 'aqueduct', 'aqueduct_province_baseline.csv'));
  aqueductProvinceRaw.forEach((row) => row.country_iso3 && isoCodes.add(row.country_iso3));
  const informSubRaw = readCsv(path.join(RAW_BASE, 'inform', 'inform_subnational.csv'));
  informSubRaw.forEach((row) => row.country_iso3 && isoCodes.add(row.country_iso3));
  const unepRaw = readCsv(path.join(RAW_BASE, 'unep', 'unep_surface_water.csv'));
  unepRaw.forEach((row) => row.country_iso3 && isoCodes.add(row.country_iso3));

  const crosswalkEntries = await buildCrosswalkEntries(Array.from(isoCodes));
  const crosswalkLookup = new Map<string, CrosswalkEntry>();
  for (const entry of crosswalkEntries) {
    crosswalkLookup.set(`${entry.countryIso3}:${entry.adminCode}`, entry);
  }
  const aqueductProvince = buildAqueductProvince(crosswalkLookup);
  const informSubnational = buildInformSubnational(crosswalkLookup);
  const unep = buildUnepMetrics(crosswalkLookup);

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
    },
    {
      serviceName: 'inform_global_risk',
      endpoint: 'https://drmkc.jrc.ec.europa.eu/inform-index/INFORM-Risk/Downloads',
      httpMethods: ['GET'],
      parameters: null,
      authentication: 'hdx account (optional)',
      rateLimit: 'manual download or authenticated fetch',
      cadence: 'semi-annual',
      changeDetection: 'version label (e.g. v0.7.0)',
      statusPage: null,
      readiness: 'partial',
      notes: 'INFORM Risk Index global workbook; requires HDX or portal login for latest file.',
      sourceUrl: 'https://drmkc.jrc.ec.europa.eu/inform-index',
      verificationDate: VERSION
    },
    {
      serviceName: 'inform_subnational_risk',
      endpoint: 'https://drmkc.jrc.ec.europa.eu/inform-index/INFORM-Subnational',
      httpMethods: ['GET'],
      parameters: null,
      authentication: 'hdx account (optional)',
      rateLimit: 'manual download',
      cadence: 'annual',
      changeDetection: 'edition label (e.g. 2024)',
      statusPage: null,
      readiness: 'partial',
      notes: 'INFORM subnational models per region; schema varies by country.',
      sourceUrl: 'https://data.humdata.org/organization/jrc',
      verificationDate: VERSION
    },
    {
      serviceName: 'yale_epi_scores',
      endpoint: 'https://epi.yale.edu/downloads',
      httpMethods: ['GET'],
      parameters: null,
      authentication: 'none (browser download)',
      rateLimit: 'manual download',
      cadence: 'biennial',
      changeDetection: 'edition year',
      statusPage: null,
      readiness: 'partial',
      notes: 'Yale Environmental Performance Index datasets.',
      sourceUrl: 'https://epi.yale.edu',
      verificationDate: VERSION
    },
    {
      serviceName: 'unep_freshwater_surface',
      endpoint: 'https://sdg661.app/downloads',
      httpMethods: ['GET'],
      parameters: null,
      authentication: 'none (dynamic UI)',
      rateLimit: 'manual download; large GeoPackages available',
      cadence: 'multi-year',
      changeDetection: 'file naming (year range)',
      statusPage: null,
      readiness: 'partial',
      notes: 'UNEP Freshwater Ecosystems Explorer exports (SDG 6.6.1).',
      sourceUrl: 'https://sdg661.app',
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
    '  isoCode: string | null;',
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
    'export type InformGlobalMetric = {',
    '  iso3: string;',
    '  year: number | null;',
    '  riskScore: number | null;',
    '  hazardExposure: number | null;',
    '  vulnerability: number | null;',
    '  copingCapacity: number | null;',
    '};',
    emitArray('INFORM_GLOBAL_METRICS', 'InformGlobalMetric', informGlobal),
    '',
    'export type InformSubnationalMetric = {',
    '  countryIso3: string;',
    '  adminCode: string;',
    '  adminName: string;',
    '  year: number | null;',
    '  riskScore: number | null;',
    '  hazardExposure: number | null;',
    '  vulnerability: number | null;',
    '  copingCapacity: number | null;',
    '  isoCode: string | null;',
    '};',
    emitArray('INFORM_SUBNATIONAL_METRICS', 'InformSubnationalMetric', informSubnational),
    '',
    'export type EpiMetric = {',
    '  iso3: string;',
    '  year: number | null;',
    '  epiScore: number | null;',
    '  climatePolicyScore: number | null;',
    '  biodiversityScore: number | null;',
    '};',
    emitArray('EPI_METRICS', 'EpiMetric', epiScores),
    '',
    'export type UnepMetric = {',
    '  countryIso3: string;',
    '  adminLevel: string;',
    '  unitCode: string;',
    '  unitName: string;',
    '  metric: string;',
    '  year: number | null;',
    '  value: number | null;',
    '  unit: string | null;',
    '  isoCode: string | null;',
    '};',
    emitArray('UNEP_COUNTRY_METRICS', 'UnepMetric', unep.country),
    emitArray('UNEP_SUBNATIONAL_METRICS', 'UnepMetric', unep.subnational),
    '',
    'export type IsoCrosswalkEntry = {',
    '  countryIso3: string;',
    '  adminCode: string;',
    '  adminName: string;',
    '  adminLevel: string;',
    '  iso31662: string | null;',
    '};',
    emitArray('CLIMATE_ISO_CROSSWALK', 'IsoCrosswalkEntry', crosswalkEntries),
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

main().catch((error) => {
  console.error('[generate-climate-metrics-dataset] failed', error);
  process.exitCode = 1;
});
