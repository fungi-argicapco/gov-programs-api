import type { Env } from './db';
import { formatDay } from '@common/dates';
import { SOURCES, type SourceDef } from '../../../data/sources/phase2';

type SourceRow = {
  id: number;
  name: string;
  url: string | null;
  license: string | null;
  tos_url: string | null;
  authority_level: string;
  jurisdiction_code: string;
};

type SourceMetrics = {
  id: string;
  source_id: number;
  country_code: SourceDef['country'] | null;
  authority: string;
  jurisdiction_code: string;
  kind: SourceDef['kind'] | null;
  parser: SourceDef['parser'] | null;
  schedule: SourceDef['schedule'] | null;
  rate: SourceDef['rate'] | null;
  url: string | null;
  license: string | null;
  tos_url: string | null;
  last_success_at: number | null;
  success_rate_7d: number;
};

export type CoverageResponse = {
  byJurisdiction: Array<{ country_code: string; jurisdiction_code: string; n: number }>;
  byBenefit: Array<{ benefit_type: string | null; n: number }>;
  fresh_sources: Array<{ id: string; last_success_at: number | null }>;
  completeness: {
    US: { federal: boolean; states: number };
    CA: { federal: boolean; provinces: number };
  };
  naics_density: number;
  deadlink_rate: number | null;
  metrics: CoverageSummary;
};

type CoverageSummary = {
  fresh_sources: number;
  completeness: number;
  naics_density: number;
  deadlink_rate: number | null;
};

const COVERAGE_TARGET = 1000;

const toMap = <T extends { [key: string]: any }>(rows: T[], key: keyof T) => {
  const map = new Map<any, T>();
  for (const row of rows) {
    map.set(row[key], row);
  }
  return map;
};

export async function listSourcesWithMetrics(env: Env): Promise<SourceMetrics[]> {
  const sources = await env.DB.prepare(
    `SELECT id, name, url, license, tos_url, authority_level, jurisdiction_code FROM sources ORDER BY jurisdiction_code, name`
  ).all<SourceRow>();
  const sourceRows = sources.results ?? [];
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const lastSuccessRows = await env.DB.prepare(
    `SELECT source_id, MAX(ended_at) as last_success_at FROM ingestion_runs WHERE status = 'ok' GROUP BY source_id`
  ).all<{ source_id: number; last_success_at: number }>();
  const runStatsRows = await env.DB.prepare(
    `SELECT source_id, status, COUNT(*) as n FROM ingestion_runs WHERE started_at >= ? GROUP BY source_id, status`
  )
    .bind(sevenDaysAgo)
    .all<{ source_id: number; status: string; n: number }>();
  const lastSuccessMap = toMap(lastSuccessRows.results ?? [], 'source_id');
  const rateAggregates = new Map<number, { total: number; ok: number }>();
  for (const row of runStatsRows.results ?? []) {
    const agg = rateAggregates.get(row.source_id) ?? { total: 0, ok: 0 };
    agg.total += Number(row.n ?? 0);
    if (row.status === 'ok') agg.ok += Number(row.n ?? 0);
    rateAggregates.set(row.source_id, agg);
  }
  return sourceRows.map((row) => {
    const agg = rateAggregates.get(row.id);
    const lastSuccess = lastSuccessMap.get(row.id)?.last_success_at ?? null;
    const def = SOURCES.find((source) => source.id === row.name);
    return {
      id: row.name,
      source_id: row.id,
      country_code: def?.country ?? null,
      authority: row.authority_level,
      jurisdiction_code: row.jurisdiction_code,
      kind: def?.kind ?? null,
      parser: def?.parser ?? null,
      schedule: def?.schedule ?? null,
      rate: def?.rate ? { ...def.rate } : null,
      url: row.url ?? null,
      license: row.license ?? null,
      tos_url: row.tos_url ?? null,
      last_success_at: lastSuccess,
      success_rate_7d: agg && agg.total > 0 ? agg.ok / agg.total : 0
    };
  });
}

export async function buildCoverageResponse(env: Env): Promise<CoverageResponse> {
  const now = Date.now();
  const [byJur, byBenefit, naicsRows, sourceMetrics, snapshotRow] = await Promise.all([
    env.DB.prepare(
      `SELECT country_code, jurisdiction_code, COUNT(*) as n FROM programs GROUP BY country_code, jurisdiction_code`
    ).all<{ country_code: string; jurisdiction_code: string; n: number }>(),
    env.DB.prepare(`SELECT benefit_type, COUNT(*) as n FROM programs GROUP BY benefit_type`).all<{
      benefit_type: string | null;
      n: number;
    }>(),
    env.DB.prepare(
      `SELECT COUNT(*) as total, SUM(CASE WHEN industry_codes IS NOT NULL AND industry_codes != '[]' THEN 1 ELSE 0 END) as with_codes FROM programs`
    ).first<{ total: number; with_codes: number }>(),
    listSourcesWithMetrics(env),
    env.DB.prepare(`SELECT day, n_programs, fresh_sources, naics_density, deadlink_rate FROM daily_coverage_stats WHERE day = ? LIMIT 1`)
      .bind(formatDay(now))
      .first<{ day: string; n_programs: number; fresh_sources: number; naics_density: number; deadlink_rate: number | null }>()
  ]);

  const totalPrograms = Number(naicsRows?.total ?? 0);
  const withCodes = Number(naicsRows?.with_codes ?? 0);
  const naicsDensity = totalPrograms > 0 ? withCodes / totalPrograms : 0;

  const freshSources = sourceMetrics.filter((metric) => {
    const def = SOURCES.find((s) => s.id === metric.id);
    if (!def) return false;
    if (!metric.last_success_at) return false;
    const age = now - metric.last_success_at;
    const threshold = def.schedule === '4h' ? 6 * 60 * 60 * 1000 : 30 * 60 * 60 * 1000;
    return age <= threshold;
  });

  const usFederal = await env.DB.prepare(
    `SELECT COUNT(*) as n FROM programs WHERE country_code = 'US' AND authority_level = 'federal'`
  ).first<{ n: number }>();
  const usStates = await env.DB.prepare(
    `SELECT COUNT(DISTINCT jurisdiction_code) as n FROM programs WHERE country_code = 'US' AND authority_level = 'state'`
  ).first<{ n: number }>();
  const caFederal = await env.DB.prepare(
    `SELECT COUNT(*) as n FROM programs WHERE country_code = 'CA' AND authority_level = 'federal'`
  ).first<{ n: number }>();
  const caProvinces = await env.DB.prepare(
    `SELECT COUNT(DISTINCT jurisdiction_code) as n FROM programs WHERE country_code = 'CA' AND authority_level = 'prov'`
  ).first<{ n: number }>();

  const fallbackMetrics: CoverageSummary = {
    fresh_sources: freshSources.length,
    completeness: Math.min(totalPrograms / COVERAGE_TARGET, 1),
    naics_density: naicsDensity,
    deadlink_rate: 0
  };

  const metrics: CoverageSummary = snapshotRow
    ? {
        fresh_sources: Number(snapshotRow.fresh_sources ?? 0),
        completeness: Math.min(Number(snapshotRow.n_programs ?? 0) / COVERAGE_TARGET, 1),
        naics_density:
          typeof snapshotRow.naics_density === 'number' && !Number.isNaN(snapshotRow.naics_density)
            ? snapshotRow.naics_density
            : naicsDensity,
        deadlink_rate:
          typeof snapshotRow.deadlink_rate === 'number' && !Number.isNaN(snapshotRow.deadlink_rate)
            ? snapshotRow.deadlink_rate
            : null
      }
    : fallbackMetrics;

  return {
    byJurisdiction: byJur.results ?? [],
    byBenefit: byBenefit.results ?? [],
    fresh_sources: freshSources.map((metric) => ({ id: metric.id, last_success_at: metric.last_success_at })),
    completeness: {
      US: { federal: Number(usFederal?.n ?? 0) > 0, states: Number(usStates?.n ?? 0) },
      CA: { federal: Number(caFederal?.n ?? 0) > 0, provinces: Number(caProvinces?.n ?? 0) }
    },
    naics_density: metrics.naics_density,
    deadlink_rate: metrics.deadlink_rate,
    metrics
  };
}
