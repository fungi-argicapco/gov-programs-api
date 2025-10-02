import type { MacroMetricRecord, MacroMetricSource } from './types';

import { fetchWorldBankSeries, type FetchLike } from './worldbank';
import { stableStringify } from '../util/json';

export type MacroIngestionSummary = {
  sourceId: string;
  fetched: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: string[];
};

type IngestEnv = {
  DB: D1Database;
};

type UpsertResult = 'inserted' | 'updated' | 'skipped';

function toSqlValue(value: unknown): string | number | null {
  if (typeof value === 'string' && value.length > 0) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return null;
}

export async function upsertMacroMetric(
  env: IngestEnv,
  record: MacroMetricRecord,
  timestamp: number
): Promise<UpsertResult> {
  const metadataJson = record.metadata ? stableStringify(record.metadata) : null;
  const automationJson = stableStringify(record.automationMetadata);

  const existing = await env.DB.prepare(
    `SELECT id, metric_value, value_text, metadata, automation_metadata, verification_date
       FROM macro_metrics
      WHERE admin_unit_code = ? AND metric_name = ? AND metric_year = ?
      LIMIT 1`
  )
    .bind(record.adminUnitCode, record.metricName, record.metricYear)
    .first<{
      id: number;
      metric_value: number | null;
      value_text: string | null;
      metadata: string | null;
      automation_metadata: string | null;
      verification_date: string | null;
    }>()
    .catch(() => null);

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
        record.countryCode,
        record.adminUnitCode,
        record.adminUnitName,
        record.adminUnitLevel,
        record.metricGroup,
        record.metricName,
        record.metricValue,
        toSqlValue(record.valueText),
        record.metricUnit,
        record.metricYear,
        toSqlValue(record.sourceUrl),
        toSqlValue(record.verificationDate),
        automationJson,
        metadataJson,
        timestamp,
        timestamp
      )
      .run();
    return 'inserted';
  }

  const shouldUpdate =
    existing.metric_value !== record.metricValue ||
    existing.value_text !== toSqlValue(record.valueText) ||
    existing.metadata !== metadataJson ||
    existing.automation_metadata !== automationJson ||
    existing.verification_date !== toSqlValue(record.verificationDate);

  if (!shouldUpdate) {
    return 'skipped';
  }

  await env.DB.prepare(
    `UPDATE macro_metrics
        SET country_code = ?,
            admin_unit_name = ?,
            admin_unit_level = ?,
            metric_group = ?,
            metric_value = ?,
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
      record.countryCode,
      record.adminUnitName,
      record.adminUnitLevel,
      record.metricGroup,
      record.metricValue,
      toSqlValue(record.valueText),
      record.metricUnit,
      toSqlValue(record.sourceUrl),
      toSqlValue(record.verificationDate),
      automationJson,
      metadataJson,
      timestamp,
      existing.id
    )
    .run();

  return 'updated';
}

async function ingestSource(
  env: IngestEnv,
  source: MacroMetricSource,
  opts: { fetchImpl?: FetchLike }
): Promise<MacroIngestionSummary> {
  const summary: MacroIngestionSummary = {
    sourceId: source.id,
    fetched: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    errors: []
  };
  const timestamp = Date.now();

  try {
    const records = await fetchWorldBankSeries(source, opts.fetchImpl);
    summary.fetched = records.length;

    for (const record of records) {
      const outcome = await upsertMacroMetric(env, record, timestamp);
      if (outcome === 'inserted') {
        summary.inserted += 1;
      } else if (outcome === 'updated') {
        summary.updated += 1;
      } else {
        summary.skipped += 1;
      }
    }
  } catch (error: any) {
    summary.errors.push(error?.message ?? String(error));
  }

  return summary;
}

export async function ingestMacroMetrics(
  env: IngestEnv,
  sources: MacroMetricSource[],
  opts: { fetchImpl?: FetchLike } = {}
): Promise<MacroIngestionSummary[]> {
  const results: MacroIngestionSummary[] = [];
  for (const source of sources) {
    const summary = await ingestSource(env, source, opts);
    results.push(summary);
  }
  return results;
}
