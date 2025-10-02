import { GOVERNMENT_PROGRAMS, type GovernmentProgramEntry } from './government_programs';
import { buildDatasetAutomation, recordDatasetSnapshot, upsertDatasetServices, type DatasetIngestSummary } from './utils';
import { upsertPrograms } from '../upsert';
import type { UpsertProgramRecord } from '../normalize';
import { stableStringify } from '../util/json';

export const GOVERNMENT_PROGRAMS_DATASET_ID = 'government_programs_iso3166';
export const GOVERNMENT_PROGRAMS_DATASET_VERSION = '2025-10-01';
const DATASET_ID = GOVERNMENT_PROGRAMS_DATASET_ID;
const VERSION = GOVERNMENT_PROGRAMS_DATASET_VERSION;

const COUNTRY_CODE_MAP: Record<string, string> = {
  US: 'US',
  CA: 'CA',
  GB: 'GB',
  FR: 'FR',
  PE: 'PE',
  SE: 'SE',
  LA: 'LA'
};

const AUTHORITY_MAP: Record<string, 'federal' | 'state' | 'prov' | 'territory' | 'regional' | 'municipal'> = {
  state: 'state',
  province: 'prov',
  territory: 'territory',
  region: 'regional',
  prefecture: 'regional',
  county: 'regional',
  district: 'regional',
  'council area': 'regional',
  department: 'regional',
  municipality: 'municipal',
  'municipal district': 'municipal',
  'unitary authority': 'regional',
  'metropolitan district': 'regional',
  'london borough': 'municipal',
  'city corporation': 'municipal'
};

const BENEFIT_TYPE_MAP: { keyword: string; type: 'grant' | 'loan' | 'rebate' | 'tax_credit' | 'guarantee' | 'voucher' | 'other' }[] = [
  { keyword: 'grant', type: 'grant' },
  { keyword: 'loan', type: 'loan' },
  { keyword: 'tax', type: 'tax_credit' },
  { keyword: 'guarantee', type: 'guarantee' },
  { keyword: 'voucher', type: 'voucher' }
];

function extractAdminCode(adminUnit: string): string {
  const match = adminUnit.match(/\(([^)]+)\)/);
  if (match?.[1]) return match[1];
  return adminUnit.split(' ').pop() ?? adminUnit;
}

function normalizeAuthority(level: string): 'federal' | 'state' | 'prov' | 'territory' | 'regional' | 'municipal' {
  const lookup = level.trim().toLowerCase();
  return AUTHORITY_MAP[lookup] ?? 'regional';
}

function determineBenefitType(programType: string): 'grant' | 'rebate' | 'tax_credit' | 'loan' | 'guarantee' | 'voucher' | 'other' {
  const lower = programType.toLowerCase();
  for (const candidate of BENEFIT_TYPE_MAP) {
    if (lower.includes(candidate.keyword)) {
      return candidate.type;
    }
  }
  return 'other';
}

function parseUrl(sources: string): string | undefined {
  if (!sources) return undefined;
  const parts = sources.split('|');
  for (const part of parts) {
    const trimmed = part.trim();
    const urlMatch = trimmed.match(/https?:[^\s]+/);
    if (urlMatch) {
      return urlMatch[0].replace(/[】】].*$/, '');
    }
    if (/^https?:/i.test(trimmed)) {
      return trimmed;
    }
  }
  return undefined;
}

function splitPipe(value: string): string[] {
  if (!value) return [];
  return value.split('|').map((item) => item.trim()).filter(Boolean);
}

function extractCountryCode(entry: GovernmentProgramEntry): string {
  const code = COUNTRY_CODE_MAP[entry.country] ?? entry.country;
  return code as string;
}

function buildProgramRecords(entry: GovernmentProgramEntry): UpsertProgramRecord {
  const jurisdictionCode = extractAdminCode(entry.admin_unit);
  const countryCode = extractCountryCode(entry);
  const benefitType = determineBenefitType(entry.program_type);
  const url = parseUrl(entry.verification_sources);
  const tags = new Set<string>();
  splitPipe(entry.program_focus).forEach((item) => tags.add(item));
  splitPipe(entry.related_STRATEGIC_STACK).forEach((item) => tags.add(item));
  splitPipe(entry.portfolio_fit).forEach((item) => tags.add(item));

  const applicationStatus = entry.application_window?.toLowerCase().includes('rolling') ? 'rolling' : 'open';
  const problemKeywords = splitPipe(entry.program_focus).join('|') || null;

  const esgFocus = entry.unsdg_alignment || null;

  const investorThesis = `Supports ${entry.program_focus || 'economic development'} at ${entry.admin_unit}.`;

  const record: UpsertProgramRecord = {
    adapter: 'dataset:government_programs',
    source_url: url,
    program: {
      country_code: countryCode as any,
      authority_level: normalizeAuthority(entry.admin_unit_level) as any,
      jurisdiction_code: jurisdictionCode,
      title: entry.program_name,
      summary: entry.program_description,
      benefit_type: benefitType,
      status: 'open',
      industry_codes: [],
      start_date: undefined,
      end_date: undefined,
      url,
      source_id: undefined,
      benefits: entry.funding_amount
        ? [
            {
              type: benefitType,
              notes: entry.funding_amount
            }
          ]
        : [],
      criteria: [],
      tags: Array.from(tags)
    }
  };

  record.raw = entry;
  return record;
}

function detectCurrency(value: string): string | null {
  const upper = value.toUpperCase();
  if (upper.includes('USD')) return 'USD';
  if (upper.includes('EUR')) return 'EUR';
  if (upper.includes('GBP') || upper.includes('£')) return 'GBP';
  if (upper.includes('SEK') || upper.includes('KRONA')) return 'SEK';
  if (upper.includes('CAD')) return 'CAD';
  if (upper.includes('PEN')) return 'PEN';
  if (upper.includes('LAK') || upper.includes('KIP')) return 'LAK';
  return null;
}

function computeAutomationMetadata(entry: GovernmentProgramEntry): string {
  return stableStringify({ dataset: DATASET_ID, version: VERSION, program: entry.program_name });
}

function applicationStatus(entry: GovernmentProgramEntry): string {
  if (!entry.application_window) return 'unknown';
  const lower = entry.application_window.toLowerCase();
  if (lower.includes('rolling')) return 'rolling';
  if (lower.includes('closed')) return 'closed';
  if (lower.includes('upcoming') || lower.includes('opens')) return 'upcoming';
  return 'open';
}

export async function ingestGovernmentProgramsDataset(env: { DB: D1Database; RAW_R2?: R2Bucket; LOOKUPS_KV?: KVNamespace }): Promise<DatasetIngestSummary> {
  const timestamp = Date.now();
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  const records: UpsertProgramRecord[] = [];

  for (const entry of GOVERNMENT_PROGRAMS) {
    const jurisdiction = extractAdminCode(entry.admin_unit);
    if (!jurisdiction) {
      skipped += 1;
      continue;
    }
    records.push(buildProgramRecords(entry));
  }

  const outcomes = await upsertPrograms(env, records, {});

  for (let i = 0; i < outcomes.length; i += 1) {
    const outcome = outcomes[i];
    if (outcome.status === 'inserted') inserted += 1;
    else if (outcome.status === 'updated') updated += 1;
    else skipped += 1;
    const entry = GOVERNMENT_PROGRAMS[i];
    if (!entry || !outcome.uid) continue;

    const status = applicationStatus(entry);
    const problemKeywords = splitPipe(entry.program_focus).join('|') || null;
    const automationMetadata = computeAutomationMetadata(entry);
    const fundingCurrency = detectCurrency(entry.funding_amount || '');

    await env.DB.prepare(
      `UPDATE programs SET
        program_category = ?,
        investor_thesis = ?,
        funding_currency = ?,
        funding_bracket = ?,
        application_status = ?,
        problem_keywords = ?,
        esg_focus = ?,
        verification_date = ?,
        data_refresh_frequency = ?,
        contact_channel = COALESCE(contact_channel, ?),
        notes_internal = ?,
        automation_ready = ?,
        api_endpoint = ?,
        api_parameters = ?,
        api_authentication = ?,
        api_rate_limit = ?,
        api_update_cadence = ?,
        api_change_detection = ?,
        api_status_page = ?,
        automation_metadata = ?
       WHERE uid = ?`
    )
      .bind(
        'government',
        `Program focuses on ${entry.program_focus || 'sustainable development'} in ${entry.admin_unit}.`,
        fundingCurrency,
        'Unknown',
        status,
        problemKeywords,
        entry.unsdg_alignment || null,
        entry.last_updated || VERSION,
        'annual',
        null,
        `Seeded from research dataset ${DATASET_ID}.`,
        'partial',
        'internal-dataset://government_programs',
        null,
        'none',
        'manual',
        'research cadence',
        'manual review',
        null,
        automationMetadata,
        outcome.uid
      )
      .run();
  }

  const services = [
    {
      serviceName: 'research_csv',
      endpoint: 'internal-dataset://government_programs',
      httpMethods: ['GET'],
      parameters: { file: 'programs_dataset.csv' },
      authentication: null,
      rateLimit: null,
      cadence: 'manual',
      changeDetection: 'manual review',
      statusPage: null,
      readiness: 'partial',
      notes: 'Manually curated research dataset of government partner programs.',
      sourceUrl: 'https://www.energy.gov/gdo/transmission-siting-and-economic-development-grants-program',
      verificationDate: VERSION
    }
  ];

  await upsertDatasetServices(env, DATASET_ID, VERSION, services);
  await recordDatasetSnapshot(env, DATASET_ID, VERSION, GOVERNMENT_PROGRAMS);

  return {
    datasetId: DATASET_ID,
    version: VERSION,
    tables: [
      {
        table: 'programs',
        inserted,
        updated,
        skipped,
        errors: []
      }
    ]
  };
}
