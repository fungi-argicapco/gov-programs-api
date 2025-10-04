import type { ProgramListResponse } from '$lib/api/programs'

export const mockProgramList: ProgramListResponse = {
  data: [
    {
      id: 1,
      uid: 'us-industrial-upgrade',
      country_code: 'US',
      authority_level: 'federal',
      jurisdiction_code: 'US',
      title: 'Industrial Decarbonization Upgrade',
      summary: 'Retrofit support for heavy industry corridors.',
      benefit_type: 'grant',
      status: 'open',
      start_date: '2025-01-01',
      end_date: '2025-06-30',
      url: 'https://energy.gov/decarbonization',
      source_id: 42,
      created_at: 1_700_000_000,
      updated_at: 1_700_050_000
    },
    {
      id: 2,
      uid: 'ca-green-housing',
      country_code: 'CA',
      authority_level: 'prov',
      jurisdiction_code: 'CA-ON',
      title: 'Green Housing Acceleration',
      summary: 'Supports deep retrofits for municipal housing portfolios.',
      benefit_type: 'loan',
      status: 'scheduled',
      start_date: '2025-07-01',
      end_date: '2025-12-15',
      url: 'https://infrastructure.ca/green-housing',
      source_id: 77,
      created_at: 1_700_100_000,
      updated_at: 1_700_120_000
    }
  ],
  meta: {
    total: 2,
    page: 1,
    pageSize: 25
  }
}
