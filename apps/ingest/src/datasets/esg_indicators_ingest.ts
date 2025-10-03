import type { D1Database } from '@cloudflare/workers-types';

import { stableStringify } from '../util/json';
import { upsertDatasetServices, recordDatasetSnapshot, type DatasetIngestSummary } from './utils';
import { fetchWorldBankIndicators, type WorldBankIndicatorResult } from '../esg/worldbank';
import { fetchOecdAirGhg } from '../esg/oecd';

const DATASET_ID = 'esg_indicators';
const WORLD_BANK_DATASET_ID = 'worldbank_esg';
const OECD_DATASET_ID = 'oecd_air_ghg';

const WORLD_BANK_INDICATORS = [
  'EN.ATM.CO2E.PC',
  'SP.POP.TOTL',
  'SL.TLF.CACT.ZS',
  'SE.PRM.ENRR',
  'GE.EST',
  'RL.EST',
  'CC.EST'
] as const;

const INDICATOR_METADATA = [
  {
    indicatorCode: 'EN.ATM.CO2E.PC',
    indicatorName: 'CO₂ emissions (metric tons per capita)',
    description: 'Carbon dioxide emissions from solid, liquid and gas fuels and gas flaring divided by midyear population.',
    unit: 'metric tons per capita',
    source: 'World Bank WDI',
    methodology: 'Annual emissions compiled by the Climate Watch dataset (WRI).',
    coverage: 'De facto population of each country.',
    notes: null
  },
  {
    indicatorCode: 'SP.POP.TOTL',
    indicatorName: 'Population, total',
    description: 'Midyear estimates of the de facto population counting all residents regardless of legal status or citizenship.',
    unit: 'persons',
    source: 'World Bank WDI',
    methodology: 'National censuses and UN World Population Prospects.',
    coverage: 'Residents, regardless of legal status or citizenship.',
    notes: null
  },
  {
    indicatorCode: 'SL.TLF.CACT.ZS',
    indicatorName: 'Labor force participation rate (% of total population ages 15+)',
    description: 'Economically active population aged 15 years and older as a percentage of the total population aged 15+.',
    unit: 'percent of population ages 15+',
    source: 'World Bank WDI',
    methodology: 'Modelled ILO estimates and labor-force surveys.',
    coverage: 'Population aged 15 and older.',
    notes: null
  },
  {
    indicatorCode: 'SE.PRM.ENRR',
    indicatorName: 'School enrolment, primary (% gross)',
    description: 'Total primary enrolment regardless of age, divided by the population of the official primary-school age group.',
    unit: 'percent',
    source: 'World Bank WDI',
    methodology: 'UNESCO Institute for Statistics; gross enrolment ratio.',
    coverage: 'Primary education systems.',
    notes: null
  },
  {
    indicatorCode: 'GE.EST',
    indicatorName: 'Government effectiveness (estimate)',
    description: 'Perceptions of the quality of public services, policy formulation and implementation, and credibility of the government.',
    unit: 'standard normal units (-2.5 to 2.5)',
    source: 'World Bank WGI',
    methodology: 'Worldwide Governance Indicators composite scores.',
    coverage: 'Country-level governance indicators.',
    notes: null
  },
  {
    indicatorCode: 'RL.EST',
    indicatorName: 'Rule of law (estimate)',
    description: 'Perceptions of confidence in societal rules, contract enforcement, property rights, police and courts.',
    unit: 'standard normal units (-2.5 to 2.5)',
    source: 'World Bank WGI',
    methodology: 'Worldwide Governance Indicators composite scores.',
    coverage: 'Country-level governance indicators.',
    notes: null
  },
  {
    indicatorCode: 'CC.EST',
    indicatorName: 'Control of corruption (estimate)',
    description: 'Perceptions of the extent to which public power is exercised for private gain, including petty and grand corruption.',
    unit: 'standard normal units (-2.5 to 2.5)',
    source: 'World Bank WGI',
    methodology: 'Worldwide Governance Indicators composite scores.',
    coverage: 'Country-level governance indicators.',
    notes: null
  },
  {
    indicatorCode: 'AIR_GHG_TOTAL_EMISSIONS',
    indicatorName: 'Total greenhouse gas emissions (AIR_GHG TOTL)',
    description: 'Total man-made greenhouse gas emissions reported in the OECD AIR_GHG inventory using IPCC 2006 guidelines.',
    unit: 'kilotons of CO₂ equivalent',
    source: 'OECD AIR_GHG',
    methodology: 'Country × pollutant × variable SDMX series; TOTL pollutant and TOTL variable aggregated.',
    coverage: 'OECD member and partner countries.',
    notes: null
  }
] as const;

type IndicatorMetadataEntry = (typeof INDICATOR_METADATA)[number];

type WorldBankFetcher = (indicators: readonly string[], options?: any) => Promise<WorldBankIndicatorResult[]>;
type OecdFetcher = (options?: any) => ReturnType<typeof fetchOecdAirGhg>;

const DEFAULT_START_YEAR = 2000;

function now(): number {
  return Date.now();
}

async function upsertIndicatorMetadata(env: { DB: D1Database }, entries: readonly IndicatorMetadataEntry[]) {
  const stmt = env.DB.prepare(
    `INSERT INTO esg_indicator_metadata (indicator_code, indicator_name, description, unit, source, methodology, coverage, notes, last_updated)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(indicator_code) DO UPDATE SET
       indicator_name = excluded.indicator_name,
       description = excluded.description,
       unit = excluded.unit,
       source = excluded.source,
       methodology = excluded.methodology,
       coverage = excluded.coverage,
       notes = excluded.notes,
       last_updated = excluded.last_updated`
  );
  for (const entry of entries) {
    stmt
      .bind(
        entry.indicatorCode,
        entry.indicatorName,
        entry.description,
        entry.unit,
        entry.source,
        entry.methodology,
        entry.coverage,
        entry.notes,
        new Date().toISOString()
      )
      .run();
  }
}

type MetricRecord = {
  datasetId: string;
  version: string;
  indicatorCode: string;
  countryIso3: string;
  year: number;
  value: number | null;
  unit: string | null;
  source: string;
  metadata?: Record<string, unknown>;
};

async function insertCountryMetrics(env: { DB: D1Database }, records: MetricRecord[]) {
  if (records.length === 0) return;
  const grouped = new Map<string, { datasetId: string; version: string; rows: MetricRecord[] }>();
  for (const record of records) {
    const key = `${record.datasetId}__${record.version}`;
    if (!grouped.has(key)) {
      grouped.set(key, { datasetId: record.datasetId, version: record.version, rows: [] });
    }
    grouped.get(key)!.rows.push(record);
  }

  const timestamp = now();
  for (const { datasetId, version, rows } of grouped.values()) {
    await env.DB.prepare(
      `DELETE FROM esg_country_metrics WHERE dataset_id = ? AND version = ?`
    )
      .bind(datasetId, version)
      .run();
    const insertStmt = env.DB.prepare(
      `INSERT INTO esg_country_metrics (dataset_id, indicator_code, country_iso3, year, value, unit, source, version, metadata, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const row of rows) {
      insertStmt
        .bind(
          datasetId,
          row.indicatorCode,
          row.countryIso3,
          row.year,
          row.value,
          row.unit,
          row.source,
          version,
          row.metadata ? stableStringify(row.metadata) : null,
          timestamp,
          timestamp
        )
        .run();
    }
  }
}

function summarizeWorldBank(results: WorldBankIndicatorResult[], version: string): { count: number; indicatorCodes: string[] } {
  let count = 0;
  const indicatorCodes: string[] = [];
  for (const result of results) {
    indicatorCodes.push(result.indicatorCode);
    count += result.observations.length;
  }
  return { count, indicatorCodes };
}

function buildWorldBankRecords(results: WorldBankIndicatorResult[], version: string): MetricRecord[] {
  const records: MetricRecord[] = [];
  for (const result of results) {
    for (const obs of result.observations) {
      records.push({
        datasetId: WORLD_BANK_DATASET_ID,
        version,
        indicatorCode: result.indicatorCode,
        countryIso3: obs.countryIso3,
        year: obs.year,
        value: obs.value,
        unit: obs.unit,
        source: 'World Bank API',
        metadata: {
          indicator_name: obs.indicatorName,
          decimal: obs.decimal
        }
      });
    }
  }
  return records;
}

function buildOecdRecords(
  observations: Awaited<ReturnType<typeof fetchOecdAirGhg>>['observations'],
  version: string
): MetricRecord[] {
  return observations.map((obs) => {
    const normalizedIndicator = obs.pollutant === 'TOTL' && obs.variable === 'TOTL'
      ? 'AIR_GHG_TOTAL_EMISSIONS'
      : `AIR_GHG_${obs.pollutant}_${obs.variable}`;
    return {
      datasetId: OECD_DATASET_ID,
      version,
      indicatorCode: normalizedIndicator,
      countryIso3: obs.countryIso3,
      year: obs.year,
      value: obs.value,
      unit: obs.unit ?? 'kilotons of CO₂ equivalent',
      source: 'OECD AIR_GHG',
      metadata: {
        pollutant: obs.pollutant,
        variable: obs.variable
      }
    };
  });
}

export type IngestEsgOptions = {
  fetchWorldBank?: typeof fetchWorldBankIndicators;
  fetchOecd?: typeof fetchOecdAirGhg;
  worldBankStartYear?: number;
  worldBankEndYear?: number;
};

export async function ingestEsgIndicators(
  env: { DB: D1Database },
  options: IngestEsgOptions = {}
): Promise<DatasetIngestSummary> {
  const fetchWorldBankImpl = options.fetchWorldBank ?? fetchWorldBankIndicators;
  const fetchOecdImpl = options.fetchOecd ?? fetchOecdAirGhg;

  const startYear = options.worldBankStartYear ?? DEFAULT_START_YEAR;
  const endYear = options.worldBankEndYear ?? new Date().getUTCFullYear();

  const worldBankResults = await fetchWorldBankImpl(WORLD_BANK_INDICATORS, {
    startYear,
    endYear,
    perPage: 1000
  });
  const worldBankVersion = worldBankResults.find((r) => r.lastUpdated)?.lastUpdated ?? new Date().toISOString().slice(0, 10);
  const worldBankRecords = buildWorldBankRecords(worldBankResults, worldBankVersion);

  const oecdResult = await fetchOecdImpl({ pollutants: ['TOTL'], variables: ['TOTL'], startYear, endYear });
  const oecdVersion = oecdResult.prepared ?? new Date().toISOString().slice(0, 10);
  const oecdRecords = buildOecdRecords(oecdResult.observations, oecdVersion);

  const indicatorCodes = new Set<string>();
  [...worldBankRecords, ...oecdRecords].forEach((record) => indicatorCodes.add(record.indicatorCode));
  const metadataEntries = INDICATOR_METADATA.filter((meta) => indicatorCodes.has(meta.indicatorCode));

  await upsertIndicatorMetadata(env, metadataEntries);
  await insertCountryMetrics(env, [...worldBankRecords, ...oecdRecords]);

  const services = [
    {
      serviceName: 'worldbank_esg',
      endpoint: 'https://api.worldbank.org/v2/country/{country}/indicator/{indicator_code}',
      httpMethods: ['GET'] as const,
      parameters: {
        format: 'json',
        per_page: '1000',
        date: `${startYear}:${endYear}`
      },
      authentication: 'none',
      rateLimit: 'World Bank API best practice ~10 req/sec',
      cadence: 'annual updates',
      changeDetection: 'metadata.lastupdated + dataset version',
      statusPage: 'https://databank.worldbank.org/home.aspx',
      readiness: 'yes',
      notes: 'Pulls WDI & WGI indicators (EN.ATM.CO2E.PC, SP.POP.TOTL, SL.TLF.CACT.ZS, SE.PRM.ENRR, GE.EST, RL.EST, CC.EST).',
      sourceUrl: 'https://api.worldbank.org/',
      verificationDate: worldBankVersion
    },
    {
      serviceName: 'oecd_air_ghg',
      endpoint: 'https://stats.oecd.org/sdmx-json/data/AIR_GHG/{Country}.{Pollutant}.{Variable}.{Time}',
      httpMethods: ['GET'] as const,
      parameters: {
        contentType: 'json',
        detail: 'code',
        dimensionAtObservation: 'TIME_PERIOD'
      },
      authentication: 'none',
      rateLimit: 'Follow OECD SDMX guidelines (≤30 calls/min/IP)',
      cadence: 'annual release',
      changeDetection: 'header.prepared timestamp',
      statusPage: 'https://stats.oecd.org/',
      readiness: 'yes',
      notes: 'Fetches AIR_GHG TOTL pollutant/variable time series.',
      sourceUrl: 'https://stats.oecd.org/',
      verificationDate: oecdVersion
    }
  ];

  await upsertDatasetServices(env, DATASET_ID, oecdVersion, services);

  const worldBankSummary = summarizeWorldBank(worldBankResults, worldBankVersion);

  await recordDatasetSnapshot(env, DATASET_ID, oecdVersion, {
    worldbank: {
      version: worldBankVersion,
      indicatorCodes: worldBankSummary.indicatorCodes,
      records: worldBankSummary.count
    },
    oecd: {
      version: oecdVersion,
      records: oecdRecords.length
    }
  });

  return {
    datasetId: DATASET_ID,
    version: oecdVersion,
    tables: [
      {
        table: 'esg_country_metrics',
        inserted: worldBankRecords.length + oecdRecords.length,
        updated: 0,
        skipped: 0,
        errors: []
      },
      {
        table: 'esg_indicator_metadata',
        inserted: metadataEntries.length,
        updated: 0,
        skipped: 0,
        errors: []
      }
    ]
  };
}
