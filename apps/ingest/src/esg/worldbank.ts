export type WorldBankObservation = {
  indicatorCode: string;
  indicatorName: string;
  countryIso3: string;
  year: number;
  value: number | null;
  unit: string | null;
  decimal: number | null;
};

export type WorldBankIndicatorResult = {
  indicatorCode: string;
  indicatorName: string;
  lastUpdated: string | null;
  observations: WorldBankObservation[];
};

type FetchImpl = (input: RequestInfo, init?: RequestInit) => Promise<Response>;

export type WorldBankFetchOptions = {
  fetchImpl?: FetchImpl;
  countries?: readonly string[];
  startYear?: number;
  endYear?: number;
  perPage?: number;
};

const WORLD_BANK_BASE = 'https://api.worldbank.org/v2';

function buildCountryParam(countries?: readonly string[]): string {
  if (!countries || countries.length === 0) return 'all';
  if (countries.length === 1) return countries[0];
  return countries.join(';');
}

export async function fetchWorldBankIndicators(
  indicators: readonly string[],
  options: WorldBankFetchOptions = {}
): Promise<WorldBankIndicatorResult[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const perPage = options.perPage ?? 1000;
  const countryParam = buildCountryParam(options.countries);
  const dateParam = options.startYear && options.endYear ? `${options.startYear}:${options.endYear}` : undefined;

  const results: WorldBankIndicatorResult[] = [];

  for (const indicator of indicators) {
    let page = 1;
    let totalPages = 1;
    let lastUpdated: string | null = null;
    const observations: WorldBankObservation[] = [];
    let indicatorName: string | null = null;

    while (page <= totalPages) {
      const params = new URLSearchParams({
        format: 'json',
        per_page: String(perPage),
        page: String(page)
      });
      if (dateParam) params.set('date', dateParam);
      const url = `${WORLD_BANK_BASE}/country/${countryParam}/indicator/${indicator}?${params.toString()}`;
      const response = await fetchImpl(url);
      if (!response.ok) {
        throw new Error(`World Bank API request failed (${response.status} ${response.statusText}) for ${indicator}`);
      }
      const payload = (await response.json()) as any;
      if (!Array.isArray(payload) || payload.length < 2) {
        throw new Error(`Unexpected World Bank response structure for ${indicator}`);
      }
      const meta = payload[0];
      const data = Array.isArray(payload[1]) ? (payload[1] as any[]) : [];
      totalPages = Number(meta?.pages ?? 1) || 1;
      if (!lastUpdated && typeof meta?.lastupdated === 'string') {
        lastUpdated = meta.lastupdated;
      }
      for (const row of data) {
        const code = row?.indicator?.id ?? indicator;
        if (!indicatorName && typeof row?.indicator?.value === 'string') {
          indicatorName = row.indicator.value;
        }
        const countryIso3 = typeof row?.countryiso3code === 'string' ? row.countryiso3code : null;
        const year = row?.date ? Number(row.date) : NaN;
        if (!countryIso3 || Number.isNaN(year)) {
          continue;
        }
        observations.push({
          indicatorCode: code,
          indicatorName: indicatorName ?? code,
          countryIso3,
          year,
          value: row?.value !== null && row?.value !== undefined ? Number(row.value) : null,
          unit: typeof row?.unit === 'string' && row.unit.length > 0 ? row.unit : null,
          decimal: typeof row?.decimal === 'number' ? row.decimal : row?.decimal != null ? Number(row.decimal) : null
        });
      }
      page += 1;
    }

    results.push({
      indicatorCode: indicator,
      indicatorName: indicatorName ?? indicator,
      lastUpdated,
      observations
    });
  }

  return results;
}
