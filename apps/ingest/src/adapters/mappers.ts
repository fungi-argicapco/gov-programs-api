import { differenceInCalendarDays, parseISO } from 'date-fns';

type MapperResult = {
  title: string;
  summary?: string;
  url?: string;
  status?: 'open' | 'scheduled' | 'closed' | 'unknown';
  benefit_type?: 'grant' | 'rebate' | 'tax_credit' | 'loan' | 'guarantee' | 'voucher' | 'other';
  industry_codes?: string[];
  start_date?: string;
  end_date?: string;
  tags?: string[];
  criteria?: { kind: string; operator: string; value: string }[];
};

const dateSafe = (value?: string | null) => {
  if (!value) return undefined;
  try {
    return parseISO(value).toISOString().slice(0, 10);
  } catch {
    const trimmed = value.slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : undefined;
  }
};

const classifyGrantStatus = (openDate?: string, closeDate?: string): MapperResult['status'] => {
  const now = new Date();
  if (closeDate) {
    const close = new Date(closeDate);
    if (close.getTime() < now.getTime()) return 'closed';
    if (differenceInCalendarDays(close, now) > 0) return 'open';
  }
  if (openDate) {
    const open = new Date(openDate);
    if (open.getTime() > now.getTime()) return 'scheduled';
  }
  return 'unknown';
};

export function mapGrantsGov(row: any): MapperResult {
  const title = row?.title ?? row?.OpportunityTitle ?? 'Untitled Grant';
  const synopsis = row?.description ?? row?.Synopsis ?? '';
  const open = dateSafe(row?.openDate ?? row?.PostDate);
  const close = dateSafe(row?.closeDate ?? row?.CloseDate);
  const opportunityNumber = row?.opportunityNumber ?? row?.OpportunityNumber;
  const url = row?.url ??
    (opportunityNumber ? `https://www.grants.gov/search-results-detail/${opportunityNumber}` : undefined);
  return {
    title,
    summary: synopsis || undefined,
    url,
    start_date: open,
    end_date: close,
    benefit_type: 'grant',
    status: classifyGrantStatus(open, close),
    tags: Array.isArray(row?.category) ? row.category : row?.Category ? [row.Category] : undefined,
    criteria: row?.eligibilityCategory?.map?.((cat: string) => ({ kind: 'eligibility', operator: 'matches', value: cat })) ?? []
  };
}

export function mapSamAssistance(row: any): MapperResult {
  const title = row?.title ?? row?.assistanceListingTitle ?? 'SAM Assistance Listing';
  const summary = row?.summary ?? row?.assistanceListingDescription ?? row?.description ?? undefined;
  const listingNumber = row?.assistanceListingNumber ?? row?.listingNumber;
  const url = row?.uri ?? row?.landingPage ??
    (listingNumber ? `https://sam.gov/fal/${listingNumber}` : undefined);
  return {
    title,
    summary,
    url,
    status: 'open',
    benefit_type: 'grant',
    tags: row?.businessCategories ?? [],
    criteria: (row?.applicantTypes ?? []).map((type: string) => ({ kind: 'applicant_type', operator: 'eq', value: type }))
  };
}

const pickCkanUrl = (resources: any[]): string | undefined => {
  if (!Array.isArray(resources)) return undefined;
  const preferred = resources.find((r) => typeof r?.url === 'string' && /html|htm/.test(String(r.format ?? '').toLowerCase()));
  if (preferred?.url) return preferred.url;
  const dataset = resources.find((r) => typeof r?.url === 'string');
  return dataset?.url;
};

export function mapCkanGC(row: any): MapperResult {
  const pkg = row?.package ?? row;
  const title = pkg?.title ?? 'Government of Canada Program';
  const summary = pkg?.notes ?? pkg?.description ?? undefined;
  const url = pickCkanUrl(pkg?.resources ?? []);
  return {
    title,
    summary,
    url,
    status: 'open',
    benefit_type: 'grant',
    tags: pkg?.tags?.map?.((t: any) => (typeof t === 'string' ? t : t?.name)).filter(Boolean)
  };
}

export function mapCkanProvON(row: any): MapperResult {
  const pkg = row?.package ?? row;
  const title = pkg?.title ?? 'Ontario Program';
  const summary = pkg?.notes ?? pkg?.description ?? undefined;
  const url = pickCkanUrl(pkg?.resources ?? []);
  return {
    title,
    summary,
    url,
    status: 'open',
    benefit_type: 'grant',
    tags: pkg?.tags?.map?.((t: any) => (typeof t === 'string' ? t : t?.name)).filter(Boolean)
  };
}

export const MAPPERS: Record<string, (row: any) => MapperResult> = {
  mapGrantsGov,
  mapSamAssistance,
  mapCkanGC,
  mapCkanProvON
};
