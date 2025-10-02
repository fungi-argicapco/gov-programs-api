import type { D1Database } from '@cloudflare/workers-types';

import {
  INDUSTRY_CLUSTERS,
  WORKFORCE_ECOSYSTEM,
  INFRASTRUCTURE_ASSETS,
  REGULATORY_PROFILES,
  RAID_LOG,
  type IndustryClusterEntry,
  type WorkforceProgramEntry,
  type InfrastructureAssetEntry,
  type RegulatoryProfileEntry,
  type RaidLogEntry
} from './techland';
import { stableStringify } from '../util/json';

const DATASET_SOURCE = 'techland_dataset';
const DATASET_VERSION = '2025-10-01';

const DEFAULT_AUTOMATION = (file: string) =>
  stableStringify({ source: DATASET_SOURCE, file, version: DATASET_VERSION });

const DEFAULT_METADATA = (entry: unknown) => stableStringify(entry);

const DEFAULT_VERIFICATION_DATE = '2025-10-01';
const ADMIN_LEVEL_STATE = 'state';

function countryCodeFromUnit(unit: string): string {
  const [country] = unit.split('-');
  return country ?? unit.slice(0, 2);
}

type UpsertOutcome = 'inserted' | 'updated' | 'skipped';

type IngestSummary = {
  table: string;
  inserted: number;
  updated: number;
  skipped: number;
  errors: string[];
};

async function upsertIndustryCluster(env: { DB: D1Database }, entry: IndustryClusterEntry): Promise<UpsertOutcome> {
  const timestamp = Date.now();
  const automation = DEFAULT_AUTOMATION('industry_clusters.jsonl');
  const metadata = DEFAULT_METADATA(entry);
  const existing = await env.DB.prepare(
    `SELECT id FROM industry_clusters WHERE admin_unit_code = ? LIMIT 1`
  )
    .bind(entry.unit)
    .first<{ id: number }>()
    .catch(() => null);

  const commonBindings = [
    countryCodeFromUnit(entry.unit),
    entry.unit,
    ADMIN_LEVEL_STATE,
    'Statewide industry clusters',
    entry.sector,
    entry.employment,
    entry.gdp_contribution,
    entry.growth_rate,
    entry.key_employers_partners,
    entry.key_employers_partners,
    entry.un_sdgs,
    null,
    null,
    DEFAULT_VERIFICATION_DATE,
    automation,
    metadata
  ];

  if (!existing) {
    await env.DB.prepare(
      `INSERT INTO industry_clusters (
        country_code,
        admin_unit_code,
        admin_unit_level,
        cluster_name,
        cluster_description,
        employment,
        gdp_contribution,
        growth_rate,
        key_employers,
        partner_orgs,
        unsdg_alignment,
        problem_keywords,
        source_url,
        verification_date,
        automation_metadata,
        metadata,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(...commonBindings, timestamp, timestamp)
      .run();
    return 'inserted';
  }

  await env.DB.prepare(
    `UPDATE industry_clusters
        SET country_code = ?,
            admin_unit_level = ?,
            cluster_name = ?,
            cluster_description = ?,
            employment = ?,
            gdp_contribution = ?,
            growth_rate = ?,
            key_employers = ?,
            partner_orgs = ?,
            unsdg_alignment = ?,
            problem_keywords = ?,
            source_url = ?,
            verification_date = ?,
            automation_metadata = ?,
            metadata = ?,
            updated_at = ?
      WHERE admin_unit_code = ?`
  )
    .bind(
      countryCodeFromUnit(entry.unit),
      ADMIN_LEVEL_STATE,
      'Statewide industry clusters',
      entry.sector,
      entry.employment,
      entry.gdp_contribution,
      entry.growth_rate,
      entry.key_employers_partners,
      entry.key_employers_partners,
      entry.un_sdgs,
      null,
      null,
      DEFAULT_VERIFICATION_DATE,
      automation,
      metadata,
      timestamp,
      entry.unit
    )
    .run();
  return 'updated';
}

type WorkforceEnv = { DB: D1Database };

async function upsertWorkforceProgram(env: WorkforceEnv, entry: WorkforceProgramEntry): Promise<UpsertOutcome> {
  const timestamp = Date.now();
  const automation = DEFAULT_AUTOMATION('workforce_ecosystem.jsonl');
  const metadata = DEFAULT_METADATA(entry);
  const existing = await env.DB.prepare(
    `SELECT id FROM workforce_ecosystem WHERE admin_unit_code = ? LIMIT 1`
  )
    .bind(entry.unit)
    .first<{ id: number }>()
    .catch(() => null);

  const commonBindings = [
    countryCodeFromUnit(entry.unit),
    entry.unit,
    ADMIN_LEVEL_STATE,
    entry.programs,
    entry.providers,
    entry.delivery_model,
    null,
    null,
    entry.funding ?? null,
    entry.tech_partners ?? null,
    entry.esg_focus ?? null,
    null,
    null,
    DEFAULT_VERIFICATION_DATE,
    automation,
    metadata
  ];

  if (!existing) {
    await env.DB.prepare(
      `INSERT INTO workforce_ecosystem (
        country_code,
        admin_unit_code,
        admin_unit_level,
        program_name,
        provider,
        delivery_model,
        focus_area,
        capacity,
        funding_sources,
        technology_partners,
        esg_focus,
        problem_keywords,
        source_url,
        verification_date,
        automation_metadata,
        metadata,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(...commonBindings, timestamp, timestamp)
      .run();
    return 'inserted';
  }

  await env.DB.prepare(
    `UPDATE workforce_ecosystem
        SET country_code = ?,
            admin_unit_level = ?,
            program_name = ?,
            provider = ?,
            delivery_model = ?,
            focus_area = ?,
            capacity = ?,
            funding_sources = ?,
            technology_partners = ?,
            esg_focus = ?,
            problem_keywords = ?,
            source_url = ?,
            verification_date = ?,
            automation_metadata = ?,
            metadata = ?,
            updated_at = ?
      WHERE admin_unit_code = ?`
  )
    .bind(
      countryCodeFromUnit(entry.unit),
      ADMIN_LEVEL_STATE,
      entry.programs,
      entry.providers,
      entry.delivery_model,
      null,
      null,
      entry.funding ?? null,
      entry.tech_partners ?? null,
      entry.esg_focus ?? null,
      null,
      null,
      DEFAULT_VERIFICATION_DATE,
      automation,
      metadata,
      timestamp,
      entry.unit
    )
    .run();
  return 'updated';
}

function parseCapacityValue(raw: string | undefined): { value: number | null; unit: string | null } {
  if (!raw) return { value: null, unit: null };
  const millionMatch = raw.match(/([0-9]+(?:\.[0-9]+)?)\s*M\s*([A-Za-z]+)/);
  if (millionMatch) {
    const num = Number(millionMatch[1]);
    const multiplier = 1_000_000;
    return { value: Number.isFinite(num) ? num * multiplier : null, unit: millionMatch[2] ?? null };
  }
  const generic = raw.match(/([0-9]+(?:\.[0-9]+)?)\s*([A-Za-z]+)/);
  if (generic) {
    const num = Number(generic[1]);
    return { value: Number.isFinite(num) ? num : null, unit: generic[2] ?? null };
  }
  return { value: null, unit: null };
}

async function upsertInfrastructureAsset(env: { DB: D1Database }, entry: InfrastructureAssetEntry): Promise<UpsertOutcome> {
  const timestamp = Date.now();
  const automation = DEFAULT_AUTOMATION('infrastructure_assets.jsonl');
  const metadata = DEFAULT_METADATA(entry);
  const { value: capacityValue, unit: capacityUnit } = parseCapacityValue(entry.capacity);
  const existing = await env.DB.prepare(
    `SELECT id FROM infrastructure_assets WHERE admin_unit_code = ? AND asset_name = ? LIMIT 1`
  )
    .bind(entry.unit, entry.asset_name)
    .first<{ id: number }>()
    .catch(() => null);

  if (!existing) {
    await env.DB.prepare(
      `INSERT INTO infrastructure_assets (
        country_code,
        admin_unit_code,
        admin_unit_level,
        asset_name,
        asset_type,
        status,
        capacity_value,
        capacity_unit,
        cost_estimate,
        currency_code,
        owner,
        esg_rating,
        availability,
        location,
        source_url,
        verification_date,
        automation_metadata,
        metadata,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        countryCodeFromUnit(entry.unit),
        entry.unit,
        ADMIN_LEVEL_STATE,
        entry.asset_name,
        entry.type,
        entry.status,
        capacityValue,
        capacityUnit,
        null,
        null,
        entry.owners,
        entry.esg_rating ?? null,
        entry.availability ?? null,
        null,
        null,
        DEFAULT_VERIFICATION_DATE,
        automation,
        metadata,
        timestamp,
        timestamp
      )
      .run();
    return 'inserted';
  }

  await env.DB.prepare(
    `UPDATE infrastructure_assets
        SET country_code = ?,
            admin_unit_level = ?,
            asset_type = ?,
            status = ?,
            capacity_value = ?,
            capacity_unit = ?,
            owner = ?,
            esg_rating = ?,
            availability = ?,
            location = ?,
            source_url = ?,
            verification_date = ?,
            automation_metadata = ?,
            metadata = ?,
            updated_at = ?
      WHERE admin_unit_code = ? AND asset_name = ?`
  )
    .bind(
      countryCodeFromUnit(entry.unit),
      ADMIN_LEVEL_STATE,
      entry.type,
      entry.status,
      capacityValue,
      capacityUnit,
      entry.owners,
      entry.esg_rating ?? null,
      entry.availability ?? null,
      null,
      null,
      DEFAULT_VERIFICATION_DATE,
      automation,
      metadata,
      timestamp,
      entry.unit,
      entry.asset_name
    )
    .run();
  return 'updated';
}

async function upsertRegulatoryProfile(env: { DB: D1Database }, entry: RegulatoryProfileEntry): Promise<UpsertOutcome> {
  const timestamp = Date.now();
  const automation = DEFAULT_AUTOMATION('regulatory_profiles.jsonl');
  const metadata = DEFAULT_METADATA(entry);
  const existing = await env.DB.prepare(
    `SELECT id FROM regulatory_profiles WHERE admin_unit_code = ? LIMIT 1`
  )
    .bind(entry.unit)
    .first<{ id: number }>()
    .catch(() => null);

  const descriptionParts = [entry.permitting_timelines, entry.incentives, entry.labour_policies, entry.tax_policies]
    .filter(Boolean)
    .join(' | ');

  if (!existing) {
    await env.DB.prepare(
      `INSERT INTO regulatory_profiles (
        country_code,
        admin_unit_code,
        admin_unit_level,
        policy_area,
        description,
        requirement_level,
        risk_level,
        compliance_window,
        effective_date,
        review_date,
        mitigation_plan,
        source_url,
        verification_date,
        automation_metadata,
        metadata,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        countryCodeFromUnit(entry.unit),
        entry.unit,
        ADMIN_LEVEL_STATE,
        'Statewide business environment',
        descriptionParts,
        'state',
        entry.risk_level ?? null,
        null,
        entry.effective_date ?? null,
        entry.review_date ?? null,
        entry.mitigation_measures ?? null,
        null,
        DEFAULT_VERIFICATION_DATE,
        automation,
        metadata,
        timestamp,
        timestamp
      )
      .run();
    return 'inserted';
  }

  await env.DB.prepare(
    `UPDATE regulatory_profiles
        SET country_code = ?,
            admin_unit_level = ?,
            policy_area = ?,
            description = ?,
            requirement_level = ?,
            risk_level = ?,
            compliance_window = ?,
            effective_date = ?,
            review_date = ?,
            mitigation_plan = ?,
            source_url = ?,
            verification_date = ?,
            automation_metadata = ?,
            metadata = ?,
            updated_at = ?
      WHERE admin_unit_code = ?`
  )
    .bind(
      countryCodeFromUnit(entry.unit),
      ADMIN_LEVEL_STATE,
      'Statewide business environment',
      descriptionParts,
      'state',
      entry.risk_level ?? null,
      null,
      entry.effective_date ?? null,
      entry.review_date ?? null,
      entry.mitigation_measures ?? null,
      null,
      DEFAULT_VERIFICATION_DATE,
      automation,
      metadata,
      timestamp,
      entry.unit
    )
    .run();
  return 'updated';
}

async function upsertRaidLog(env: { DB: D1Database }, entry: RaidLogEntry): Promise<UpsertOutcome> {
  const timestamp = Date.now();
  const automation = DEFAULT_AUTOMATION('raid_log.jsonl');
  const metadata = DEFAULT_METADATA(entry);
  const existing = await env.DB.prepare(
    `SELECT id FROM raid_logs WHERE admin_unit_code = ? LIMIT 1`
  )
    .bind(entry.unit)
    .first<{ id: number }>()
    .catch(() => null);

  if (!existing) {
    await env.DB.prepare(
      `INSERT INTO raid_logs (
        country_code,
        admin_unit_code,
        admin_unit_level,
        risk_description,
        assumption,
        issue,
        dependency,
        severity,
        impact,
        mitigation,
        notes,
        source_url,
        verification_date,
        automation_metadata,
        metadata,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        countryCodeFromUnit(entry.unit),
        entry.unit,
        ADMIN_LEVEL_STATE,
        entry.risk_description,
        entry.assumption ?? null,
        entry.issue ?? null,
        entry.dependency ?? null,
        entry.severity ?? null,
        entry.impact ?? null,
        entry.mitigation ?? null,
        entry.notes ?? null,
        null,
        DEFAULT_VERIFICATION_DATE,
        automation,
        metadata,
        timestamp,
        timestamp
      )
      .run();
    return 'inserted';
  }

  await env.DB.prepare(
    `UPDATE raid_logs
        SET country_code = ?,
            admin_unit_level = ?,
            risk_description = ?,
            assumption = ?,
            issue = ?,
            dependency = ?,
            severity = ?,
            impact = ?,
            mitigation = ?,
            notes = ?,
            source_url = ?,
            verification_date = ?,
            automation_metadata = ?,
            metadata = ?,
            updated_at = ?
      WHERE admin_unit_code = ?`
  )
    .bind(
      countryCodeFromUnit(entry.unit),
      ADMIN_LEVEL_STATE,
      entry.risk_description,
      entry.assumption ?? null,
      entry.issue ?? null,
      entry.dependency ?? null,
      entry.severity ?? null,
      entry.impact ?? null,
      entry.mitigation ?? null,
      entry.notes ?? null,
      null,
      DEFAULT_VERIFICATION_DATE,
      automation,
      metadata,
      timestamp,
      entry.unit
    )
    .run();
  return 'updated';
}

async function ingestCollection<T>(
  env: { DB: D1Database },
  table: string,
  rows: readonly T[],
  handler: (env: { DB: D1Database }, row: T) => Promise<UpsertOutcome>
): Promise<IngestSummary> {
  const summary: IngestSummary = { table, inserted: 0, updated: 0, skipped: 0, errors: [] };
  for (const row of rows) {
    try {
      const outcome = await handler(env, row);
      summary[outcome] += 1;
    } catch (error: any) {
      summary.errors.push(error?.message ?? String(error));
    }
  }
  return summary;
}

export async function ingestTechlandDataset(env: { DB: D1Database }): Promise<IngestSummary[]> {
  const summaries: IngestSummary[] = [];
  summaries.push(await ingestCollection(env, 'industry_clusters', INDUSTRY_CLUSTERS, upsertIndustryCluster));
  summaries.push(await ingestCollection(env, 'workforce_ecosystem', WORKFORCE_ECOSYSTEM, upsertWorkforceProgram));
  summaries.push(await ingestCollection(env, 'infrastructure_assets', INFRASTRUCTURE_ASSETS, upsertInfrastructureAsset));
  summaries.push(await ingestCollection(env, 'regulatory_profiles', REGULATORY_PROFILES, upsertRegulatoryProfile));
  summaries.push(await ingestCollection(env, 'raid_logs', RAID_LOG, upsertRaidLog));
  return summaries;
}
