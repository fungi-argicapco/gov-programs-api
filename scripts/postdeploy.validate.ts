import { SOURCES } from '../data/sources/phase2';

type Schedule = '4h' | 'daily';

type CliOptions = {
  baseUrl: string;
  output?: string;
};

type SourcePayload = {
  id: string;
  source_id: number;
  authority: string;
  jurisdiction_code: string;
  schedule: Schedule | null;
  last_success_at: number | null;
  success_rate_7d: number;
};

type SourcesResponse = {
  data: SourcePayload[];
};

type CoverageReport = {
  day: string;
  created_at: number;
  tagCoverage: { withTags: number; withoutTags: number };
  naicsCoverage: { withNaics: number; missingNaics: number };
  validationIssues: Array<{ issue: string; count: number }>;
};

type CoverageResponse = {
  naics_density: number;
  tagCoverage: { withTags: number; withoutTags: number };
  reports: CoverageReport[];
  validationIssues: Array<{ issue: string; count: number }>;
};

type SourceSummary = {
  id: string;
  jurisdiction: string;
  schedule: Schedule | null;
  lastSuccessAt: number | null;
  ageMinutes: number | null;
  withinSla: boolean;
  status: 'ok' | 'warning' | 'critical';
  successRate7d: number;
};

type ValidationSummary = {
  generatedAt: string;
  baseUrl: string;
  ingestion: {
    totalSources: number;
    withinSla: number;
    warning: number;
    critical: number;
    staleBeyond24h: number;
    summaries: SourceSummary[];
  };
  coverage: {
    naicsDensity: number;
    tagCoverage: { withTags: number; withoutTags: number };
    latestReport: CoverageReport | null;
    previousReport: CoverageReport | null;
    naicsDensityChange: number | null;
    tagCoverageChange: number | null;
    validationIssues: Array<{ issue: string; count: number }>;
  };
};

const SLA_WINDOWS: Record<Schedule, number> = {
  '4h': 6 * 60 * 60 * 1000,
  daily: 30 * 60 * 60 * 1000
};

const DAY_MS = 24 * 60 * 60 * 1000;

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    baseUrl: 'http://127.0.0.1:8787'
  };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token) continue;
    if (token.startsWith('--base-url=')) {
      const baseUrlValue = token.split('=')[1];
      options.baseUrl = baseUrlValue && baseUrlValue.trim() !== '' ? baseUrlValue : options.baseUrl;
      continue;
    }
    if (token === '--base-url' && argv[i + 1]) {
      options.baseUrl = argv[i + 1];
      i += 1;
      continue;
    }
    if (token.startsWith('--output=')) {
      const outputValue = token.split('=')[1];
      if (outputValue !== undefined && outputValue !== '') {
        options.output = outputValue;
      }
      continue;
    }
    if (token === '--output' && argv[i + 1]) {
      options.output = argv[i + 1];
      i += 1;
      continue;
    }
  }
  return options;
}

async function fetchJson<T>(baseUrl: string, path: string): Promise<T> {
  const url = new URL(path, baseUrl);
  const response = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json'
    }
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Request to ${url.toString()} failed (${response.status}): ${body}`);
  }
  return (await response.json()) as T;
}

function computeSourceSummary(source: SourcePayload, now: number): SourceSummary {
  const def = SOURCES.find((candidate) => candidate.id === source.id);
  const schedule: Schedule | null = source.schedule ?? (def?.schedule ?? null);
  const lastSuccessAt = typeof source.last_success_at === 'number' ? source.last_success_at : null;
  const threshold = schedule ? SLA_WINDOWS[schedule] : null;
  const age = lastSuccessAt ? now - lastSuccessAt : null;
  const withinSla = threshold !== null && age !== null ? age <= threshold : false;
  const staleBeyond24h = age !== null ? age > DAY_MS : true;

  let status: SourceSummary['status'] = 'ok';
  if (!withinSla) {
    status = staleBeyond24h ? 'critical' : 'warning';
  }

  return {
    id: source.id,
    jurisdiction: source.jurisdiction_code,
    schedule,
    lastSuccessAt,
    ageMinutes: age !== null ? Math.round(age / 60000) : null,
    withinSla,
    status,
    successRate7d: source.success_rate_7d
  };
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function buildSummary(
  sourcesResponse: SourcesResponse,
  coverageResponse: CoverageResponse,
  options: CliOptions,
  now: number
): ValidationSummary {
  const summaries = sourcesResponse.data.map((source) => computeSourceSummary(source, now));
  const withinSla = summaries.filter((summary) => summary.withinSla).length;
  const warning = summaries.filter((summary) => summary.status === 'warning').length;
  const critical = summaries.filter((summary) => summary.status === 'critical').length;
  const staleBeyond24h = summaries.filter((summary) => {
    if (summary.ageMinutes === null) return true;
    return summary.ageMinutes > (DAY_MS / 60000);
  }).length;

  const reports = coverageResponse.reports ?? [];
  const latestReport = reports[0] ?? null;
  const previousReport = reports[1] ?? null;
  const naicsDensityChange =
    latestReport && previousReport
      ? (latestReport.naicsCoverage.withNaics / Math.max(latestReport.naicsCoverage.withNaics + latestReport.naicsCoverage.missingNaics, 1)) -
        (previousReport.naicsCoverage.withNaics /
          Math.max(previousReport.naicsCoverage.withNaics + previousReport.naicsCoverage.missingNaics, 1))
      : null;
  const tagCoverageChange =
    latestReport && previousReport
      ? (latestReport.tagCoverage.withTags / Math.max(latestReport.tagCoverage.withTags + latestReport.tagCoverage.withoutTags, 1)) -
        (previousReport.tagCoverage.withTags /
          Math.max(previousReport.tagCoverage.withTags + previousReport.tagCoverage.withoutTags, 1))
      : null;

  return {
    generatedAt: new Date(now).toISOString(),
    baseUrl: options.baseUrl,
    ingestion: {
      totalSources: summaries.length,
      withinSla,
      warning,
      critical,
      staleBeyond24h,
      summaries
    },
    coverage: {
      naicsDensity: coverageResponse.naics_density,
      tagCoverage: coverageResponse.tagCoverage,
      latestReport,
      previousReport,
      naicsDensityChange,
      tagCoverageChange,
      validationIssues: coverageResponse.validationIssues ?? []
    }
  };
}

function logSummary(summary: ValidationSummary) {
  console.log(`Post-deploy validation for ${summary.baseUrl}`);
  console.log('Ingestion SLA adherence:');
  console.log(
    `  ${summary.ingestion.withinSla}/${summary.ingestion.totalSources} sources within SLA ` +
      `(warning=${summary.ingestion.warning}, critical=${summary.ingestion.critical})`
  );
  if (summary.ingestion.summaries.length > 0) {
    const worstOffenders = summary.ingestion.summaries
      .filter((summaryEntry) => summaryEntry.status !== 'ok')
      .sort((a, b) => (b.ageMinutes ?? 0) - (a.ageMinutes ?? 0))
      .slice(0, 5);
    if (worstOffenders.length > 0) {
      console.log('  Stale sources:');
      for (const offender of worstOffenders) {
        const age = offender.ageMinutes !== null ? `${offender.ageMinutes}m` : 'unknown';
        console.log(`    - ${offender.id} (${offender.jurisdiction}) – age ${age}, status ${offender.status}`);
      }
    }
  }

  const naicsPercent = formatPercent(summary.coverage.naicsDensity);
  const tagPercent = (() => {
    const { withTags, withoutTags } = summary.coverage.tagCoverage;
    const total = withTags + withoutTags;
    return total > 0 ? formatPercent(withTags / total) : '0.0%';
  })();
  console.log('Coverage metrics:');
  console.log(`  NAICS density: ${naicsPercent}`);
  console.log(`  Tag coverage: ${tagPercent}`);
  if (summary.coverage.naicsDensityChange !== null) {
    const change = formatPercent(summary.coverage.naicsDensityChange);
    console.log(`  NAICS density change vs. previous report: ${change}`);
  }
  if (summary.coverage.tagCoverageChange !== null) {
    const change = formatPercent(summary.coverage.tagCoverageChange);
    console.log(`  Tag coverage change vs. previous report: ${change}`);
  }
  if (summary.coverage.validationIssues.length > 0) {
    console.log('  Validation issues:');
    for (const issue of summary.coverage.validationIssues.slice(0, 5)) {
      console.log(`    - ${issue.issue} (count=${issue.count})`);
    }
  }
}

async function main() {
  const options = parseArgs(process.argv);
  const now = Date.now();
  const sources = await fetchJson<SourcesResponse>(options.baseUrl, '/v1/sources');
  const coverage = await fetchJson<CoverageResponse>(options.baseUrl, '/v1/stats/coverage');
  const summary = buildSummary(sources, coverage, options, now);
  logSummary(summary);
  if (options.output) {
    await Bun.write(options.output, JSON.stringify(summary, null, 2));
    console.log(`Summary written to ${options.output}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
