import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types';
import { formatDay } from '@common/dates';
import { type DeadlinkMetricsRecord } from './deadlinks';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

type DeadlinkRecord = DeadlinkMetricsRecord['bad'][number];
export type DeadlinkMetrics = { rate: number } & Partial<DeadlinkMetricsRecord>;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0;
}

function isDeadlinkRecord(entry: unknown): entry is DeadlinkRecord {
  if (!entry || typeof entry !== 'object') return false;
  const record = entry as Partial<DeadlinkRecord>;
  return isNonNegativeFiniteNumber(record.id) && typeof record.url === 'string';
}

export function isDeadlinkMetrics(value: unknown): value is DeadlinkMetrics {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<DeadlinkMetricsRecord>;

  if (!isFiniteNumber(candidate.rate)) {
    return false;
  }

  if (candidate.n !== undefined && !isNonNegativeFiniteNumber(candidate.n)) {
    return false;
  }

  if (candidate.bad !== undefined) {
    if (!Array.isArray(candidate.bad) || !candidate.bad.every(isDeadlinkRecord)) {
      return false;
    }
  }

  return true;
}

export function isDeadlinkMetricsRecord(value: unknown): value is DeadlinkMetricsRecord {
  if (!isDeadlinkMetrics(value)) return false;
  const candidate = value as DeadlinkMetricsRecord;

  if (!isNonNegativeFiniteNumber(candidate.n)) {
    return false;
  }

  if (!Array.isArray(candidate.bad) || !candidate.bad.every(isDeadlinkRecord)) {
    return false;
  }

  return true;
}

type IngestEnv = {
  DB: D1Database;
  LOOKUPS_KV?: KVNamespace;
};

type CoverageProgramRow = {
  id: number;
  industry_codes: string | null;
  summary: string | null;
  url: string | null;
  start_date: string | null;
  end_date: string | null;
};

type CoverageBenefitRow = {
  program_id: number;
  min_amount_cents: number | null;
  max_amount_cents: number | null;
};

type CoverageTagRow = {
  program_id: number;
  tag: string;
};

type CoverageIssueAggregate = {
  issue: string;
  count: number;
};

function parseIndustryCodes(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((value) => String(value));
    }
  } catch {
    // ignore malformed JSON
  }
  return [];
}

function hasBenefitAmounts(benefits: CoverageBenefitRow[]): boolean {
  return benefits.some((benefit) => {
    const min = typeof benefit.min_amount_cents === 'number' ? benefit.min_amount_cents : null;
    const max = typeof benefit.max_amount_cents === 'number' ? benefit.max_amount_cents : null;
    return (min !== null && min > 0) || (max !== null && max > 0);
  });
}

function evaluateProgramIssues(
  program: CoverageProgramRow,
  tags: string[],
  benefits: CoverageBenefitRow[],
  now: number
): string[] {
  const issues: string[] = [];
  if (!program.summary || program.summary.trim().length === 0) {
    issues.push('missing_summary');
  }
  if (!program.url || program.url.trim().length === 0) {
    issues.push('missing_url');
  }
  const hasBenefits = benefits.length > 0 && hasBenefitAmounts(benefits);
  if (!hasBenefits) {
    issues.push('missing_benefit_info');
  }
  if (!program.start_date) {
    issues.push('missing_start_date');
  }
  if (program.end_date) {
    const parsed = Date.parse(program.end_date);
    if (!Number.isNaN(parsed) && parsed < now) {
      issues.push('expired');
    }
  }
  const codes = parseIndustryCodes(program.industry_codes);
  if (codes.length === 0) {
    issues.push('missing_naics');
  }
  if (tags.length === 0) {
    issues.push('missing_tags');
  }
  return issues;
}

export async function writeDailyCoverage(env: IngestEnv, dayStr?: string): Promise<void> {
  const now = Date.now();
  const day = dayStr ?? formatDay(now);
  const thirtyDaysAgo = now - THIRTY_DAYS_MS;

  const programRows = await env.DB.prepare(
    `SELECT id, industry_codes, summary, url, start_date, end_date FROM programs`
  ).all<CoverageProgramRow>();
  const freshSourcesRow = await env.DB.prepare(
    `SELECT COUNT(DISTINCT source_id) as fresh FROM programs WHERE source_id IS NOT NULL AND updated_at >= ?`
  )
    .bind(thirtyDaysAgo)
    .first<{ fresh: number }>();

  const [benefitRows, tagRows] = await Promise.all([
    env.DB.prepare(
      `SELECT program_id, min_amount_cents, max_amount_cents FROM benefits`
    ).all<CoverageBenefitRow>(),
    env.DB.prepare(`SELECT program_id, tag FROM tags`).all<CoverageTagRow>()
  ]);

  const benefitMap = new Map<number, CoverageBenefitRow[]>();
  for (const row of benefitRows.results ?? []) {
    const list = benefitMap.get(row.program_id) ?? [];
    list.push(row);
    benefitMap.set(row.program_id, list);
  }
  const tagMap = new Map<number, string[]>();
  for (const row of tagRows.results ?? []) {
    const list = tagMap.get(row.program_id) ?? [];
    list.push(row.tag);
    tagMap.set(row.program_id, list);
  }

  const programs = programRows.results ?? [];
  const totalPrograms = programs.length;
  let totalCodes = 0;
  let withTags = 0;
  let withoutTags = 0;
  let withNaics = 0;
  let missingNaics = 0;
  const auditRecords: Array<{ programId: number; issues: string[] }> = [];
  const issueCounts = new Map<string, number>();

  for (const program of programs) {
    const codes = parseIndustryCodes(program.industry_codes);
    totalCodes += codes.length;
    if (codes.length > 0) {
      withNaics += 1;
    } else {
      missingNaics += 1;
    }

    const tags = tagMap.get(program.id) ?? [];
    if (tags.length > 0) {
      withTags += 1;
    } else {
      withoutTags += 1;
    }

    const benefits = benefitMap.get(program.id) ?? [];
    const issues = evaluateProgramIssues(program, tags, benefits, now);
    if (issues.length > 0) {
      auditRecords.push({ programId: program.id, issues });
      for (const issue of issues) {
        const current = issueCounts.get(issue) ?? 0;
        issueCounts.set(issue, current + 1);
      }
    }
  }

  let deadlinkRate: number | null = null;
  if (env.LOOKUPS_KV) {

    try {
      const key = `metrics:deadlinks:${day}`;
      const stored = await env.LOOKUPS_KV.get(key, 'json');
      if (isDeadlinkMetrics(stored)) {
        deadlinkRate = stored.rate;
      }
    } catch (err) {
      console.warn('daily_coverage_deadlinks_lookup_failed', err);
    }
  }

  const naicsDensity = totalPrograms > 0 ? totalCodes / totalPrograms : 0;
  const freshSources = Number(freshSourcesRow?.fresh ?? 0);

  await env.DB.prepare(`DELETE FROM coverage_audit`).run();
  if (auditRecords.length > 0) {
    const inserts: D1PreparedStatement[] = auditRecords.map((record) =>
      env.DB.prepare(`INSERT INTO coverage_audit (program_id, run_id, issues, created_at) VALUES (?, NULL, ?, ?)`)
        .bind(record.programId, JSON.stringify(record.issues), now)
    );
    await env.DB.batch(inserts);
  }

  const validationIssues: CoverageIssueAggregate[] = Array.from(issueCounts.entries())
    .map(([issue, count]) => ({ issue, count }))
    .sort((a, b) => b.count - a.count);

  await env.DB.prepare(
    `INSERT INTO coverage_reports (day, run_id, with_tags, without_tags, with_naics, missing_naics, validation_issues, created_at)
     VALUES (?, NULL, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(day) DO UPDATE SET
       with_tags = excluded.with_tags,
       without_tags = excluded.without_tags,
       with_naics = excluded.with_naics,
       missing_naics = excluded.missing_naics,
       validation_issues = excluded.validation_issues,
       created_at = excluded.created_at`
  )
    .bind(day, withTags, withoutTags, withNaics, missingNaics, JSON.stringify(validationIssues), now)
    .run();

  await env.DB.prepare(
    `INSERT INTO daily_coverage_stats (day, country_code, jurisdiction_code, n_programs, fresh_sources, naics_density, deadlink_rate, created_at)
     VALUES (?, NULL, NULL, ?, ?, ?, ?, ?)
     ON CONFLICT(day) DO UPDATE SET
       n_programs = excluded.n_programs,
       fresh_sources = excluded.fresh_sources,
       naics_density = excluded.naics_density,
       deadlink_rate = excluded.deadlink_rate,
       created_at = excluded.created_at`
  )
    .bind(day, totalPrograms, freshSources, naicsDensity, deadlinkRate, now)
    .run();
}
