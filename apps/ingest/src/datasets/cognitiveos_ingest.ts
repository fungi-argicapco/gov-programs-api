import { PARTNERS, FINANCIAL_ASSUMPTIONS, CAPITAL_STACK, ROADMAP, SERVICES, type PartnerEntry, type FinancialAssumptionEntry, type CapitalStackEntry, type RoadmapEntry, type DatasetServiceEntry as SourceServiceEntry } from './cognitiveos';
import { stableStringify } from '../util/json';
import { buildDatasetAutomation, recordDatasetSnapshot, upsertDatasetServices, type DatasetIngestSummary } from './utils';

const DATASET_ID = 'cognitiveos_partner_stack';
const VERSION = '2025-10-01';
export const COGNITIVE_DATASET_ID = DATASET_ID;
export const COGNITIVE_DATASET_VERSION = VERSION;
const COUNTRY_CODE = 'ZZ';
const ADMIN_UNIT_CODE = 'GLOBAL';
const ADMIN_LEVEL = 'global';
const ROADMAP_SOURCE = 'https://www.projectmanager.com/blog/stage-gate-process';
const CAPITAL_STACK_SOURCE = 'https://corporatefinanceinstitute.com/resources/commercial-real-estate/the-capital-stack/';

function toProblemKeywords(entry: PartnerEntry): string | null {
  if (!entry.problem_keywords || entry.problem_keywords.length === 0) return null;
  return entry.problem_keywords.join('|');
}

type Env = { DB: D1Database };

type TableSummary = {
  table: string;
  inserted: number;
  updated: number;
  skipped: number;
  errors: string[];
};

function automation(artifact: string): string {
  return buildDatasetAutomation(DATASET_ID, VERSION, artifact);
}

async function upsertPartner(env: Env, entry: PartnerEntry, timestamp: number): Promise<'inserted' | 'updated'> {
  const existing = await env.DB.prepare(
    `SELECT id FROM partnerships WHERE admin_unit_code = ? AND organization_name = ? LIMIT 1`
  )
    .bind(ADMIN_UNIT_CODE, entry.organization_name)
    .first<{ id: number }>()
    .catch(() => null);

  const metadata = stableStringify(entry);
  const automationMetadata = automation('partners.jsonl');
  const problemKeywords = toProblemKeywords(entry);

  if (!existing) {
    await env.DB.prepare(
      `INSERT INTO partnerships (
         country_code,
         admin_unit_code,
         admin_unit_level,
         partner_type,
         organization_name,
         thesis,
         offering,
         contact_channel,
         status,
         esg_focus,
         problem_keywords,
         capital_commitment,
         currency_code,
         source_url,
         verification_date,
         automation_metadata,
         metadata,
         created_at,
         updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        COUNTRY_CODE,
        ADMIN_UNIT_CODE,
        ADMIN_LEVEL,
        entry.partner_type,
        entry.organization_name,
        `${entry.investor_thesis} Program categories: ${entry.program_category.join(', ')}`,
        entry.contribution,
        entry.contact,
        entry.status,
        entry.esg_focus,
        problemKeywords,
        null,
        null,
        entry.source_url,
        entry.verification_date,
        automationMetadata,
        metadata,
        timestamp,
        timestamp
      )
      .run();
    return 'inserted';
  }

  await env.DB.prepare(
    `UPDATE partnerships
        SET thesis = ?,
            offering = ?,
            contact_channel = ?,
            status = ?,
            esg_focus = ?,
            problem_keywords = ?,
            source_url = ?,
            verification_date = ?,
            automation_metadata = ?,
            metadata = ?,
            updated_at = ?
      WHERE admin_unit_code = ? AND organization_name = ?`
  )
    .bind(
      `${entry.investor_thesis} Program categories: ${entry.program_category.join(', ')}`,
      entry.contribution,
      entry.contact,
      entry.status,
      entry.esg_focus,
      problemKeywords,
      entry.source_url,
      entry.verification_date,
      automationMetadata,
      metadata,
      timestamp,
      ADMIN_UNIT_CODE,
      entry.organization_name
    )
    .run();
  return 'updated';
}

async function upsertFinancialAssumption(env: Env, entry: FinancialAssumptionEntry, timestamp: number): Promise<'inserted' | 'updated'> {
  const existing = await env.DB.prepare(
    `SELECT id FROM financial_assumptions WHERE scenario_id = ? AND scenario_name = ? LIMIT 1`
  )
    .bind(entry.scenario_id, entry.scenario_name)
    .first<{ id: number }>()
    .catch(() => null);

  const automationMetadata = automation('financial_assumptions.jsonl');
  const metadata = stableStringify(entry);

  if (!existing) {
    await env.DB.prepare(
      `INSERT INTO financial_assumptions (
         scenario_id,
         country_code,
         admin_unit_code,
         admin_unit_level,
         scenario_name,
         revenue_drivers,
         cost_drivers,
         sensitivity_inputs,
         timeline,
         notes,
         source_url,
         verification_date,
         automation_metadata,
         metadata,
         created_at,
         updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        entry.scenario_id,
        COUNTRY_CODE,
        ADMIN_UNIT_CODE,
        ADMIN_LEVEL,
        `${entry.scenario_name} — ${entry.component}`,
        entry.baseline,
        entry.targets,
        entry.sensitivity,
        entry.timeline,
        entry.notes,
        entry.source_url,
        entry.verification_date,
        automationMetadata,
        metadata,
        timestamp,
        timestamp
      )
      .run();
    return 'inserted';
  }

  await env.DB.prepare(
    `UPDATE financial_assumptions
        SET revenue_drivers = ?,
            cost_drivers = ?,
            sensitivity_inputs = ?,
            timeline = ?,
            notes = ?,
            source_url = ?,
            verification_date = ?,
            automation_metadata = ?,
            metadata = ?,
            updated_at = ?
      WHERE scenario_id = ? AND scenario_name = ?`
  )
    .bind(
      entry.baseline,
      entry.targets,
      entry.sensitivity,
      entry.timeline,
      entry.notes,
      entry.source_url,
      entry.verification_date,
      automationMetadata,
      metadata,
      timestamp,
      entry.scenario_id,
      entry.scenario_name
    )
    .run();
  return 'updated';
}

function inferSeniority(entry: CapitalStackEntry): string | null {
  switch (entry.instrument_type) {
    case 'senior debt':
      return 'senior';
    case 'mezzanine debt':
      return 'mezzanine';
    case 'equity':
      return 'equity';
    default:
      return null;
  }
}

async function upsertCapitalStack(env: Env, entry: CapitalStackEntry, timestamp: number): Promise<'inserted' | 'updated'> {
  const scenarioId = 'cog-capital-stack';
  const existing = await env.DB.prepare(
    `SELECT id FROM capital_stack_entries WHERE scenario_id = ? AND instrument_type = ? LIMIT 1`
  )
    .bind(scenarioId, entry.instrument_type)
    .first<{ id: number }>()
    .catch(() => null);

  const automationMetadata = automation('capital_stack.jsonl');
  const metadata = stableStringify(entry);
  const provider = entry.providers.join(', ');

  if (!existing) {
    await env.DB.prepare(
      `INSERT INTO capital_stack_entries (
         scenario_id,
         country_code,
         admin_unit_code,
         instrument_type,
         provider,
         amount,
         currency_code,
         terms,
         seniority,
         risk_mitigation,
         source_url,
         verification_date,
         automation_metadata,
         metadata,
         created_at,
         updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        scenarioId,
        COUNTRY_CODE,
        ADMIN_UNIT_CODE,
        entry.instrument_type,
        provider,
        null,
        entry.currency,
        entry.terms,
        inferSeniority(entry),
        entry.notes,
        CAPITAL_STACK_SOURCE,
        VERSION,
        automationMetadata,
        metadata,
        timestamp,
        timestamp
      )
      .run();
    return 'inserted';
  }

  await env.DB.prepare(
    `UPDATE capital_stack_entries
        SET provider = ?,
            currency_code = ?,
            terms = ?,
            seniority = ?,
            risk_mitigation = ?,
            automation_metadata = ?,
            metadata = ?,
            updated_at = ?
      WHERE scenario_id = ? AND instrument_type = ?`
  )
    .bind(
      provider,
      entry.currency,
      entry.terms,
      inferSeniority(entry),
      entry.notes,
      automationMetadata,
      metadata,
      timestamp,
      scenarioId,
      entry.instrument_type
    )
    .run();
  return 'updated';
}

async function upsertRoadmap(env: Env, entry: RoadmapEntry, timestamp: number): Promise<'inserted' | 'updated'> {
  const existing = await env.DB.prepare(
    `SELECT id FROM roadmap_milestones WHERE admin_unit_code = ? AND milestone_name = ? LIMIT 1`
  )
    .bind(ADMIN_UNIT_CODE, entry.milestone)
    .first<{ id: number }>()
    .catch(() => null);

  const automationMetadata = automation('roadmap.jsonl');
  const metadata = stableStringify(entry);
  const dependencies = entry.dependencies ?? null;
  const notes = 'notes' in entry ? (entry as any).notes ?? null : null;

  if (!existing) {
    await env.DB.prepare(
      `INSERT INTO roadmap_milestones (
         country_code,
         admin_unit_code,
         admin_unit_level,
         milestone_name,
         description,
         start_date,
         end_date,
         owner,
         status,
         stage_gate,
         dependencies,
         risk_level,
         source_url,
         verification_date,
         automation_metadata,
         metadata,
         created_at,
         updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        COUNTRY_CODE,
        ADMIN_UNIT_CODE,
        ADMIN_LEVEL,
        entry.milestone,
        entry.description,
        entry.start_date ?? null,
        entry.end_date ?? null,
        entry.owners,
        entry.status,
        entry.stage_gate,
        dependencies,
        entry.risk_level ?? null,
        ROADMAP_SOURCE,
        VERSION,
        automationMetadata,
        metadata,
        timestamp,
        timestamp
      )
      .run();
    return 'inserted';
  }

  await env.DB.prepare(
    `UPDATE roadmap_milestones
        SET description = ?,
            start_date = ?,
            end_date = ?,
            owner = ?,
            status = ?,
            stage_gate = ?,
            dependencies = ?,
            risk_level = ?,
            source_url = ?,
            verification_date = ?,
            automation_metadata = ?,
            metadata = ?,
            updated_at = ?
      WHERE admin_unit_code = ? AND milestone_name = ?`
  )
    .bind(
      entry.description,
      entry.start_date ?? null,
      entry.end_date ?? null,
      entry.owners,
      entry.status,
      entry.stage_gate,
      dependencies,
      entry.risk_level ?? null,
      ROADMAP_SOURCE,
      VERSION,
      automationMetadata,
      metadata,
      timestamp,
      ADMIN_UNIT_CODE,
      entry.milestone
    )
    .run();
  return 'updated';
}

export async function ingestCognitiveDataset(env: Env): Promise<DatasetIngestSummary> {
  const timestamp = Date.now();
  const tables: TableSummary[] = [];

  let inserted = 0;
  let updated = 0;
  for (const partner of PARTNERS) {
    const outcome = await upsertPartner(env, partner, timestamp);
    if (outcome === 'inserted') inserted += 1;
    else updated += 1;
  }
  tables.push({ table: 'partnerships', inserted, updated, skipped: 0, errors: [] });

  inserted = 0;
  updated = 0;
  for (const assumption of FINANCIAL_ASSUMPTIONS) {
    const outcome = await upsertFinancialAssumption(env, assumption, timestamp);
    if (outcome === 'inserted') inserted += 1;
    else updated += 1;
  }
  tables.push({ table: 'financial_assumptions', inserted, updated, skipped: 0, errors: [] });

  inserted = 0;
  updated = 0;
  for (const entry of CAPITAL_STACK) {
    const outcome = await upsertCapitalStack(env, entry, timestamp);
    if (outcome === 'inserted') inserted += 1;
    else updated += 1;
  }
  tables.push({ table: 'capital_stack_entries', inserted, updated, skipped: 0, errors: [] });

  inserted = 0;
  updated = 0;
  for (const entry of ROADMAP) {
    const outcome = await upsertRoadmap(env, entry, timestamp);
    if (outcome === 'inserted') inserted += 1;
    else updated += 1;
  }
  tables.push({ table: 'roadmap_milestones', inserted, updated, skipped: 0, errors: [] });

  const serviceConfigs = SERVICES.map((service: SourceServiceEntry) => ({
    serviceName: service.service_name,
    endpoint: service.endpoint,
    httpMethods: service.methods,
    parameters:
      service.parameters && typeof service.parameters === 'object'
        ? (service.parameters as Record<string, unknown>)
        : null,
    authentication: service.authentication ?? null,
    rateLimit: service.rate_limit ?? null,
    cadence: service.cadence ?? null,
    changeDetection: service.change_detection ?? null,
    statusPage: service.status_page ?? null,
    readiness: service.readiness ?? null,
    notes: service.notes ?? null,
    sourceUrl: null,
    verificationDate: VERSION
  }));
  await upsertDatasetServices(env, DATASET_ID, VERSION, serviceConfigs);

  await recordDatasetSnapshot(env, DATASET_ID, VERSION, {
    partners: PARTNERS,
    financial_assumptions: FINANCIAL_ASSUMPTIONS,
    capital_stack: CAPITAL_STACK,
    roadmap: ROADMAP,
    services: SERVICES
  });

  return {
    datasetId: DATASET_ID,
    version: VERSION,
    tables
  };
}
