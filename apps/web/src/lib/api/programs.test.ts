import { describe, expect, it, vi } from 'vitest';
import { buildProgramsQuery, parseFilters, fetchPrograms, DEFAULT_SORT } from './programs';

const sampleResponse = {
  data: [
    {
      id: 1,
      uid: 'prog-1',
      country_code: 'US',
      authority_level: 'federal',
      jurisdiction_code: 'US',
      title: 'Sample Program',
      summary: 'Example summary',
      benefit_type: 'grant',
      status: 'open',
      start_date: '2025-01-01',
      end_date: '2025-03-31',
      url: 'https://example.com/program',
      source_id: 10,
      created_at: 1_700_000_000,
      updated_at: 1_700_100_000
    }
  ],
  meta: {
    total: 1,
    page: 1,
    pageSize: 25
  }
};

describe('programs api helpers', () => {
  it('builds query strings with arrays and defaults', () => {
    const query = buildProgramsQuery({
      q: 'energy',
      country: 'US',
      benefitTypes: ['grant', 'loan'],
      statuses: ['open'],
      from: '2025-01-01',
      to: '2025-12-31',
      sort: 'title',
      page: 2,
      pageSize: 50
    });

    expect(query.get('q')).toBe('energy');
    expect(query.get('country')).toBe('US');
    expect(query.getAll('benefit_type[]')).toEqual(['grant', 'loan']);
    expect(query.getAll('status[]')).toEqual(['open']);
    expect(query.get('from')).toBe('2025-01-01');
    expect(query.get('to')).toBe('2025-12-31');
    expect(query.get('sort')).toBe('title');
    expect(query.get('page')).toBe('2');
    expect(query.get('page_size')).toBe('50');
  });

  it('ensures defaults when filters omitted', () => {
    const query = buildProgramsQuery({});
    expect(query.get('sort')).toBe(DEFAULT_SORT);
    expect(query.get('page')).toBe('1');
    expect(query.get('page_size')).toBe('25');
  });

  it('parses filters from URLSearchParams', () => {
    const params = new URLSearchParams(
      'q=climate&country=CA&benefit_type[]=grant&benefit_type[]=loan&status[]=open&from=2025-04-01&sort=title&page=2&page_size=10'
    );
    const filters = parseFilters(params);

    expect(filters.q).toBe('climate');
    expect(filters.country).toBe('CA');
    expect(filters.benefitTypes).toEqual(['grant', 'loan']);
    expect(filters.statuses).toEqual(['open']);
    expect(filters.from).toBe('2025-04-01');
    expect(filters.sort).toBe('title');
    expect(filters.page).toBe(2);
    expect(filters.pageSize).toBe(10);
  });

  it('fetches programs via provided fetch implementation', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(sampleResponse)
    });

    const result = await fetchPrograms(mockFetch as unknown as typeof fetch, { q: 'grid' });

    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/v1/programs?'));
    expect(result.data[0].title).toBe('Sample Program');
  });

  it('throws descriptive error when fetch fails', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'Internal error' })
    });

    await expect(fetchPrograms(mockFetch as unknown as typeof fetch, {})).rejects.toThrow('Internal error');
  });
});
