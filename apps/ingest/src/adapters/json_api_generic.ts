import { Program, type Adapter, type AdapterContext, type AdapterResult, type ProgramT } from '@common/types';

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const STATUS_VALUES: ReadonlySet<ProgramT['status']> = new Set(['open', 'scheduled', 'closed', 'unknown']);
const BENEFIT_VALUES: ReadonlySet<NonNullable<ProgramT['benefitType']>> = new Set([
  'grant',
  'rebate',
  'tax_credit',
  'loan',
  'guarantee',
  'voucher',
  'other'
]);

const normalizeStatus = (value: unknown): ProgramT['status'] | undefined => {
  if (typeof value !== 'string') return undefined;
  const normalized = value.toLowerCase();
  return STATUS_VALUES.has(normalized as ProgramT['status']) ? (normalized as ProgramT['status']) : undefined;
};

const normalizeBenefitType = (value: unknown): ProgramT['benefitType'] | undefined => {
  if (typeof value !== 'string') return undefined;
  const normalized = value.toLowerCase();
  return BENEFIT_VALUES.has(normalized as NonNullable<ProgramT['benefitType']>)
    ? (normalized as ProgramT['benefitType'])
    : undefined;
};

const normalizeArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map((item) => `${item}`.trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value.split(',').map((item) => item.trim()).filter(Boolean);
  }
  return [];
};

const normalizePrograms = (payload: unknown): Record<string, unknown>[] => {
  if (Array.isArray(payload)) {
    return payload as Record<string, unknown>[];
  }
  if (typeof payload === 'object' && payload !== null) {
    const obj = payload as Record<string, unknown>;
    if (Array.isArray(obj.items)) return obj.items as Record<string, unknown>[];
    if (Array.isArray(obj.results)) return obj.results as Record<string, unknown>[];
    if (Array.isArray(obj.data)) return obj.data as Record<string, unknown>[];
  }
  return [];
};

const execute = async (sourceUrl: string, context: AdapterContext): Promise<AdapterResult> => {
  const response = await context.fetch(sourceUrl, { headers: { accept: 'application/json' } });
  const json = await response.json();
  const candidates = normalizePrograms(json);
  const programs: ProgramT[] = [];

  for (const item of candidates) {
    const tags = normalizeArray(item.tags ?? item.labels ?? item.categories).map((label) => ({
      id: crypto.randomUUID(),
      slug: label.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      label
    }));

    const program = Program.safeParse({
      id:
        typeof item.id === 'string' && UUID_REGEX.test(item.id)
          ? item.id
          : crypto.randomUUID(),
      title: String(item.title ?? item.name ?? 'Untitled program'),
      summary: item.summary ?? item.description,
      websiteUrl: item.url ?? item.website,
      sourceId: typeof item.sourceId === 'string' ? item.sourceId : undefined,
      sourceName: typeof item.sourceName === 'string' ? item.sourceName : undefined,
      sourceUrl: typeof item.sourceUrl === 'string' ? item.sourceUrl : undefined,
      stateCode: typeof item.stateCode === 'string' ? item.stateCode : undefined,
      startDate: typeof item.startDate === 'string' ? item.startDate : undefined,
      endDate: typeof item.endDate === 'string' ? item.endDate : undefined,
      benefitType: normalizeBenefitType(item.benefitType),
      status: normalizeStatus(item.status),
      industries: normalizeArray(item.industries ?? item.naics ?? []),
      tags
    });

    if (program.success) {
      programs.push(program.data);
    }
  }

  return { programs, raw: json };
};

export const jsonApiGenericAdapter: Adapter = {
  name: 'json_api_generic',
  supports: (url: string) => url.startsWith('http'),
  execute
};

export default jsonApiGenericAdapter;
