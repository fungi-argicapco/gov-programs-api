import type { LoadEvent } from '@sveltejs/kit';
import {
  fetchPrograms,
  parseFilters,
  DEFAULT_SORT,
  type ProgramFilters,
  type ProgramListResponse
} from '$lib/api/programs';
import { getMockProgramsResponse } from '$lib/api/programs.mock';

type CapitalPageData = {
  filters: ProgramFilters;
  programs: ProgramListResponse;
  error: string | null;
};

export const load = async ({ fetch, url }: LoadEvent): Promise<CapitalPageData> => {
  const search = url.searchParams;
  const filters = parseFilters(search);

  if (!filters.country) {
    filters.country = 'US';
  }

  const appliedFilters: ProgramFilters = {
    ...filters,
    sort: filters.sort ?? DEFAULT_SORT
  };

  const useMockPrograms =
    import.meta.env?.VITE_MOCK_PROGRAMS === '1' || import.meta.env?.VITE_E2E_MOCK_PROGRAMS === '1';

  if (useMockPrograms) {
    return {
      filters: appliedFilters,
      programs: getMockProgramsResponse(),
      error: null
    };
  }

  try {
    const programs = await fetchPrograms(fetch, appliedFilters);
    return {
      filters: appliedFilters,
      programs,
      error: null
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load programs';
    return {
      filters: appliedFilters,
      programs: {
        data: [],
        meta: {
          total: 0,
          page: appliedFilters.page ?? 1,
          pageSize: appliedFilters.pageSize ?? 25
        }
      },
      error: message
    };
  }
};
