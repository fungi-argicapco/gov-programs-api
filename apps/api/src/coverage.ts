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

type CoverageCount = {
  withTags: number;
  withoutTags: number;
};

type NaicsCoverage = {
  withNaics: number;
  missingNaics: number;
};

export type ValidationIssue = {
  issue: string;
  count: number;
};

export type PersistedCoverageReport = {
  day: string;
  created_at: number;
  tagCoverage: CoverageCount;
  naicsCoverage: NaicsCoverage;
  validationIssues: ValidationIssue[];
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
  tagCoverage: CoverageCount;
  naicsCoverage: NaicsCoverage;
  validationIssues: ValidationIssue[];
  reports: PersistedCoverageReport[];
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

type CoverageReportRow = {
  day: string;
  with_tags: number;
  without_tags: number;
  with_naics: number;
  missing_naics: number;
  validation_issues: string | null;
  created_at: number | null;
};

function parseValidationIssues(raw: unknown): ValidationIssue[] {
  if (!raw) return [];
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const candidate = entry as { issue?: unknown; count?: unknown };
      const issue = typeof candidate.issue === 'string' ? candidate.issue : null;
      const count = typeof candidate.count === 'number' ? candidate.count : null;
      if (!issue || count === null) return null;
      return { issue, count } satisfies ValidationIssue;
    })
    .filter((entry): entry is ValidationIssue => entry !== null);
}

function aggregateAuditIssues(rows: Array<{ issues: string | null }>): ValidationIssue[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!row.issues) continue;
    try {
      const parsed = JSON.parse(row.issues);
      if (Array.isArray(parsed)) {
        for (const issue of parsed) {
          if (typeof issue !== 'string' || !issue) continue;
          counts.set(issue, (counts.get(issue) ?? 0) + 1);
        }
      }
    } catch {
      continue;
    }
  }
  return Array.from(counts.entries())
    .map(([issue, count]) => ({ issue, count }))
    .sort((a, b) => b.count - a.count);
}

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
  const [
    byJur,
    byBenefit,
    naicsRows,
    sourceMetrics,
    snapshotRow,
    reportHistoryRows,
    auditIssueRows,
    tagCoverageRow
  ] = await Promise.all([
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
      .first<{ day: string; n_programs: number; fresh_sources: number; naics_density: number; deadlink_rate: number | null }>(),
    env.DB.prepare(
      `SELECT day, with_tags, without_tags, with_naics, missing_naics, validation_issues, created_at FROM coverage_reports ORDER BY day DESC LIMIT 30`
    ).all<CoverageReportRow>(),
    env.DB.prepare(`SELECT issues FROM coverage_audit`).all<{ issues: string | null }>(),
    env.DB.prepare(`SELECT COUNT(DISTINCT program_id) as with_tags FROM tags`).first<{ with_tags: number }>()
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

  const historyRows = reportHistoryRows.results ?? [];
  const reports: PersistedCoverageReport[] = historyRows.map((row) => ({
    day: row.day,
    created_at: Number(row.created_at ?? 0),
    tagCoverage: {
      withTags: Number(row.with_tags ?? 0),
      withoutTags: Number(row.without_tags ?? 0)
    },
    naicsCoverage: {
      withNaics: Number(row.with_naics ?? 0),
      missingNaics: Number(row.missing_naics ?? 0)
    },
    validationIssues: parseValidationIssues(row.validation_issues)
  }));

  const latestReport = reports[0] ?? null;
  const fallbackTagWith = Number(tagCoverageRow?.with_tags ?? 0);
  const fallbackTagCoverage: CoverageCount = {
    withTags: fallbackTagWith,
    withoutTags: Math.max(totalPrograms - fallbackTagWith, 0)
  };
  const fallbackNaicsCoverage: NaicsCoverage = {
    withNaics: withCodes,
    missingNaics: Math.max(totalPrograms - withCodes, 0)
  };

  const tagCoverage = latestReport ? latestReport.tagCoverage : fallbackTagCoverage;
  const naicsCoverage = latestReport ? latestReport.naicsCoverage : fallbackNaicsCoverage;

  const auditIssues = aggregateAuditIssues(auditIssueRows.results ?? []);
  const validationIssues = auditIssues.length > 0
    ? auditIssues
    : latestReport?.validationIssues ?? [];

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
    metrics,
    tagCoverage,
    naicsCoverage,
    validationIssues,
    reports
  };
}
