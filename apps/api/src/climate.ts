import type { D1Database } from '@cloudflare/workers-types';

const CLIMATE_DATASET_ID = 'climate_esg_metrics';

type ClimateCountryIndicator = {
  indicator: string;
  value: number | null;
  year: number | null;
  unit: string | null;
  source: string | null;
};

type ClimateSubnationalIndicator = ClimateCountryIndicator & {
  adminCode: string;
  isoCode: string | null;
  adminLevel: string | null;
  metadata: Record<string, unknown> | null;
};

export type ClimateCountrySummary = {
  iso3: string;
  indicators: Record<string, ClimateCountryIndicator>;
  subnational: Record<string, ClimateSubnationalIndicator[]>;
};

async function determineLatestVersion(db: D1Database): Promise<string | null> {
  const row = await db
    .prepare(
      `SELECT version FROM climate_country_metrics WHERE dataset_id = ? ORDER BY updated_at DESC LIMIT 1`
    )
    .bind(CLIMATE_DATASET_ID)
    .first<{ version: string }>()
    .catch(() => null);
  return row?.version ?? null;
}

function normalizeIso3(value: string): string {
  return value.trim().toUpperCase();
}

export async function loadClimateCountrySummaries(
  db: D1Database,
  filterIso3?: string
): Promise<ClimateCountrySummary[]> {
  const targetVersion = await determineLatestVersion(db);
  const bindings: (string | null)[] = [CLIMATE_DATASET_ID];
  let versionPredicate = '';
  if (targetVersion) {
    versionPredicate = 'AND version = ?';
    bindings.push(targetVersion);
  }
  let countryPredicate = '';
  if (filterIso3) {
    countryPredicate = 'AND country_iso3 = ?';
    bindings.push(normalizeIso3(filterIso3));
  }

  const countryRows = await db
    .prepare(
      `SELECT country_iso3, indicator, year, value, unit, source
         FROM climate_country_metrics
        WHERE dataset_id = ? ${versionPredicate} ${countryPredicate}
        ORDER BY country_iso3, indicator`
    )
    .bind(...bindings)
    .all<{ country_iso3: string; indicator: string; year: number | null; value: number | null; unit: string | null; source: string | null }>()
    .catch(() => ({ results: [] }));

  const subRows = await db
    .prepare(
      `SELECT country_iso3, indicator, admin_code, iso_code, admin_level, year, value, unit, metadata, source
         FROM climate_subnational_metrics
        WHERE dataset_id = ? ${versionPredicate} ${countryPredicate}
        ORDER BY country_iso3, admin_code, indicator`
    )
    .bind(...bindings)
    .all<{
      country_iso3: string;
      indicator: string;
      admin_code: string;
      iso_code: string | null;
      admin_level: string | null;
      year: number | null;
      value: number | null;
      unit: string | null;
      metadata: string | null;
      source: string | null;
    }>()
    .catch(() => ({ results: [] }));

  const summaries = new Map<string, ClimateCountrySummary>();

  for (const row of countryRows.results) {
    const iso3 = normalizeIso3(row.country_iso3);
    if (!summaries.has(iso3)) {
      summaries.set(iso3, { iso3, indicators: {}, subnational: {} });
    }
    const summary = summaries.get(iso3)!;
    summary.indicators[row.indicator] = {
      indicator: row.indicator,
      value: row.value,
      year: row.year,
      unit: row.unit ?? null,
      source: row.source ?? null
    };
  }

  for (const row of subRows.results) {
    const iso3 = normalizeIso3(row.country_iso3);
    if (!summaries.has(iso3)) {
      summaries.set(iso3, { iso3, indicators: {}, subnational: {} });
    }
    const summary = summaries.get(iso3)!;
    if (!summary.subnational[row.admin_code]) {
      summary.subnational[row.admin_code] = [];
    }
    let parsedMetadata: Record<string, unknown> | null = null;
    if (row.metadata) {
      try {
        parsedMetadata = JSON.parse(row.metadata) as Record<string, unknown>;
      } catch (error) {
        console.warn('[climate] unable to parse metadata for', row.country_iso3, row.admin_code, error);
      }
    }
    summary.subnational[row.admin_code].push({
      indicator: row.indicator,
      value: row.value,
      year: row.year,
      unit: row.unit ?? null,
      source: row.source ?? null,
      adminCode: row.admin_code,
      isoCode: row.iso_code ?? null,
      adminLevel: row.admin_level ?? null,
      metadata: parsedMetadata
    });
  }

  return Array.from(summaries.values());
}

export async function loadClimateCountry(db: D1Database, iso3: string): Promise<ClimateCountrySummary | null> {
  const summaries = await loadClimateCountrySummaries(db, iso3);
  return summaries.length > 0 ? summaries[0] : null;
}
