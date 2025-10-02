import { MACRO_METRIC_DATA, MACRO_METRIC_SERVICES, type MacroMetricEntry } from './macro_global';
import { buildDatasetAutomation, recordDatasetSnapshot, upsertDatasetServices, type DatasetIngestSummary } from './utils';
import { stableStringify } from '../util/json';

const DATASET_ID = 'macro_metrics_global';
const VERSION = '2025-10-02';
export const MACRO_GLOBAL_DATASET_ID = DATASET_ID;
export const MACRO_GLOBAL_DATASET_VERSION = VERSION;

const METRIC_CONFIG: Record<string, { name: string; group: string; sourceUrl: string; unitLabel?: string }> = {
  population: {
    name: 'Population',
    group: 'Demographics',
    sourceUrl: 'https://data.worldbank.org/indicator/SP.POP.TOTL',
    unitLabel: 'people'
  },
  gdp: {
    name: 'GDP (current US$)',
    group: 'Economy',
    sourceUrl: 'https://data.worldbank.org/indicator/NY.GDP.MKTP.CD',
    unitLabel: 'current USD'
  },
  unemployment_rate: {
    name: 'Unemployment rate',
    group: 'Labor',
    sourceUrl: 'https://data.worldbank.org/indicator/SL.UEM.TOTL.ZS',
    unitLabel: '% of labor force'
  },
  inflation_cpi: {
    name: 'Inflation (CPI)',
    group: 'Economy',
    sourceUrl: 'https://data.worldbank.org/indicator/FP.CPI.TOTL.ZG',
    unitLabel: '% change'
  },
  labour_force_participation: {
    name: 'Labor force participation',
    group: 'Labor',
    sourceUrl: 'https://data.worldbank.org/indicator/SL.TLF.CACT.ZS',
    unitLabel: '% of population'
  },
  broadband_subscriptions: {
    name: 'Fixed broadband subscriptions per 100 people',
    group: 'Infrastructure',
    sourceUrl: 'https://data.worldbank.org/indicator/IT.NET.BBND.P2',
    unitLabel: 'subscriptions per 100 people'
  }
};

const ADMIN_LEVEL = 'subnational';

function countryCodeFromUnit(unit: string): string {
  const [country] = unit.split('-');
  return country ?? unit.slice(0, 2);
}

async function upsertMacroMetric(env: { DB: D1Database }, entry: MacroMetricEntry, timestamp: number): Promise<'inserted' | 'updated' | 'skipped'> {
  const config = METRIC_CONFIG[entry.metric];
  if (!config) return 'skipped';
  const rawValue = entry.value?.trim();
  if (!rawValue) return 'skipped';
  const numericValue = Number(rawValue);
  if (!Number.isFinite(numericValue)) return 'skipped';

  const adminUnitCode = entry.unit.trim();
  const countryCode = countryCodeFromUnit(adminUnitCode).toUpperCase();
  const metricYear = entry.year ? Math.trunc(Number(entry.year)) : null;

  const existing = await env.DB.prepare(
    `SELECT id FROM macro_metrics WHERE admin_unit_code = ? AND metric_name = ? AND metric_year IS ? LIMIT 1`
  )
    .bind(adminUnitCode, config.name, metricYear)
    .first<{ id: number }>()
    .catch(() => null);

  const metadata = stableStringify({
    parent_iso3: entry.parent_iso3,
    precision: entry.precision,
    methodology_notes: entry.methodology_notes,
    source_metric: entry.metric,
    unit_measure: entry.unit_measure
  });
  const automation = buildDatasetAutomation(DATASET_ID, VERSION, entry.metric);

  if (!existing) {
    await env.DB.prepare(
      `INSERT INTO macro_metrics (
         country_code,
         admin_unit_code,
         admin_unit_name,
         admin_unit_level,
         metric_group,
         metric_name,
         metric_value,
         value_text,
         metric_unit,
         metric_year,
         source_url,
         verification_date,
         automation_metadata,
         metadata,
         created_at,
         updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        countryCode,
        adminUnitCode,
        adminUnitCode,
        ADMIN_LEVEL,
        config.group,
        config.name,
        numericValue,
        rawValue,
        entry.unit_measure || config.unitLabel || null,
        metricYear,
        config.sourceUrl,
        VERSION,
        automation,
        metadata,
        timestamp,
        timestamp
      )
      .run();
    return 'inserted';
  }

  await env.DB.prepare(
    `UPDATE macro_metrics
        SET metric_value = ?,
            value_text = ?,
            metric_unit = ?,
            source_url = ?,
            verification_date = ?,
            automation_metadata = ?,
            metadata = ?,
            updated_at = ?
      WHERE id = ?`
  )
    .bind(
      numericValue,
      rawValue,
      entry.unit_measure || config.unitLabel || null,
      config.sourceUrl,
      VERSION,
      automation,
      metadata,
      timestamp,
      existing.id
    )
    .run();
  return 'updated';
}

export async function ingestMacroGlobalDataset(env: { DB: D1Database }): Promise<DatasetIngestSummary> {
  const timestamp = Date.now();
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const entry of MACRO_METRIC_DATA) {
    try {
      const outcome = await upsertMacroMetric(env, entry, timestamp);
      if (outcome === 'inserted') inserted += 1;
      else if (outcome === 'updated') updated += 1;
      else skipped += 1;
    } catch (error: any) {
      errors.push(error?.message ?? String(error));
    }
  }

  await upsertDatasetServices(
    env,
    DATASET_ID,
    VERSION,
    MACRO_METRIC_SERVICES.map((service) => ({
      serviceName: service.metric,
      endpoint: service.endpoint,
      httpMethods: ['GET'],
      parameters: service.parameters_or_payload ? { description: service.parameters_or_payload } : null,
      authentication: service.authentication || null,
      rateLimit: service.rate_limits || null,
      cadence: service.update_cadence || null,
      changeDetection: service.change_detection || null,
      statusPage: service.status_page || null,
      readiness: service.automation_readiness || null,
      notes: service.notes || null,
      sourceUrl: service.source_url || null,
      verificationDate: service.verification_date || VERSION
    }))
  );

  await recordDatasetSnapshot(env, DATASET_ID, VERSION, MACRO_METRIC_DATA, { services: MACRO_METRIC_SERVICES });

  return {
    datasetId: DATASET_ID,
    version: VERSION,
    tables: [
      {
        table: 'macro_metrics',
        inserted,
        updated,
        skipped,
        errors
      }
    ]
  };
}
