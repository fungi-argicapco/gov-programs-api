import type { MacroMetricRecord, MacroMetricSource } from './types';

import { stableStringify } from '../util/json';

type WorldBankMeta = {
  page?: number;
  pages?: number;
  per_page?: number;
  total?: number;
  lastupdated?: string;
};

type WorldBankDatum = {
  indicator?: { id?: string; value?: string };
  country?: { id?: string; value?: string };
  countryiso3code?: string;
  date?: string;
  value?: number | string | null;
  unit?: string;
  obs_status?: string;
  decimal?: number;
};

type WorldBankResponse = [WorldBankMeta | undefined, WorldBankDatum[] | undefined];

type WorldBankObservation = {
  year: number;
  value: number;
  valueText?: string;
  metadata: Record<string, unknown>;
};

type ParsedWorldBankPage = {
  observations: WorldBankObservation[];
  totalPages: number;
  lastUpdated?: string;
};

function parseNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function parseWorldBankPage(source: MacroMetricSource, payload: unknown): ParsedWorldBankPage {
  if (!Array.isArray(payload) || payload.length < 2) {
    return { observations: [], totalPages: 1 };
  }

  const meta = (payload[0] ?? {}) as WorldBankMeta;
  const data = (payload[1] ?? []) as WorldBankDatum[];
  const indicatorName = data.find((row) => row?.indicator?.value)?.indicator?.value ?? source.metricName;
  const totalPages = Number(meta?.pages ?? 1) || 1;
  const lastUpdated = typeof meta?.lastupdated === 'string' ? meta.lastupdated : undefined;

  const baseMetadata: Record<string, unknown> = {
    provider: 'worldbank',
    indicatorId: source.indicatorId,
    indicatorName,
    lastUpdated,
    ...source.metadata
  };

  const observations: WorldBankObservation[] = [];

  for (const row of data) {
    const year = parseNumber(row?.date);
    if (year === null) continue;
    const value = parseNumber(row?.value);
    if (value === null) continue;

    const metadata: Record<string, unknown> = {
      ...baseMetadata,
      countryIso3: row?.countryiso3code,
      countryLabel: row?.country?.value,
      obsStatus: row?.obs_status,
      decimal: row?.decimal
    };

    observations.push({
      year,
      value,
      valueText: typeof row?.value === 'string' ? row.value : undefined,
      metadata
    });
  }

  observations.sort((a, b) => b.year - a.year);

  return {
    observations,
    totalPages,
    lastUpdated
  };
}

function buildWorldBankUrl(source: MacroMetricSource, page: number): string {
  const url = new URL(source.request.endpoint);
  const params = source.request.parameters ?? {};
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  if (!url.searchParams.has('per_page')) {
    url.searchParams.set('per_page', '1000');
  }
  url.searchParams.set('page', String(page));
  return url.toString();
}

function dedupeByYear(records: MacroMetricRecord[]): MacroMetricRecord[] {
  const seen = new Map<number, MacroMetricRecord>();
  for (const record of records) {
    if (!seen.has(record.metricYear)) {
      seen.set(record.metricYear, record);
      continue;
    }
    const existing = seen.get(record.metricYear)!;
    if (record.metricValue > existing.metricValue) {
      seen.set(record.metricYear, record);
    }
  }
  const unique = Array.from(seen.values());
  unique.sort((a, b) => b.metricYear - a.metricYear);
  return unique;
}

export type FetchLike = (input: RequestInfo | URL | string, init?: RequestInit) => Promise<Response>;

export async function fetchWorldBankSeries(
  source: MacroMetricSource,
  fetchImpl: FetchLike = fetch
): Promise<MacroMetricRecord[]> {
  const records: MacroMetricRecord[] = [];
  let page = 1;
  let totalPages = 1;

  do {
    const url = buildWorldBankUrl(source, page);
    const response = await fetchImpl(url, { method: 'GET' });
    if (!response.ok) {
      throw new Error(`worldbank_http_${response.status}`);
    }

    const payload = (await response.json()) as WorldBankResponse;
    const parsed = parseWorldBankPage(source, payload);
    totalPages = parsed.totalPages;

    for (const observation of parsed.observations) {
      records.push({
        sourceId: source.id,
        countryCode: source.countryCode,
        adminUnitCode: source.adminUnitCode,
        adminUnitName: source.adminUnitName,
        adminUnitLevel: source.adminUnitLevel,
        metricGroup: source.metricGroup,
        metricName: source.metricName,
        metricUnit: source.metricUnit,
        metricYear: observation.year,
        metricValue: observation.value,
        valueText: observation.valueText,
        sourceUrl: source.automation.sourceUrl,
        verificationDate: source.automation.verificationDate,
        automationMetadata: source.automation,
        metadata: observation.metadata
      });
    }

    if (source.maxYears && records.length >= source.maxYears) {
      break;
    }

    page += 1;
  } while (page <= totalPages);

  const unique = dedupeByYear(records);
  if (source.maxYears && unique.length > source.maxYears) {
    unique.length = source.maxYears;
  }

  return unique.map((record) => ({
    ...record,
    // normalize metadata JSON once so downstream comparisons are stable
    metadata: record.metadata
      ? JSON.parse(stableStringify(record.metadata))
      : undefined
  }));
}
