export type OecdAirGhgObservation = {
  countryIso3: string;
  pollutant: string;
  variable: string;
  year: number;
  value: number | null;
  unit: string | null;
};

type FetchImpl = (input: RequestInfo, init?: RequestInit) => Promise<Response>;

export type OecdAirGhgOptions = {
  fetchImpl?: FetchImpl;
  countries?: readonly string[];
  pollutants?: readonly string[];
  variables?: readonly string[];
  startYear?: number;
  endYear?: number;
};

const OECD_BASE = 'https://stats.oecd.org/sdmx-json/data/AIR_GHG';

function buildDimensionPart(values?: readonly string[], fallback: string = 'ALL'): string {
  if (!values || values.length === 0) return fallback;
  if (values.length === 1) return values[0];
  return values.join('+');
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

export async function fetchOecdAirGhg(
  options: OecdAirGhgOptions = {}
): Promise<{ observations: OecdAirGhgObservation[]; prepared: string | null }> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const countryPart = buildDimensionPart(options.countries, 'ALL');
  const pollutantPart = buildDimensionPart(options.pollutants, 'ALL');
  const variablePart = buildDimensionPart(options.variables, 'TOTL');
  const timePart = options.startYear && options.endYear ? `${options.startYear}-${options.endYear}` : 'ALL';

  const dimensions = `${countryPart}.${pollutantPart}.${variablePart}.${timePart}`;
  const params = new URLSearchParams({
    contentType: 'json',
    detail: 'code',
    dimensionAtObservation: 'TIME_PERIOD'
  });
  const url = `${OECD_BASE}/${dimensions}?${params.toString()}`;
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(`OECD AIR_GHG request failed (${response.status} ${response.statusText})`);
  }
  const payload = (await response.json()) as any;
  const observations: OecdAirGhgObservation[] = [];

  const dataSet = payload?.dataSets?.[0];
  const seriesEntries = dataSet?.series ? Object.entries<any>(dataSet.series) : [];
  const seriesDimensions = payload?.structure?.dimensions?.series ?? [];
  const observationDimensions = payload?.structure?.dimensions?.observation ?? [];
  const timeDimension = observationDimensions.find((dim: any) => dim?.id === 'TIME_PERIOD');
  const timeValues = Array.isArray(timeDimension?.values) ? timeDimension.values : [];
  const prepared = typeof payload?.header?.prepared === 'string' ? payload.header.prepared : null;

  const unitFromAttributes = () => {
    const seriesAttrs = payload?.structure?.attributes?.series ?? [];
    const unitAttr = seriesAttrs.find((attr: any) => attr?.id === 'UNIT');
    if (!unitAttr) return null;
    const values = unitAttr.values ?? [];
    return values.length > 0 ? values[0]?.name ?? values[0]?.id ?? null : null;
  };
  const defaultUnit = unitFromAttributes();

  for (const [seriesKey, seriesData] of seriesEntries) {
    const indexParts = seriesKey.split(':').map((part) => Number(part));
    const dimensionCodes = seriesDimensions.map((dim: any, idx: number) => {
      const valueIndex = indexParts[idx];
      const dimValue = dim?.values?.[valueIndex];
      return {
        id: dimValue?.id ?? null,
        name: dimValue?.name ?? null
      };
    });
    const country = dimensionCodes[0]?.id ?? 'UNK';
    const pollutant = dimensionCodes[1]?.id ?? 'ALL';
    const variable = dimensionCodes[2]?.id ?? 'TOTL';
    const seriesObservations = seriesData?.observations ? Object.entries<any>(seriesData.observations) : [];

    for (const [timeIndex, obsValue] of seriesObservations) {
      const timeIdx = Number(timeIndex);
      const timeMeta = timeValues[timeIdx];
      const year = timeMeta?.id ? Number(timeMeta.id) : NaN;
      if (Number.isNaN(year)) continue;
      const value = Array.isArray(obsValue) ? toNumber(obsValue[0]) : toNumber(obsValue);
      observations.push({
        countryIso3: country,
        pollutant,
        variable,
        year,
        value,
        unit: defaultUnit ?? null
      });
    }
  }

  return { observations, prepared };
}
