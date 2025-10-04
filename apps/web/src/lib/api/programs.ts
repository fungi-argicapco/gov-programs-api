export type ProgramListItem = {
  id: number;
  uid: string;
  country_code: string;
  authority_level: string;
  jurisdiction_code: string | null;
  title: string;
  summary: string | null;
  benefit_type: ApiBenefitType | null;
  status: ApiProgramStatus;
  start_date: string | null;
  end_date: string | null;
  url: string | null;
  source_id: number | null;
  created_at: number;
  updated_at: number;
};

export type ProgramListResponse = {
  data: ProgramListItem[];
  meta: {
    total: number;
    page: number;
    pageSize: number;
  };
};

export type ApiBenefitType =
  | 'grant'
  | 'rebate'
  | 'tax_credit'
  | 'loan'
  | 'guarantee'
  | 'voucher'
  | 'other';

export type ApiProgramStatus = 'open' | 'scheduled' | 'closed' | 'unknown';

export type ProgramFilters = {
  q?: string;
  country?: string;
  benefitTypes?: string[];
  statuses?: string[];
  from?: string;
  to?: string;
  sort?: string;
  page?: number;
  pageSize?: number;
};

export const DEFAULT_PAGE_SIZE = 25;
export const DEFAULT_SORT = '-updated_at';

export function buildProgramsQuery(filters: ProgramFilters): URLSearchParams {
  const params = new URLSearchParams();

  if (filters.q?.trim()) {
    params.set('q', filters.q.trim());
  }

  if (filters.country) {
    params.set('country', filters.country);
  }

  for (const benefit of filters.benefitTypes ?? []) {
    if (benefit) params.append('benefit_type[]', benefit);
  }

  for (const status of filters.statuses ?? []) {
    if (status) params.append('status[]', status);
  }

  if (filters.from) {
    params.set('from', filters.from);
  }

  if (filters.to) {
    params.set('to', filters.to);
  }

  params.set('sort', filters.sort ?? DEFAULT_SORT);
  params.set('page', String(filters.page ?? 1));
  params.set('page_size', String(filters.pageSize ?? DEFAULT_PAGE_SIZE));

  return params;
}

export async function fetchPrograms(
  fetchFn: typeof fetch,
  filters: ProgramFilters
): Promise<ProgramListResponse> {
  const query = buildProgramsQuery(filters);
  const response = await fetchFn(`/v1/programs?${query.toString()}`);

  if (!response.ok) {
    const message = await safeErrorMessage(response);
    throw new Error(message ?? `Failed to load programs (${response.status})`);
  }

  const payload = (await response.json()) as ProgramListResponse;
  return payload;
}

async function safeErrorMessage(res: Response): Promise<string | null> {
  try {
    const body = (await res.json()) as unknown;
    if (body && typeof body === 'object' && body !== null && 'error' in body) {
      const message = (body as { error?: unknown }).error;
      if (typeof message === 'string') {
        return message;
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function parseFilters(search: URLSearchParams): ProgramFilters {
  const benefitTypes = search.getAll('benefit_type[]').filter(Boolean);
  const statuses = search.getAll('status[]').filter(Boolean);

  const pageParam = Number(search.get('page'));
  const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;

  const pageSizeParam = Number(search.get('page_size'));
  const pageSize = Number.isFinite(pageSizeParam) && pageSizeParam > 0 ? pageSizeParam : DEFAULT_PAGE_SIZE;

  return {
    q: search.get('q') ?? undefined,
    country: search.get('country') ?? undefined,
    benefitTypes,
    statuses,
    from: search.get('from') ?? undefined,
    to: search.get('to') ?? undefined,
    sort: search.get('sort') ?? DEFAULT_SORT,
    page,
    pageSize
  };
}
