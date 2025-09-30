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
  const normalized = row?.opportunity ?? row;
  const title =
    normalized?.title ?? normalized?.OpportunityTitle ?? normalized?.synopsisTitle ?? 'Untitled Grant';
  const synopsis =
    normalized?.description ?? normalized?.Synopsis ?? normalized?.synopsisDesc ?? normalized?.synopsis ?? '';
  const open = dateSafe(normalized?.openDate ?? normalized?.PostDate ?? normalized?.postDate);
  const close = dateSafe(normalized?.closeDate ?? normalized?.CloseDate ?? normalized?.closeDate);
  const opportunityNumber =
    normalized?.opportunityNumber ?? normalized?.OpportunityNumber ?? normalized?.oppNum ?? normalized?.id;
  const url =
    normalized?.url ??
    (opportunityNumber ? `https://www.grants.gov/search-results-detail/${opportunityNumber}` : undefined);
  const categories = Array.isArray(normalized?.category)
    ? normalized.category
    : normalized?.Category
      ? [normalized.Category]
      : Array.isArray(normalized?.categories)
        ? normalized.categories
        : undefined;
  const eligibility = Array.isArray(normalized?.eligibilityCategory)
    ? normalized.eligibilityCategory
    : Array.isArray(normalized?.eligibility)
      ? normalized.eligibility
      : undefined;
  return {
    title,
    summary: synopsis || undefined,
    url,
    start_date: open,
    end_date: close,
    benefit_type: 'grant',
    status: classifyGrantStatus(open, close),
    tags: categories?.map(String).filter(Boolean),
    criteria:
      eligibility?.map?.((cat: string) => ({ kind: 'eligibility', operator: 'matches', value: String(cat) })) ?? []
  };
}

export function mapSamAssistance(row: any): MapperResult {
  const descriptor = row?.matchedObjectDescriptor ?? row;
  const title =
    descriptor?.title ?? descriptor?.assistanceListingTitle ?? row?.title ?? 'SAM Assistance Listing';
  const summary =
    descriptor?.summary ??
    descriptor?.assistanceListingDescription ??
    descriptor?.description ??
    row?.summary ??
    row?.description ??
    undefined;
  const listingNumber =
    descriptor?.assistanceListingNumber ?? descriptor?.listingNumber ?? row?.assistanceListingNumber ?? row?.listingNumber;
  const url =
    descriptor?.uri ??
    descriptor?.landingPage ??
    descriptor?.link ??
    row?.uri ??
    row?.landingPage ??
    (listingNumber ? `https://sam.gov/fal/${listingNumber}` : undefined);
  const tags = descriptor?.businessCategories ?? row?.businessCategories ?? [];
  const applicants = descriptor?.applicantTypes ?? descriptor?.applicantType ?? row?.applicantTypes ?? [];
  return {
    title,
    summary,
    url,
    status: 'open',
    benefit_type: 'grant',
    tags: Array.isArray(tags) ? tags.map(String).filter(Boolean) : typeof tags === 'string' ? [tags] : [],
    criteria: (Array.isArray(applicants) ? applicants : typeof applicants === 'string' ? [applicants] : [])
      .map((type: string) => ({ kind: 'applicant_type', operator: 'eq', value: String(type) }))
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
